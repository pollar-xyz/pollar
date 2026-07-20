'use client';

import { SwapProvider, SwapQuote, SwapQuoteParams, SwapToken, SwapVenue } from '@pollar/core';
import { useCallback, useEffect, useRef, useState } from 'react';
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

type AssetLike = { type: 'native' | 'credit_alphanum4' | 'credit_alphanum12'; code: string; issuer?: string | undefined };

function toRef(a: AssetLike): SwapQuoteParams['sellAsset'] {
  if (a.type === 'native') return { type: 'native' };
  if (a.type === 'credit_alphanum4') return { type: 'credit_alphanum4', code: a.code, issuer: a.issuer! };
  return { type: 'credit_alphanum12', code: a.code, issuer: a.issuer! };
}

/** A catalog token (code + issuer) -> the asset ref, picking the alphanum width. */
function catalogRef(code: string, issuer: string): SwapQuoteParams['sellAsset'] {
  return code.length <= 4 ? { type: 'credit_alphanum4', code, issuer } : { type: 'credit_alphanum12', code, issuer };
}

export function SwapModal({ onClose }: SwapModalProps) {
  const {
    getSwapConfig,
    getSwapTokens,
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
  const [venues, setVenues] = useState<SwapVenue[] | null>(null); // null = config loading
  const [catalogTokens, setCatalogTokens] = useState<SwapToken[]>([]);
  // Tokens the user pasted by code+issuer (not in the app catalog). Local only.
  const [customTokens, setCustomTokens] = useState<SwapAssetOption[]>([]);
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

  // Which venues this app exposes (operator config ∩ server capability).
  const loadConfig = useCallback(() => {
    setVenues(null); // back to loading
    return getSwapConfig()
      .then(setVenues)
      .catch(() => setVenues([])); // treat a failed config as "unavailable"
  }, [getSwapConfig]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Curated "buy" catalog tokens the app opted into (may lack a trustline).
  const loadCatalog = useCallback(
    () =>
      getSwapTokens()
        .then(setCatalogTokens)
        .catch(() => setCatalogTokens([])),
    [getSwapTokens],
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Re-pull everything the modal shows: balances, app assets, config and catalog.
  function handleRefresh() {
    void refreshWalletBalance();
    void refreshAssets();
    void loadConfig();
    void loadCatalog();
  }

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const balances = walletBalance.step === 'loaded' ? walletBalance.data.balances : [];
  const assetRecords = enabledAssets.step === 'loaded' ? enabledAssets.data.assets : [];
  const isLoadingData = walletBalance.step === 'loading' || enabledAssets.step === 'loading';

  // Sell: native XLM + every asset the wallet has a trustline for, even at a 0
  // balance — so the user always sees what they hold and knows when to fund
  // (the amount field guards against overselling). Buy: app-enabled assets.
  // Swap is Stellar-only, so drop any non-Stellar balance (SOL/POL carry no
  // `type`) — the guard both filters them and narrows `type` for toRef().
  const sellOptions: SwapAssetOption[] = balances
    .filter(
      (b): b is typeof b & { type: 'native' | 'credit_alphanum4' | 'credit_alphanum12' } =>
        b.type != null && (b.type === 'native' || !b.trustlineRemoved),
    )
    // A null `available` (chain unreadable) maps to undefined — "unknown", which
    // the option already models — rather than to a 0 that would read as "empty".
    .map((b) => ({
      ref: toRef(b),
      code: b.code,
      issuer: b.issuer,
      available: b.available ?? undefined,
      enabledInApp: b.enabledInApp,
    }));

  const buyKeyOfSell = selectedSell ? `${selectedSell.code}:${selectedSell.issuer ?? 'native'}` : '';
  const optKey = (o: { code: string; issuer?: string | undefined }) => `${o.code}:${o.issuer ?? 'native'}`;
  // Buy list = the app's enabled assets, plus curated catalog tokens the app
  // opted into (deduped; catalog tokens the wallet may not trust yet). Exclude
  // whatever is being sold.
  // Same Stellar-only guard as the sell list: the enabled-asset catalog is now
  // multichain, and a Polygon/Solana token (type 'token') has no Stellar asset
  // ref to swap with. The predicate both drops them and narrows `type` for toRef().
  const enabledBuy: SwapAssetOption[] = assetRecords
    .filter(
      (a): a is typeof a & { type: 'native' | 'credit_alphanum4' | 'credit_alphanum12' } =>
        (a.chain === undefined || a.chain === 'STELLAR') &&
        (a.type === 'native' || a.type === 'credit_alphanum4' || a.type === 'credit_alphanum12'),
    )
    .map((a) => ({
      ref: toRef(a),
      code: a.code,
      issuer: a.issuer,
      enabledInApp: a.enabledInApp,
    }));
  const enabledKeys = new Set(enabledBuy.map(optKey));
  const catalogBuy: SwapAssetOption[] = catalogTokens
    .map((tk) => ({
      ref: catalogRef(tk.code, tk.issuer),
      code: tk.code,
      issuer: tk.issuer,
      enabledInApp: false,
    }))
    .filter((o) => !enabledKeys.has(optKey(o)));
  const knownKeys = new Set([...enabledKeys, ...catalogBuy.map(optKey)]);
  const customBuy = customTokens.filter((o) => !knownKeys.has(optKey(o)));
  const buyOptions: SwapAssetOption[] = [...enabledBuy, ...catalogBuy, ...customBuy].filter((o) => optKey(o) !== buyKeyOfSell);

  // Auto-select the first sell / buy asset once options are available, and keep a
  // valid selection if the list changes — so the pickers never sit empty.
  useEffect(() => {
    if (sellOptions.length === 0) return;
    if (!selectedSell || !sellOptions.some((o) => optKey(o) === optKey(selectedSell))) {
      setSelectedSell(sellOptions[0]!);
    }
  }, [sellOptions, selectedSell]);

  useEffect(() => {
    if (buyOptions.length === 0) return;
    if (!selectedBuy || !buyOptions.some((o) => optKey(o) === optKey(selectedBuy))) {
      setSelectedBuy(buyOptions[0]!);
    }
  }, [buyOptions, selectedBuy]);

  // Add a user-pasted token (code + issuer) to the buy list and select it.
  // Returns an error message, or null on success.
  function addCustomToken(code: string, issuer: string): string | null {
    const c = code.trim().toUpperCase();
    const i = issuer.trim();
    if (c.length < 1 || c.length > 12) return 'Code must be 1-12 characters';
    if (i.length !== 56 || !i.startsWith('G')) return 'Issuer must be a Stellar address (G..., 56 chars)';
    const opt: SwapAssetOption = { ref: catalogRef(c, i), code: c, issuer: i, enabledInApp: false };
    setCustomTokens((prev) => (prev.some((o) => optKey(o) === optKey(opt)) ? prev : [...prev, opt]));
    setSelectedBuy(opt);
    return null;
  }

  // Does buying `selectedBuy` require creating a trustline first? Native never;
  // a credit asset the wallet already trusts (in enabledAssets with
  // trustlineEstablished) doesn't; anything else (incl. catalog tokens) does.
  // Smart wallets hold SAC tokens (no classic trustlines) so it never applies.
  const buyNeedsTrustline = (() => {
    if (!selectedBuy || smartUnsupported) return false;
    if (selectedBuy.ref.type === 'native') return false;
    const rec = assetRecords.find((a) => a.code === selectedBuy.code && a.issuer === selectedBuy.issuer);
    return !rec?.trustlineEstablished;
  })();

  const configLoading = venues === null;
  const swapUnavailable = venues !== null && venues.length === 0;
  // Offer "Auto" (best of the enabled set) plus each configured venue.
  const providers: SwapProvider[] = venues && venues.length > 0 ? (['auto', ...venues] as SwapProvider[]) : [];
  const quote = quotes[0] ?? null;

  // Re-quote (debounced) whenever the pair / amount / route changes.
  useEffect(() => {
    if (
      step !== 'form' ||
      swapUnavailable ||
      configLoading ||
      !selectedSell ||
      !selectedBuy ||
      !amount ||
      parseFloat(amount) <= 0
    ) {
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
  }, [step, swapUnavailable, configLoading, selectedSell, selectedBuy, amount, provider, getSwapQuote]);

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
        configLoading={configLoading}
        swapUnavailable={swapUnavailable}
        buyNeedsTrustline={buyNeedsTrustline}
        transaction={transaction}
        showXdr={showXdr}
        copied={copied}
        explorerUrl={explorerUrl}
        walletType={walletType}
        showBack={showBack}
        isInProgress={isInProgress}
        onClose={onClose}
        onBack={handleBack}
        onRefresh={handleRefresh}
        onSelectSell={setSelectedSell}
        onSelectBuy={setSelectedBuy}
        onAddCustomToken={addCustomToken}
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
