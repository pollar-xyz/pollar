'use client';

import { fromBaseUnits, toBaseUnits, WalletBalanceRecord, WalletChain } from '@pollar/core';
import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { walletNotReadyReason } from '../../lib/wallet-provisioning';
import { useChains } from '../../useChains';
import { byCode, oneOf, seededAmount, useSuccessReport } from '../../modal-options';
import { resolveChain } from '../ChainSelect';
import '../shared.css';
import '../transaction-modal/TransactionModal.css';
import './SendModal.css';
import { SEND_COPY } from './send-copy';
import { SendModalTemplate, type SendMemoType } from './SendModalTemplate';
import { modalChrome } from '../modal-theme';

/** Where the send modal opens: a starting point the user can change. An option the wallet cannot use is left out. */
export interface SendModalOptions {
  chain?: WalletChain;
  /** Asset code, e.g. 'USDC'. */
  asset?: string;
  destination?: string;
  amount?: string;
  memo?: string;
  memoType?: SendMemoType;
  /** Called once the payment lands, with its transaction hash. */
  onSuccess?: (result: { hash: string }) => void;
}

interface SendModalProps {
  onClose: () => void;
  initial?: SendModalOptions | undefined;
}

const MAX_MEMO_ID = 18446744073709551615n;

// A self-paid SOL send needs the fee on top of the amount: 5000 lamports per
// signature plus the priority fee. Max leaves this much behind.
const SOLANA_FEE_MARGIN_LAMPORTS = 10_000n;

/** The most a native SOL send can move out of `available` (decimal SOL) once the fee is left behind. */
function solanaMaxAfterFee(available: string): string {
  const lamports = BigInt(toBaseUnits(available, 9)) - SOLANA_FEE_MARGIN_LAMPORTS;
  return fromBaseUnits((lamports > 0n ? lamports : 0n).toString(), 9);
}

/** A Stellar memo as the build endpoint takes it, undefined when the field is
 *  empty, or an error string the form shows. Text is capped at 28 BYTES on-chain
 *  (a multibyte character counts more than once); an ID is an unsigned 64-bit
 *  integer; a hash is 32 bytes written as 64 hex characters. */
function parseMemo(
  type: SendMemoType,
  raw: string,
  errors: (typeof SEND_COPY)['en']['errors'],
): { type: SendMemoType; value: string } | undefined | string {
  const value = type === 'text' ? raw : raw.trim();
  if (value.trim() === '') return undefined;
  if (type === 'text') {
    return new TextEncoder().encode(value).length > 28 ? errors.memoTextTooLong : { type, value };
  }
  if (type === 'hash') {
    return /^[0-9a-fA-F]{64}$/.test(value) ? { type, value } : errors.memoHashInvalid;
  }
  if (!/^\d+$/.test(value) || BigInt(value) > MAX_MEMO_ID) return errors.memoIdInvalid;
  return { type, value };
}

/** The least a new Stellar account can start with: two base reserves of 0.5 XLM. */
const MIN_STARTING_BALANCE_XLM = 1;

function assetParam(record: WalletBalanceRecord) {
  if (record.type === 'native') return { type: 'native' as const };
  if (record.type === 'credit_alphanum4') {
    return { type: 'credit_alphanum4' as const, code: record.code, issuer: record.issuer! };
  }
  return { type: 'credit_alphanum12' as const, code: record.code, issuer: record.issuer! };
}

