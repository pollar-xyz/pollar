'use client';

import { SolanaSwapQuote, SolanaSwapVenue, SwapProvider, SwapQuote, SwapQuoteParams, SwapToken, SwapVenue } from '@pollar/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import '../shared.css';
import '../transaction-modal/TransactionModal.css';
import '../send-modal/SendModal.css';
import './SwapModal.css';
import { SWAP_COPY } from './swap-copy';
import { SwapAssetOption, SwapChain, SwapModalTemplate, SwapQuoteView } from './SwapModalTemplate';
import { modalChrome } from '../modal-theme';
import { byCode, oneOf, seededAmount, useSuccessReport } from '../../modal-options';

/** Where the swap modal opens: a starting point the user can change. An option the app does not offer is left out. */
export interface SwapModalOptions {
  chain?: SwapChain;
  /** Code of the asset sold, e.g. 'XLM'. */
  sell?: string;
  /** Code of the asset bought, e.g. 'USDC'. */
  buy?: string;
  amount?: string;
  /** Called once the swap lands, with its transaction hash. */
  onSuccess?: (result: { hash: string }) => void;
}

interface SwapModalProps {
  onClose: () => void;
  initial?: SwapModalOptions | undefined;
}

/** Debounce (ms) before re-quoting as the user edits the amount / assets. */
const QUOTE_DEBOUNCE_MS = 400;

type AssetLike = { type: 'native' | 'credit_alphanum4' | 'credit_alphanum12'; code: string; issuer?: string | undefined };

function toRef(a: AssetLike): SwapQuoteParams['sellAsset'] {
  if (a.type === 'native') return { type: 'native' };
  if (a.type === 'credit_alphanum4') return { type: 'credit_alphanum4', code: a.code, issuer: a.issuer! };
  return { type: 'credit_alphanum12', code: a.code, issuer: a.issuer! };
}

/** Solana's native SOL is swapped as wrapped SOL, 9 decimals. */
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_DECIMALS = 9;

/** `1.5` with 6 decimals is `1500000`; null for anything that is not a positive decimal within those decimals. */
function toBaseUnits(amount: string, decimals: number): string | null {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) return null;
  const units = BigInt(`${whole}${fraction.padEnd(decimals, '0')}`);
  return units > 0n ? units.toString() : null;
}

