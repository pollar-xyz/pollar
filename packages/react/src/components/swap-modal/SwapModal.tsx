'use client';

import { SwapProvider, SwapQuote, SwapQuoteParams } from '@pollar/core';
import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import '../transaction-modal/TransactionModal.css';
import '../send-modal/SendModal.css';
import './SwapModal.css';
import { SwapAssetOption, SwapModalTemplate } from './SwapModalTemplate';

interface SwapModalProps {
  onClose: () => void;
}

/** Debounce (ms) before re-quoting as the user edits the amount / assets. */
const QUOTE_DEBOUNCE_MS = 400;

const ALL_PROVIDERS: SwapProvider[] = ['auto', 'aquarius', 'soroswap', 'sdex'];

type AssetLike = { type: 'native' | 'credit_alphanum4' | 'credit_alphanum12'; code: string; issuer?: string | undefined };

function toRef(a: AssetLike): SwapQuoteParams['sellAsset'] {
  if (a.type === 'native') return { type: 'native' };
  if (a.type === 'credit_alphanum4') return { type: 'credit_alphanum4', code: a.code, issuer: a.issuer! };
  return { type: 'credit_alphanum12', code: a.code, issuer: a.issuer! };
}

export function SwapModal({ onClose }: SwapModalProps) {
  const {
    getSwapQuote,
    swap,
    walletBalance,
    refreshWalletBalance,
    enabledAssets,
    refreshAssets,
    tx: transaction,
    wallet,
    network,
    styles,
  } = usePollar();

  const walletType = wallet?.custody === 'external' ? wallet.provider : null;
  const smartUnsupported = wallet?.custody === 'smart';
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const [step, setStep] = useState<'form' | 'tx'>('form');
  const [selectedSell, setSelectedSell] = useState<SwapAssetOption | null>(null);
  const [selectedBuy, setSelectedBuy] = useState<SwapAssetOption | null>(null);
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<SwapProvider>('auto');
  const [quotes, setQuotes] = useState<SwapQuote[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [formError, setFormError] = useState('');
  const [showXdr, setShowXdr] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fixed default slippage (0.5%). Exposed as a constant for now; an advanced
  // control can drive this later without touching the quote/execute wiring.
  const slippageBps = 50;

  useEffect(() => {
    void refreshWalletBalance();
    void refreshAssets();
  }, [refreshWalletBalance, refreshAssets]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const balances = walletBalance.step === 'loaded' ? walletBalance.data.balances : [];
  const assetRecords = enabledAssets.step === 'loaded' ? enabledAssets.data.assets : [];
  const isLoadingData = walletBalance.step === 'loading' || enabledAssets.step === 'loading';

  // Sell: assets the wallet actually holds (available > 0). Buy: app-enabled assets.
  const sellOptions: SwapAssetOption[] = balances
    .filter((b) => parseFloat(b.available) > 0)
    .map((b) => ({ ref: toRef(b), code: b.code, issuer: b.issuer, available: b.available, enabledInApp: b.enabledInApp }));

  const buyKeyOfSell = selectedSell ? `${selectedSell.code}:${selectedSell.issuer ?? 'native'}` : '';
  const buyOptions: SwapAssetOption[] = assetRecords
    .map((a) => ({ ref: toRef(a), code: a.code, issuer: a.issuer, enabledInApp: a.enabledInApp }))
    .filter((o) => `${o.code}:${o.issuer ?? 'native'}` !== buyKeyOfSell);

  const providers = smartUnsupported ? ALL_PROVIDERS.filter((p) => p !== 'sdex') : ALL_PROVIDERS;
  const quote = quotes[0] ?? null;

  // Re-quote (debounced) whenever the pair / amount / route changes.
  useEffect(() => {
    if (step !== 'form' || !selectedSell || !selectedBuy || !amount || parseFloat(amount) <= 0) {
      setQuotes([]);
      setQuoteError('');
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError('');
    const t = setTimeout(async () => {
      try {
        const qs = await getSwapQuote({
          sellAsset: selectedSell.ref,
          buyAsset: selectedBuy.ref,
          amount,
          provider,
          slippageBps,
        });
        if (!cancelled) setQuotes(qs);
      } catch (e) {
        if (!cancelled) {
          setQuotes([]);
          setQuoteError(e instanceof Error ? e.message : 'Failed to fetch quote');
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, selectedSell, selectedBuy, amount, provider, getSwapQuote]);

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
    ? 'Swapping…'
    : transaction.step === 'success'
      ? 'Swapped!'
      : transaction.step === 'error'
        ? 'Swap failed'
        : 'Confirm Swap';

  async function handleSwap() {
    setFormError('');
    if (smartUnsupported) {
      setFormError('Swaps are not yet supported for smart (passkey) wallets');
      return;
    }
    if (!selectedSell || !selectedBuy) {
      setFormError('Select both assets');
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setFormError('Enter a valid amount');
      return;
    }
    if (selectedSell.available !== undefined && parsed > parseFloat(selectedSell.available)) {
      setFormError('Insufficient balance');
      return;
    }
    if (!quote) {
      setFormError('No route available for this pair');
      return;
    }
    setStep('tx');
    await swap(quote);
  }

  async function handleRetry() {
    if (transaction.step === 'error' && quote) await swap(quote);
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

  function handleBack() {
    setStep('form');
    setShowXdr(false);
    setCopied(false);
  }

  return (
    <div className="pollar-overlay" onClick={!isInProgress ? onClose : undefined}>
      <SwapModalTemplate
        theme={theme}
        accentColor={accentColor}
        step={step}
        txTitle={txTitle}
        sellOptions={sellOptions}
        buyOptions={buyOptions}
        selectedSell={selectedSell}
        selectedBuy={selectedBuy}
        amount={amount}
        provider={provider}
        providers={providers}
        quote={quote}
        quoteLoading={quoteLoading}
        quoteError={quoteError}
        formError={formError}
        isLoadingData={isLoadingData}
        smartUnsupported={smartUnsupported}
        transaction={transaction}
        showXdr={showXdr}
        copied={copied}
        explorerUrl={explorerUrl}
        walletType={walletType}
        showBack={showBack}
        isInProgress={isInProgress}
        onClose={onClose}
        onBack={handleBack}
        onSelectSell={setSelectedSell}
        onSelectBuy={setSelectedBuy}
        onAmountChange={setAmount}
        onProviderChange={setProvider}
        onSwap={() => void handleSwap()}
        onToggleXdr={() => setShowXdr((v) => !v)}
        onCopyHash={handleCopyHash}
        onRetry={() => void handleRetry()}
        onDone={onClose}
      />
    </div>
  );
}