export function SendModal({ onClose, initial }: SendModalProps) {
  const {
    walletBalance,
    refreshWalletBalance,
    buildTx,
    sendPayment,
    signAndSubmitTx,
    tx: transaction,
    wallet,
    network,
    styles,
    getClient,
  } = usePollar();
  // External-wallet signing-adapter id (freighter/albedo) drives the wallet logo;
  // null for embedded/smart, which fall back to the Pollar logo.
  const walletType = wallet?.custody === 'external' ? wallet.provider : null;
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const language = useModalLanguage();
  const copy = SEND_COPY[language];

  const [step, setStep] = useState<'form' | 'create-account' | 'tx'>('form');
  // The destination had no Stellar account, so the tx being built creates it.
  const [createsAccount, setCreatesAccount] = useState(false);
  const [checkingDestination, setCheckingDestination] = useState(false);
  const [amount, setAmount] = useState(() => seededAmount(initial?.amount));
  const [destination, setDestination] = useState(() => initial?.destination?.trim() ?? '');
  const [memo, setMemo] = useState(() => initial?.memo ?? '');
  const [memoType, setMemoType] = useState<SendMemoType>(
    () => oneOf<SendMemoType>(['text', 'id', 'hash'], initial?.memoType) ?? 'text',
  );
  // The asset option, used on the first pick only: a network the user switches to starts on its first asset.
  const assetSeed = useRef(initial?.asset);
  const [selectedAsset, setSelectedAsset] = useState<WalletBalanceRecord | null>(null);
  const [showXdr, setShowXdr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { chains } = useChains();
  const [selectedChain, setSelectedChain] = useState<WalletChain | null>(null);
  // Default to the app's first configured network. Runs as an effect because
  // `wallets` is empty on the first render of a cold-start session.
  useEffect(() => {
    if (selectedChain === null && chains.length > 0) setSelectedChain(oneOf(chains, initial?.chain) ?? chains[0]!);
  }, [chains, selectedChain, initial?.chain]);

  const canSendOnChain = selectedChain === 'STELLAR' || selectedChain === 'SOLANA' || selectedChain === 'POLYGON';
  // A Stellar account still being created cannot source a payment: every
  // operation would come back `op_no_source_account`. The server refuses these
  // with SDK_WALLET_NOT_READY anyway - saying so here turns that into something
  // the user can act on (wait) instead of a failed transaction.
  const notReadyReason = walletNotReadyReason(wallet, selectedChain, language);
  // Solana and Polygon amounts are integer base units (lamports / wei / token
  // units), not decimals.
  const isBaseUnitChain = selectedChain === 'SOLANA' || selectedChain === 'POLYGON';
  // Native SOL has 9 decimals, native POL 18.
  const nativeDecimals = selectedChain === 'POLYGON' ? 18 : 9;

  useEffect(() => {
    void refreshWalletBalance();
  }, [refreshWalletBalance]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const balanceData = walletBalance.step === 'loaded' ? walletBalance.data : null;
  // Only the picked network's assets. The backend returns every chain in one
  // payload, so this is a local filter - switching networks costs no request.
  const allAssets = (balanceData?.balances ?? []).filter((b) => resolveChain(b.chain) === selectedChain);
  // App assets first, then native XLM (always, even at 0, so the user knows to
  // fund) and any other non-app asset the wallet actually holds.
  const sortedAssets = [
    ...allAssets.filter((b) => b.enabledInApp),
    // An unreadable balance (null) is not a positive one, so it stays out.
    ...allAssets.filter((b) => !b.enabledInApp && (b.type === 'native' || parseFloat(b.balance ?? '0') > 0)),
  ];

  // Auto-select the first asset once balances load (no "Select asset" step).
  // Switching networks strands the previous chain's asset, so it is dropped and
  // re-picked here rather than leaving a selection the form can't spend.
  useEffect(() => {
    const stranded = selectedAsset !== null && resolveChain(selectedAsset.chain) !== selectedChain;
    if (stranded) {
      setSelectedAsset(sortedAssets[0] ?? null);
      return;
    }
    if (!selectedAsset && sortedAssets.length > 0) {
      setSelectedAsset(byCode(sortedAssets, assetSeed.current) ?? sortedAssets[0]!);
      assetSeed.current = undefined;
    }
  }, [sortedAssets, selectedAsset, selectedChain]);

  const hash = transaction.step === 'success' ? transaction.hash : null;
  useSuccessReport(transaction, step === 'tx', initial?.onSuccess);
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const explorerNetwork = buildData?.summary.network?.toLowerCase().includes('testnet')
    ? 'testnet'
    : buildData
      ? 'public'
      : network === 'testnet'
        ? 'testnet'
        : 'public';
  // Each chain has its own explorer, and its own way of saying "testnet".
  const explorerUrl = !hash
    ? null
    : selectedChain === 'SOLANA'
      ? `https://explorer.solana.com/tx/${hash}${explorerNetwork === 'testnet' ? '?cluster=devnet' : ''}`
      : selectedChain === 'POLYGON'
        ? `https://${explorerNetwork === 'testnet' ? 'amoy.' : ''}polygonscan.com/tx/${hash}`
        : `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}`;

  const IN_FLIGHT_STEPS = [
    'building',
    'signing',
    'submitting',
    'submitted',
    'signing-submitting',
    'building-signing-submitting',
  ] as const;
  const isInProgress = (IN_FLIGHT_STEPS as readonly string[]).includes(transaction.step);
  const showBack =
    step === 'create-account' ||
    (step === 'tx' && (transaction.step === 'error' || transaction.step === 'success') && !isInProgress);

  const txTitle = createsAccount
    ? isInProgress
      ? copy.tx.creatingAccount
      : transaction.step === 'success'
        ? copy.tx.accountCreated
        : transaction.step === 'error'
          ? copy.tx.createAccountFailed
          : copy.tx.confirmCreateAccount
    : isInProgress
      ? copy.tx.sending
      : transaction.step === 'success'
        ? copy.tx.sent
        : transaction.step === 'error'
          ? copy.tx.sendFailed
          : copy.tx.confirmSend;

  /** Whether `address` has a Stellar account; null when that could not be read. */
  async function stellarAccountExists(address: string): Promise<boolean | null> {
    try {
      return (await getClient().getWalletBalance(address)).exists;
    } catch {
      return null;
    }
  }

  async function handleSubmit() {
    setFormError('');
    if (!canSendOnChain) {
      setFormError(copy.sendingUnavailable);
      return;
    }
    if (notReadyReason) {
      setFormError(notReadyReason);
      return;
    }
    if (!selectedAsset) {
      setFormError(copy.errors.selectAsset);
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setFormError(copy.errors.invalidAmount);
      return;
    }
    // A null `available` means the chain could not be read, so it floors to 0 and
    // blocks the send: never let an unreadable balance pass as "enough".
    if (parsed > parseFloat(selectedAsset.available ?? '0')) {
      setFormError(copy.errors.insufficientBalance);
      return;
    }
    if (!destination.trim()) {
      setFormError(copy.errors.enterDestination);
      return;
    }
    const parsedMemo = selectedChain === 'STELLAR' ? parseMemo(memoType, memo, copy.errors) : undefined;
    if (typeof parsedMemo === 'string') {
      setFormError(parsedMemo);
      return;
    }

    // A non-native asset needs BOTH its on-chain id (the SPL mint or ERC-20
    // contract, carried in `issuer`) and its own `decimals`, and neither has a
    // safe default: without the id the payload below drops to a native transfer,
    // so a USDC send would move SOL or POL instead, and the native fallback would
    // multiply a 6-decimal token by 1000 or more. The backend always sends both,
    // so this only fires on malformed data - but it fails the send rather than
    // sending the wrong thing.
    const isNativeAsset = selectedAsset.type === 'native';
    if (isBaseUnitChain && !isNativeAsset && (!selectedAsset.issuer || selectedAsset.decimals === undefined)) {
      setFormError(copy.errors.tokenIncomplete);
      return;
    }

    // Solana and Polygon take integer base units while the form (like the balance
    // above it) is in decimals, so convert before sending - with the asset's own
    // decimals, and via strings so an 18-decimal amount is not rounded by a float.
    // The fallback is the native coin's decimals, reached only on the native row
    // (the guard above rejects any other asset that lacks `decimals`).
    let sendAmount = amount;
    if (isBaseUnitChain) {
      try {
        sendAmount = toBaseUnits(amount, selectedAsset.decimals ?? nativeDecimals);
      } catch (e) {
        setFormError(e instanceof Error ? e.message : copy.errors.amountUnreadable);
        return;
      }
    }

    // A payment to a Stellar address with no account fails on-chain
    // (`paymentNoDestination`), so the user picks between creating it and waiting.
    // An unreadable lookup sends the payment as asked.
    if (selectedChain === 'STELLAR') {
      setCheckingDestination(true);
      const exists = await stellarAccountExists(destination.trim());
      setCheckingDestination(false);
      if (exists === false) {
        setStep('create-account');
        return;
      }
    }

    setCreatesAccount(false);
    setStep('tx');

    if (selectedChain === 'SOLANA' || selectedChain === 'POLYGON') {
      await sendPayment({
        chain: selectedChain,
        destination: destination.trim(),
        amount: sendAmount,
        // A native coin carries no token id; an SPL mint or ERC-20 contract rides
        // in `issuer`, which the guard above proved is present.
        ...(isNativeAsset ? {} : { mint: selectedAsset.issuer }),
      });
      return;
    }

    await buildTx(
      'payment',
      { destination: destination.trim(), amount, asset: assetParam(selectedAsset) },
      parsedMemo ? { memo: parsedMemo } : undefined,
    );
  }

  async function handleCreateAccount() {
    const parsedMemo = parseMemo(memoType, memo, copy.errors);
    if (typeof parsedMemo === 'string' || parseFloat(amount) < MIN_STARTING_BALANCE_XLM) return;
    setCreatesAccount(true);
    setStep('tx');
    await buildTx(
      'create_account',
      { destination: destination.trim(), startingBalance: amount },
      parsedMemo ? { memo: parsedMemo } : undefined,
    );
  }

  function handleSignAndSend() {
    if (transaction.step === 'built') {
      void signAndSubmitTx(transaction.buildData.unsignedXdr);
    }
  }

  function handleMax() {
    if (selectedAsset?.available !== null && selectedAsset?.available !== undefined) {
      const paysOwnSolFee = selectedChain === 'SOLANA' && selectedAsset.type === 'native' && selectedAsset.sponsored !== true;
      let max = selectedAsset.available;
      if (paysOwnSolFee) {
        try {
          max = solanaMaxAfterFee(selectedAsset.available);
        } catch {
          // Not a readable SOL amount: the submit check reports it.
        }
      }
      setAmount(max);
      setFormError('');
    }
  }

  async function handlePaste() {
    if (!navigator.clipboard?.readText) {
      setFormError(copy.errors.clipboardUnavailable);
      return;
    }

    try {
      const value = (await navigator.clipboard.readText()).trim();
      if (!value) {
        setFormError(copy.errors.clipboardEmpty);
        return;
      }
      setDestination(value);
      setFormError('');
    } catch {
      setFormError(copy.errors.clipboardFailed);
    }
  }

  function handleCopyHash() {
    if (!hash) return;
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopied(false);
      }, 2000);
    });
  }

  async function handleRetry() {
    if (transaction.step === 'error' && transaction.buildData) {
      await signAndSubmitTx(transaction.buildData.unsignedXdr);
    }
  }

  function handleBack() {
    setStep('form');
    setCreatesAccount(false);
    setShowXdr(false);
    setCopied(false);
  }

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={!isInProgress ? onClose : undefined}>
      <SendModalTemplate
        theme={theme}
        accentColor={accentColor}
        styleOverrides={styleOverrides}
        step={step}
        txTitle={txTitle}
        assets={sortedAssets}
        selectedAsset={selectedAsset}
        chains={chains}
        selectedChain={selectedChain}
        canSendOnChain={canSendOnChain}
        notReadyReason={notReadyReason}
        onSelectChain={setSelectedChain}
        amount={amount}
        destination={destination}
        formError={formError}
        isLoadingBalance={walletBalance.step === 'loading'}
        isCheckingDestination={checkingDestination}
        minStartingBalance={MIN_STARTING_BALANCE_XLM}
        onCreateAccount={() => void handleCreateAccount()}
        transaction={transaction}
        showXdr={showXdr}
        copied={copied}
        explorerUrl={explorerUrl}
        walletType={walletType}
        showBack={showBack}
        isInProgress={isInProgress}
        onClose={onClose}
        onBack={handleBack}
        onRefresh={() => void refreshWalletBalance()}
        onSelectAsset={setSelectedAsset}
        onAmountChange={setAmount}
        onMax={handleMax}
        onPaste={handlePaste}
        onDestinationChange={setDestination}
        memo={memo}
        memoType={memoType}
        onMemoChange={setMemo}
        onMemoTypeChange={setMemoType}
        onSubmit={() => void handleSubmit()}
        onSignAndSend={handleSignAndSend}
        onToggleXdr={() => setShowXdr((v) => !v)}
        onCopyHash={handleCopyHash}
        onRetry={() => void handleRetry()}
        onDone={onClose}
        language={language}
      />
    </div>
  );
}
