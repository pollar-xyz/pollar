'use client';

import { WalletBalanceRecord, WalletChain } from '@pollar/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { addressForChain, chainsOf, resolveChain } from '../ChainSelect';
import '../shared.css';
import '../transaction-modal/TransactionModal.css';
import './SendModal.css';
import { SendModalTemplate } from './SendModalTemplate';

interface SendModalProps {
  onClose: () => void;
}

function assetParam(record: WalletBalanceRecord) {
  if (record.type === 'native') return { type: 'native' as const };
  if (record.type === 'credit_alphanum4') {
    return { type: 'credit_alphanum4' as const, code: record.code, issuer: record.issuer! };
  }
  return { type: 'credit_alphanum12' as const, code: record.code, issuer: record.issuer! };
}

export function SendModal({ onClose }: SendModalProps) {
  const {
    walletBalance,
    refreshWalletBalance,
    buildTx,
    signAndSubmitTx,
    tx: transaction,
    wallet,
    wallets,
    network,
    styles,
  } = usePollar();
  // External-wallet signing-adapter id (freighter/albedo) drives the wallet logo;
  // null for custodial/smart, which fall back to the Pollar logo.
  const walletType = wallet?.custody === 'external' ? wallet.provider : null;
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const [step, setStep] = useState<'form' | 'tx'>('form');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<WalletBalanceRecord | null>(null);
  const [showXdr, setShowXdr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chains = useMemo(() => chainsOf(wallets), [wallets]);
  const [selectedChain, setSelectedChain] = useState<WalletChain | null>(null);
  // Default to the first network the user holds a wallet on. Runs as an effect
  // because `wallets` is empty on the first render of a cold-start session.
  useEffect(() => {
    if (selectedChain === null && chains.length > 0) setSelectedChain(chains[0]!);
  }, [chains, selectedChain]);

  const walletAddress = addressForChain(wallets, selectedChain);
  // The payment pipeline (buildTx + the Stellar asset param below) is
  // Stellar-only, so a non-Stellar network can be browsed but not sent from.
  const canSendOnChain = selectedChain === 'STELLAR';

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
  // payload, so this is a local filter — switching networks costs no request.
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
    if (!selectedAsset && sortedAssets.length > 0) setSelectedAsset(sortedAssets[0]!);
  }, [sortedAssets, selectedAsset, selectedChain]);

  const hash = transaction.step === 'success' ? transaction.hash : null;
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const explorerNetwork = buildData?.summary.network?.toLowerCase().includes('testnet')
    ? 'testnet'
    : buildData
      ? 'public'
      : network === 'testnet'
        ? 'testnet'
        : 'public';
  const explorerUrl = hash ? `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}` : null;

  const IN_FLIGHT_STEPS = [
    'building',
    'signing',
    'submitting',
    'submitted',
    'signing-submitting',
    'building-signing-submitting',
  ] as const;
  const isInProgress = (IN_FLIGHT_STEPS as readonly string[]).includes(transaction.step);
  const showBack = step === 'tx' && (transaction.step === 'error' || transaction.step === 'success') && !isInProgress;

  const txTitle = isInProgress
    ? 'Sending…'
    : transaction.step === 'success'
      ? 'Sent!'
      : transaction.step === 'error'
        ? 'Send failed'
        : 'Confirm Send';

  async function handleSubmit() {
    setFormError('');
    if (!canSendOnChain) {
      setFormError('Sending is not available on this network yet.');
      return;
    }
    if (!selectedAsset) {
      setFormError('Select an asset');
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setFormError('Enter a valid amount');
      return;
    }
    // A null `available` means the chain could not be read, so it floors to 0 and
    // blocks the send: never let an unreadable balance pass as "enough".
    if (parsed > parseFloat(selectedAsset.available ?? '0')) {
      setFormError('Insufficient balance');
      return;
    }
    if (!destination.trim()) {
      setFormError('Enter a destination address');
      return;
    }

    setStep('tx');
    await buildTx('payment', { destination: destination.trim(), amount, asset: assetParam(selectedAsset) });
  }

  function handleSignAndSend() {
    if (transaction.step === 'built') {
      void signAndSubmitTx(transaction.buildData.unsignedXdr);
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
    setShowXdr(false);
    setCopied(false);
  }

  return (
    <div className="pollar-overlay" onClick={!isInProgress ? onClose : undefined}>
      <SendModalTemplate
        theme={theme}
        accentColor={accentColor}
        step={step}
        txTitle={txTitle}
        assets={sortedAssets}
        selectedAsset={selectedAsset}
        chains={chains}
        selectedChain={selectedChain}
        walletAddress={walletAddress}
        canSendOnChain={canSendOnChain}
        onSelectChain={setSelectedChain}
        amount={amount}
        destination={destination}
        formError={formError}
        isLoadingBalance={walletBalance.step === 'loading'}
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
        onDestinationChange={setDestination}
        onSubmit={() => void handleSubmit()}
        onSignAndSend={handleSignAndSend}
        onToggleXdr={() => setShowXdr((v) => !v)}
        onCopyHash={handleCopyHash}
        onRetry={() => void handleRetry()}
        onDone={onClose}
      />
    </div>
  );
}