/** `1500000` with 6 decimals is `1.5`. */
function fromBaseUnits(units: string, decimals: number): string {
  if (decimals === 0) return units;
  const padded = units.padStart(decimals + 1, '0');
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${padded.slice(0, -decimals)}.${fraction}` : padded.slice(0, -decimals);
}

/** A catalog token (code + issuer) -> the asset ref, picking the alphanum width. */
function catalogRef(code: string, issuer: string): SwapQuoteParams['sellAsset'] {
  return code.length <= 4 ? { type: 'credit_alphanum4', code, issuer } : { type: 'credit_alphanum12', code, issuer };
}

export function SwapModal({ onClose, initial }: SwapModalProps) {
  const {
    getSwapConfig,
    getSwapTokens,
    getSwapQuote,
    swap,
    getSolanaSwapConfig,
    getSolanaSwapQuote,
    swapSolana,
    walletBalance,
    refreshWalletBalance,
    enabledAssets,
    refreshAssets,
    tx: transaction,
    wallet,
    network,
    styles,
  } = usePollar();

  const language = useModalLanguage();
  const copy = SWAP_COPY[language];
  const walletType = wallet?.custody === 'external' ? wallet.provider : null;
  const [chain, setChain] = useState<SwapChain>(() => oneOf<SwapChain>(['STELLAR', 'SOLANA'], initial?.chain) ?? 'STELLAR');
  // The asset options wait for a matching asset (catalog tokens load after the balances) until the user picks one.
  const sellSeed = useRef(initial?.sell);
  const buySeed = useRef(initial?.buy);
  // A smart (C-address) wallet is a Stellar account: it says nothing about Solana.
  const smartUnsupported = chain === 'STELLAR' && wallet?.custody === 'smart';
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);

  const [step, setStep] = useState<'form' | 'tx'>('form');
  const [selectedSell, setSelectedSell] = useState<SwapAssetOption | null>(null);
  const [selectedBuy, setSelectedBuy] = useState<SwapAssetOption | null>(null);
  const [amount, setAmount] = useState(() => seededAmount(initial?.amount));
  const [provider, setProvider] = useState<string>('auto');
  const [venues, setVenues] = useState<SwapVenue[] | null>(null); // null = config loading
  const [solanaVenues, setSolanaVenues] = useState<SolanaSwapVenue[] | null>(null);
  const [solanaQuotes, setSolanaQuotes] = useState<SolanaSwapQuote[]>([]);
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

  // Which venues this app exposes (operator config intersected with server capability).
  const loadConfig = useCallback(() => {
    setVenues(null); // back to loading
    setSolanaVenues(null);
    return Promise.all([
      getSwapConfig()
        .then(setVenues)
        .catch(() => setVenues([])), // treat a failed config as "unavailable"
      getSolanaSwapConfig()
        .then(setSolanaVenues)
        .catch(() => setSolanaVenues([])),
    ]);
  }, [getSwapConfig, getSolanaSwapConfig]);

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
  const availableFor = (code: string, issuer?: string): string | undefined =>
    balances.find((b) => b.code === code && (b.issuer ?? '') === (issuer ?? ''))?.available ?? undefined;

  // Sell: native XLM + every asset the wallet has a trustline for, even at a 0
  // balance - so the user always sees what they hold and knows when to fund
  // (the amount field guards against overselling). Buy: app-enabled assets.
  // Swap is Stellar-only, so the guard drops every non-Stellar balance and
  // narrows `type` for toRef(). It has to test `chain`, not `type`: SOL/POL
  // report `type: 'native'` exactly like XLM, and a Solana/Polygon token reports
  // `type: 'token'` with no `trustlineRemoved`, so neither can be told apart
  // from a Stellar row by `type` alone.
  const stellarSell: SwapAssetOption[] = balances
    .filter(
      (b): b is typeof b & { type: 'native' | 'credit_alphanum4' | 'credit_alphanum12' } =>
        (b.chain === undefined || b.chain === 'STELLAR') &&
        (b.type === 'native' || ((b.type === 'credit_alphanum4' || b.type === 'credit_alphanum12') && !b.trustlineRemoved)),
    )
    // A null `available` (chain unreadable) maps to undefined - "unknown", which
    // the option already models - rather than to a 0 that would read as "empty".
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
      available: availableFor(a.code, a.issuer),
      enabledInApp: a.enabledInApp,
    }));
  const enabledKeys = new Set(enabledBuy.map(optKey));
  const catalogBuy: SwapAssetOption[] = catalogTokens
    .map((tk) => ({
      ref: catalogRef(tk.code, tk.issuer),
      code: tk.code,
      issuer: tk.issuer,
      available: availableFor(tk.code, tk.issuer),
      enabledInApp: false,
    }))
    .filter((o) => !enabledKeys.has(optKey(o)));
  const knownKeys = new Set([...enabledKeys, ...catalogBuy.map(optKey)]);
  const customBuy = customTokens
    .filter((o) => !knownKeys.has(optKey(o)))
    .map((o) => ({ ...o, available: availableFor(o.code, o.issuer) }));
  const stellarBuy: SwapAssetOption[] = [...enabledBuy, ...catalogBuy, ...customBuy];

  // Solana: sell what the Solana wallet holds, buy SOL or a token the app
  // enabled. A token's `issuer` is its mint; SOL travels as wrapped SOL.
  const solanaSell: SwapAssetOption[] = balances
    .filter((b) => b.chain === 'SOLANA' && (b.type === 'native' || (b.type === 'token' && !!b.issuer)))
    .map((b) => ({
      code: b.type === 'native' ? 'SOL' : b.code,
      issuer: b.type === 'native' ? WRAPPED_SOL_MINT : b.issuer,
      decimals: b.type === 'native' ? SOL_DECIMALS : b.decimals,
      available: b.available ?? undefined,
      enabledInApp: true,
    }));
  const solanaAvailable = (mint: string) => solanaSell.find((o) => o.issuer === mint)?.available;
  const solanaBuy: SwapAssetOption[] = [
    {
      code: 'SOL',
      issuer: WRAPPED_SOL_MINT,
      decimals: SOL_DECIMALS,
      available: solanaAvailable(WRAPPED_SOL_MINT),
      enabledInApp: true,
    },
    ...assetRecords
      .filter((a) => a.chain === 'SOLANA' && a.type === 'token' && !!a.issuer && a.decimals !== undefined)
      .map((a) => ({
        code: a.code,
        issuer: a.issuer,
        decimals: a.decimals,
        available: solanaAvailable(a.issuer!),
        enabledInApp: true,
      })),
  ];

  const sellOptions = chain === 'SOLANA' ? solanaSell : stellarSell;
  const buyOptions: SwapAssetOption[] = (chain === 'SOLANA' ? solanaBuy : stellarBuy).filter(
    (o) => optKey(o) !== buyKeyOfSell || optKey(o) === (selectedBuy ? optKey(selectedBuy) : ''),
  );

  // Auto-select the first sell / buy asset once options are available, and keep a
  // valid selection if the list changes - so the pickers never sit empty.
  useEffect(() => {
    if (sellOptions.length === 0) return;
    const seeded = byCode(sellOptions, sellSeed.current);
    if (seeded) {
      sellSeed.current = undefined;
      setSelectedSell(seeded);
      return;
    }
    if (!selectedSell || !sellOptions.some((o) => optKey(o) === optKey(selectedSell))) {
      setSelectedSell(sellOptions[0]!);
    }
  }, [sellOptions, selectedSell]);

  useEffect(() => {
    if (buyOptions.length === 0) return;
    const seeded = byCode(buyOptions, buySeed.current);
    if (seeded) {
      buySeed.current = undefined;
      setSelectedBuy(seeded);
      return;
    }
    if (!selectedBuy || !buyOptions.some((o) => optKey(o) === optKey(selectedBuy))) {
      setSelectedBuy(buyOptions[0]!);
    }
  }, [buyOptions, selectedBuy]);

  // Add a user-pasted token (code + issuer) to the buy list and select it.
  // Returns an error message, or null on success.
  function addCustomToken(code: string, issuer: string): string | null {
    const c = code.trim().toUpperCase();
    const i = issuer.trim();
    if (c.length < 1 || c.length > 12) return copy.codeLength;
    if (i.length !== 56 || !i.startsWith('G')) return copy.issuerFormat;
    const opt: SwapAssetOption = { ref: catalogRef(c, i), code: c, issuer: i, enabledInApp: false };
    setCustomTokens((prev) => (prev.some((o) => optKey(o) === optKey(opt)) ? prev : [...prev, opt]));
    buySeed.current = undefined;
    setSelectedBuy(opt);
    return null;
  }

  // Does buying `selectedBuy` require creating a trustline first? Native never;
  // a credit asset the wallet already trusts (in enabledAssets with
  // trustlineEstablished) doesn't; anything else (incl. catalog tokens) does.
  // Smart wallets hold SAC tokens (no classic trustlines) so it never applies.
  const buyNeedsTrustline = (() => {
    if (chain !== 'STELLAR' || !selectedBuy?.ref || smartUnsupported) return false;
    if (selectedBuy.ref.type === 'native') return false;
    const rec = assetRecords.find((a) => a.code === selectedBuy.code && a.issuer === selectedBuy.issuer);
    return !rec?.trustlineEstablished;
  })();

  const configLoading = venues === null || solanaVenues === null;
  const chains = useMemo<SwapChain[]>(
    () => [
      ...(venues && venues.length > 0 ? (['STELLAR'] as const) : []),
      ...(solanaVenues && solanaVenues.length > 0 ? (['SOLANA'] as const) : []),
    ],
    [venues, solanaVenues],
  );
  const swapUnavailable = !configLoading && chains.length === 0;
  const chainVenues: string[] = (chain === 'SOLANA' ? solanaVenues : venues) ?? [];
  // Offer "Auto" (best of the enabled set) plus each configured venue.
  const providers: string[] = chainVenues.length > 0 ? ['auto', ...chainVenues] : [];
  const quote = quotes[0] ?? null;
  const solanaQuote = solanaQuotes[0] ?? null;
  const quoteView: SwapQuoteView | null =
    chain === 'SOLANA'
      ? solanaQuote && selectedBuy?.decimals !== undefined
        ? {
            provider: solanaQuote.provider,
            amountOut: fromBaseUnits(solanaQuote.outAmount, selectedBuy.decimals),
            minReceived: fromBaseUnits(solanaQuote.minOut, selectedBuy.decimals),
            priceImpactPct: solanaQuote.priceImpactPct,
          }
        : null
      : quote;

  // Land on a chain the app offers swaps on; Stellar first when it offers both.
  useEffect(() => {
    if (chains.length > 0 && !chains.includes(chain)) setChain(chains[0]!);
  }, [chains, chain]);

  function handleChainChange(next: SwapChain) {
    sellSeed.current = undefined;
    buySeed.current = undefined;
    setChain(next);
    setSelectedSell(null);
    setSelectedBuy(null);
    setAmount('');
    setProvider('auto');
    setQuotes([]);
    setSolanaQuotes([]);
    setFormError('');
  }

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
      setSolanaQuotes([]);
      setQuoteError('');
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError('');
    const t = setTimeout(async () => {
      try {
        if (chain === 'SOLANA') {
          const units = selectedSell.decimals !== undefined ? toBaseUnits(amount, selectedSell.decimals) : null;
          if (!units || !selectedSell.issuer || !selectedBuy.issuer) throw new Error(copy.invalidAmount);
          const qs = await getSolanaSwapQuote({
            inputMint: selectedSell.issuer,
            outputMint: selectedBuy.issuer,
            amount: units,
            provider: provider as SolanaSwapQuote['provider'] | 'auto',
            slippageBps,
          });
          if (!cancelled) setSolanaQuotes(qs);
        } else {
          if (!selectedSell.ref || !selectedBuy.ref) throw new Error(copy.selectBoth);
          const qs = await getSwapQuote({
            sellAsset: selectedSell.ref,
            buyAsset: selectedBuy.ref,
            amount,
            provider: provider as SwapProvider,
            slippageBps,
          });
          if (!cancelled) setQuotes(qs);
        }
      } catch (e) {
        if (!cancelled) {
          setQuotes([]);
          setSolanaQuotes([]);
          setQuoteError(e instanceof Error ? e.message : copy.quoteFailed);
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    step,
    swapUnavailable,
    configLoading,
    chain,
    selectedSell,
    selectedBuy,
    amount,
    provider,
    getSwapQuote,
    getSolanaSwapQuote,
    copy,
  ]);

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
  const explorerUrl = !hash
    ? null
    : chain === 'SOLANA'
      ? `https://solscan.io/tx/${hash}${network === 'testnet' ? '?cluster=devnet' : ''}`
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
  const showBack = step === 'tx' && (transaction.step === 'error' || transaction.step === 'success') && !isInProgress;

  const txTitle = isInProgress
    ? copy.swapping
    : transaction.step === 'success'
      ? copy.swapped
      : transaction.step === 'error'
        ? copy.swapFailed
        : copy.confirmSwap;

  async function handleSwap() {
    setFormError('');
    if (smartUnsupported) {
      setFormError(copy.smartNotSupported);
      return;
    }
    if (!selectedSell || !selectedBuy) {
      setFormError(copy.selectBoth);
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setFormError(copy.invalidAmount);
      return;
    }
    if (selectedSell.available !== undefined && parsed > parseFloat(selectedSell.available)) {
      setFormError(copy.insufficientBalance);
      return;
    }
    if (chain === 'SOLANA') {
      if (!solanaQuote) {
        setFormError(copy.noRouteForPair);
        return;
      }
      setStep('tx');
      await swapSolana(solanaQuote, { slippageBps });
      return;
    }
    if (!quote) {
      setFormError(copy.noRouteForPair);
      return;
    }
    setStep('tx');
    await swap(quote);
  }

  async function handleRetry() {
    if (transaction.step !== 'error') return;
    if (chain === 'SOLANA') {
      if (solanaQuote) await swapSolana(solanaQuote, { slippageBps });
      return;
    }
    if (quote) await swap(quote);
  }

  function handleMax() {
    if (selectedSell?.available !== undefined) setAmount(selectedSell.available);
  }

  function handleReverse() {
    if (!selectedSell || !selectedBuy) return;
    sellSeed.current = undefined;
    buySeed.current = undefined;
    const previousSell = selectedSell;
    setSelectedSell(selectedBuy);
    setSelectedBuy(previousSell);
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
    <div className="pollar-overlay" style={overlayStyle} onClick={!isInProgress ? onClose : undefined}>
      <SwapModalTemplate
        theme={theme}
        accentColor={accentColor}
        styleOverrides={styleOverrides}
        step={step}
        txTitle={txTitle}
        sellOptions={sellOptions}
        buyOptions={buyOptions}
        selectedSell={selectedSell}
        selectedBuy={selectedBuy}
        amount={amount}
        chains={chains}
        chain={chain}
        provider={provider}
        providers={providers}
        quote={quoteView}
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
        language={language}
        onClose={onClose}
        onBack={handleBack}
        onRefresh={handleRefresh}
        onSelectSell={(option) => {
          sellSeed.current = undefined;
          setSelectedSell(option);
        }}
        onSelectBuy={(option) => {
          buySeed.current = undefined;
          setSelectedBuy(option);
        }}
        onReverse={handleReverse}
        onMax={handleMax}
        onAddCustomToken={addCustomToken}
        onAmountChange={setAmount}
        onChainChange={handleChainChange}
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
