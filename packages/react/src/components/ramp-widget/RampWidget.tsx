'use client';

import type { RampCountry, RampDirection, RampQuote, RampsOfframpBody, RampsOnrampBody, RampTxStatus } from '@pollar/core';
import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import type { RampFieldSpec, RampStep } from './RampWidgetTemplate';
import { RampWidgetTemplate } from './RampWidgetTemplate';
import '../shared.css';
import './RampWidget.css';
import { modalChrome } from '../modal-theme';

interface RampWidgetProps {
  onClose: () => void;
}

const TERMINAL: RampTxStatus[] = ['completed', 'failed'];

/** Fields the quote declares the client must collect (empty for SEP-24). */
function requiredFieldsOf(quote: RampQuote): RampFieldSpec[] {
  return (quote as { requiredFields?: RampFieldSpec[] }).requiredFields ?? [];
}

/** A bound the amount broke, or null when it fits. Providers declare their
 *  limits on the quote (`minAmount` / `maxAmount`); the ones that don't simply
 *  never trip this, and the backend stays the last word either way. */
function brokenLimitOf(amount: number, quote: RampQuote): { limit: 'min' | 'max'; value: number } | null {
  const { minAmount, maxAmount } = quote as { minAmount?: number; maxAmount?: number };
  if (!Number.isFinite(amount)) return null;
  if (minAmount != null && amount < minAmount) return { limit: 'min', value: minAmount };
  if (maxAmount != null && amount > maxAmount) return { limit: 'max', value: maxAmount };
  return null;
}

/** "The minimum amount is 11 ARS" — one phrasing, used both when we catch the
 *  limit before submitting and when the backend is the one to report it. */
function limitMessage(limit: 'min' | 'max', value: number, currency: string): string {
  return `The ${limit === 'min' ? 'minimum' : 'maximum'} amount for this route is ${value} ${currency}.`;
}

/** Ramp failures a user can act on. Anything unlisted keeps the raw code, which
 *  is still the most useful thing to show for a cause we can't phrase. */
const RAMP_ERROR_MESSAGES: Record<string, string> = {
  SDK_RAMPS_QUOTE_EXPIRED: 'This quote expired. Request a new one and try again.',
  SDK_RAMPS_ASSET_NOT_ENABLED: 'This currency is not available for that route right now.',
  SDK_RAMPS_KYC_REQUIRED: 'The provider needs to verify your identity before continuing.',
  SDK_RAMPS_WALLET_UNSUPPORTED: 'This wallet type cannot be used for this ramp.',
  SDK_RAMPS_PROVIDER_NOT_CONFIGURED: 'This ramp provider is not configured for this app yet.',
  SDK_RAMPS_ANCHOR_ERROR: 'The provider rejected the request. Please try again in a moment.',
  SDK_RAMPS_BRIDGE_ERROR: 'The provider rejected the request. Please try again in a moment.',
};

/**
 * Turn a thrown ramp error into something worth reading. An out-of-range amount
 * arrives with the bound as fields (`limit` / `limitAmount` / `limitCurrency`),
 * so the exact figure gets stated rather than the bare code the modal used to
 * show. Every provider that reports the range gets this for free.
 */
function rampErrorMessage(e: unknown, fallback: string): string {
  const body = (e as { body?: Record<string, unknown> } | undefined)?.body;
  const code = (e as { code?: unknown } | undefined)?.code;
  if (typeof code !== 'string') return e instanceof Error ? e.message : fallback;

  const limit = body?.limit;
  const value = body?.limitAmount;
  const currency = body?.limitCurrency;
  if ((limit === 'min' || limit === 'max') && typeof value === 'number' && typeof currency === 'string') {
    return limitMessage(limit, value, currency);
  }
  return RAMP_ERROR_MESSAGES[code] ?? (e instanceof Error ? e.message : fallback);
}

// Common shape of the on/off-ramp, complete and signature responses.
interface RampResult {
  txId: string;
  provider: string;
  status: RampTxStatus;
  kycUrl?: string;
  // Bridge splits onboarding into two hosted steps: KYC (identity) and ToS
  // acceptance. Both must be completed before the customer activates.
  tosUrl?: string;
  // The provider gated the flow on identity verification and offers no hosted
  // URL (Abroad). Nothing was built or signed — the user clears KYC with the
  // provider directly, and we poll `getRampKycStatus` until they do.
  kycRequired?: boolean;
  stellarTxHash?: string;
  pendingSignature?: { unsignedXdr: string; action: 'sep10' | 'withdraw_payment' };
  // REST providers (Bridge) return deposit instructions as data (e.g. a Pix
  // `br_code` / bank details for on-ramp) instead of an interactive URL.
  depositInstructions?: Record<string, unknown>;
}

export function RampWidget({ onClose }: RampWidgetProps) {
  const { getClient, signTx, wallet, styles, network } = usePollar();
  const walletAddress = wallet?.address ?? '';
  const client = getClient();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);

  const [step, setStep] = useState<RampStep>('input');
  const [direction, setDirection] = useState<RampDirection>('onramp');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [country, setCountry] = useState('');
  // Values for the fields a provider declares via the quote's `requiredFields`
  // (e.g. Bridge on-ramp: full name + email; off-ramp: + Pix key). Keyed by
  // field key; only collected when the selected route needs them.
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const setFieldValue = (key: string, value: string) => setFieldValues((v) => ({ ...v, [key]: value }));
  const [countries, setCountries] = useState<RampCountry[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quotes, setQuotes] = useState<RampQuote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<RampQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // status step
  const [txId, setTxId] = useState<string | null>(null);
  const [provider, setProvider] = useState('');
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [tosUrl, setTosUrl] = useState<string | null>(null);
  // Link-less KYC gate (Abroad): `kycPending` is what the provider told us on
  // start; `kycApproved` is what polling has since learned.
  const [kycPending, setKycPending] = useState(false);
  const [kycApproved, setKycApproved] = useState(false);
  const [txStatus, setTxStatus] = useState<RampTxStatus | null>(null);
  const [stellarTxHash, setStellarTxHash] = useState<string | null>(null);
  const [depositInstructions, setDepositInstructions] = useState<Record<string, unknown> | null>(null);
  const [completing, setCompleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const directionRef = useRef(direction);
  directionRef.current = direction;

  // Poll the anchor transaction status while on the status step until terminal.
  useEffect(() => {
    if (step !== 'status' || !txId) return;
    if (txStatus && TERMINAL.includes(txStatus)) return;
    let active = true;
    const id = setInterval(async () => {
      try {
        const tx = await client.getRampTransaction(txId);
        if (!active) return;
        setTxStatus(tx.status);
        if (tx.stellarTxHash) setStellarTxHash(tx.stellarTxHash);
        if (tx.kycUrl) setKycUrl(tx.kycUrl);
        // depositInstructions is returned by REST providers (Bridge) — e.g. a Pix
        // `br_code` / bank details for on-ramp.
        if (tx.depositInstructions) setDepositInstructions(tx.depositInstructions);
        if (TERMINAL.includes(tx.status)) clearInterval(id);
      } catch {
        /* transient — keep polling */
      }
    }, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [step, txId, txStatus, client]);

  // A link-less KYC gate has nothing to open, so poll the provider until the user
  // clears it elsewhere. Stops as soon as it's approved.
  useEffect(() => {
    if (step !== 'status' || !kycPending || kycApproved) return;
    let active = true;
    const check = async () => {
      try {
        const { hasApproved } = await client.getRampKycStatus();
        if (active && hasApproved) setKycApproved(true);
      } catch {
        /* transient — keep polling */
      }
    };
    void check();
    const id = setInterval(check, 10000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [step, kycPending, kycApproved, client]);

  /**
   * Fetch the ramp countries supported on the app's network. When `resetSelection`
   * is set (initial load) — or the current selection is no longer offered — pick
   * the first country and adopt its primary currency.
   */
  async function loadCountries(resetSelection: boolean) {
    setCountriesLoading(true);
    try {
      const { countries: list } = await client.getRampCountries();
      setCountries(list);
      const first = list[0];
      const stillValid = list.some((c) => c.code === country);
      if (first && (resetSelection || !stillValid)) {
        setCountry(first.code);
        if (first.currency) setCurrency(first.currency);
      }
    } catch {
      setCountries([]);
    } finally {
      setCountriesLoading(false);
    }
  }

  // Load the supported countries when the widget opens.
  useEffect(() => {
    loadCountries(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCountryChange(code: string) {
    setCountry(code);
    const match = countries.find((c) => c.code === code);
    if (match?.currency) setCurrency(match.currency);
  }

  // Refresh the data backing the current step: always the country list, plus the
  // quotes (select_route) or the anchor transaction (status).
  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadCountries(false);
      if (step === 'select_route') {
        const result = await client.getRampsQuote({ country, amount: Number(amount), currency, direction });
        setQuotes(result.quotes ?? []);
      } else if (step === 'status' && txId) {
        const tx = await client.getRampTransaction(txId);
        setTxStatus(tx.status);
        if (tx.stellarTxHash) setStellarTxHash(tx.stellarTxHash);
        if (tx.kycUrl) setKycUrl(tx.kycUrl);
        if (tx.depositInstructions) setDepositInstructions(tx.depositInstructions);
      }
    } catch {
      /* transient — leave the current data in place */
    } finally {
      setRefreshing(false);
    }
  }

  function resetToInput() {
    setStep('input');
    setQuotes([]);
    setSelectedQuote(null);
    // Clear the collected provider fields (name/email/etc.) so a retry re-shows
    // the 'contact' step. Otherwise a stale (possibly invalid) value keeps the
    // field non-empty, `handleSelectQuote` treats it as complete, skips the step
    // and replays the same failing request.
    setFieldValues({});
    setTxId(null);
    setProvider('');
    setKycUrl(null);
    setTosUrl(null);
    setTxStatus(null);
    setStellarTxHash(null);
    setDepositInstructions(null);
    setErrorMsg(null);
  }

  /**
   * EXTERNAL wallets (Freighter/Albedo): the backend returns an unsigned XDR the
   * user must sign locally, then we resume the flow. `sep10` yields the anchor
   * session (kycUrl); `withdraw_payment` broadcasts the on-chain withdrawal.
   */
  async function resumeWithSignature(id: string, ps: NonNullable<RampResult['pendingSignature']>) {
    const outcome = await signTx(ps.unsignedXdr);
    if (outcome.status !== 'signed') {
      setErrorMsg(outcome.message ?? outcome.details ?? 'Signing was cancelled.');
      setStep('error');
      return;
    }
    const result = (await client.submitRampSignature(id, {
      signedXdr: outcome.signedXdr,
      action: ps.action,
    })) as RampResult;
    await applyResult(result);
  }

  async function applyResult(result: RampResult) {
    setTxId(result.txId);
    setProvider(result.provider);
    if (result.pendingSignature) {
      await resumeWithSignature(result.txId, result.pendingSignature);
      return;
    }
    setKycUrl(result.kycUrl ?? null);
    setTosUrl(result.tosUrl ?? null);
    setKycPending(result.kycRequired === true);
    if (result.kycRequired) setKycApproved(false);
    setTxStatus(result.status);
    setStellarTxHash(result.stellarTxHash ?? null);
    setDepositInstructions(result.depositInstructions ?? null);
    setStep('status');
  }

  async function handleFindRoute() {
    setStep('loading_quote');
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const result = await client.getRampsQuote({ country, amount: Number(amount), currency, direction });
      const list = result.quotes ?? [];
      if (list.length === 0) {
        setErrorMsg(`No ramp providers available for ${country} yet.`);
        setStep('error');
        return;
      }
      setQuotes(list);
      setStep('select_route');
    } catch (e) {
      setErrorMsg(rampErrorMessage(e, 'Failed to fetch quotes.'));
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  }

  // Each quote declares the fields it needs (`requiredFields`). If any are unset,
  // collect them in the 'contact' step first; otherwise start immediately.
  function handleSelectQuote(quote: RampQuote) {
    setSelectedQuote(quote);
    setErrorMsg(null);
    // The limits are per route, and the amount was typed before the routes were
    // known — so this is the first moment we can check it. Catching it here
    // states the figure without spending a round trip on a certain rejection.
    const broken = brokenLimitOf(Number(amount), quote);
    if (broken) {
      setErrorMsg(limitMessage(broken.limit, broken.value, currency));
      return;
    }
    const fields = requiredFieldsOf(quote);
    const missing = fields.some((f) => !(fieldValues[f.key] ?? '').trim());
    if (fields.length > 0 && missing) {
      setStep('contact');
      return;
    }
    void startRamp(quote);
  }

  function handleContactContinue() {
    if (selectedQuote) void startRamp(selectedQuote);
  }

  async function startRamp(quote: RampQuote) {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const base: Record<string, unknown> = { quoteId: quote.quoteId, amount: Number(amount), currency, country };
      if (walletAddress) base.walletAddress = walletAddress;
      // Map each declared field to the request body: a field with `bankType`
      // becomes `bankDetails`; the standard body fields map by name; any other
      // provider-specific field (e.g. Stereum's bankCode / account holder) goes
      // into `fields`, which the backend reads per provider.
      const STANDARD_BODY_KEYS = new Set(['email', 'fullName', 'taxId', 'qrCode']);
      const extraFields: Record<string, string> = {};
      for (const f of requiredFieldsOf(quote)) {
        const val = (fieldValues[f.key] ?? '').trim();
        if (!val) continue;
        if (f.bankType) base.bankDetails = { type: f.bankType, value: val };
        else if (STANDARD_BODY_KEYS.has(f.key)) base[f.key] = val;
        else extraFields[f.key] = val;
      }
      if (Object.keys(extraFields).length > 0) base.fields = extraFields;
      const result = (
        direction === 'onramp'
          ? await client.createOnRamp(base as RampsOnrampBody)
          : await client.createOffRamp(base as RampsOfframpBody)
      ) as RampResult;
      await applyResult(result);
    } catch (e) {
      setErrorMsg(rampErrorMessage(e, 'Failed to start the ramp.'));
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenKyc() {
    if (kycUrl) window.open(kycUrl, '_blank', 'noopener,noreferrer');
  }

  function handleOpenTos() {
    if (tosUrl) window.open(tosUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleCompleteWithdraw() {
    if (!txId) return;
    setCompleting(true);
    setErrorMsg(null);
    try {
      const result = (await client.completeWithdraw(txId)) as RampResult;
      if (result.pendingSignature) {
        await resumeWithSignature(txId, result.pendingSignature);
        return;
      }
      setTxStatus(result.status);
      setStellarTxHash(result.stellarTxHash ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setErrorMsg(
        msg.includes('KYC') ? 'Finish KYC at the provider first, then try again.' : msg || 'Failed to complete the withdrawal.',
      );
    } finally {
      setCompleting(false);
    }
  }

  // A pending link-less KYC gate blocks the withdraw: the provider has no payment
  // context to pay into yet, so completing would either fail or — worse — move
  // real funds into a deposit it cannot pay out.
  const kycBlocking = kycPending && !kycApproved;
  const canComplete =
    direction === 'offramp' && step === 'status' && txStatus !== 'completed' && !stellarTxHash && !kycBlocking;

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={onClose}>
      <RampWidgetTemplate
        theme={theme}
        accentColor={accentColor}
        styleOverrides={styleOverrides}
        step={step}
        direction={direction}
        amount={amount}
        currency={currency}
        country={country}
        requiredFields={selectedQuote ? requiredFieldsOf(selectedQuote) : []}
        fieldValues={fieldValues}
        countries={countries}
        countriesLoading={countriesLoading}
        refreshing={refreshing}
        quotes={quotes}
        isLoading={isLoading}
        provider={provider}
        txStatus={txStatus}
        kycUrl={kycUrl}
        tosUrl={tosUrl}
        kycBlocking={kycBlocking}
        kycJustApproved={kycPending && kycApproved}
        stellarTxHash={stellarTxHash}
        explorerUrl={
          stellarTxHash
            ? `https://stellar.expert/explorer/${network === 'mainnet' ? 'public' : 'testnet'}/tx/${stellarTxHash}`
            : null
        }
        depositInstructions={depositInstructions}
        canComplete={canComplete}
        completing={completing}
        errorMsg={errorMsg}
        onDirectionChange={setDirection}
        onAmountChange={setAmount}
        onFieldChange={setFieldValue}
        onCountryChange={handleCountryChange}
        onFindRoute={handleFindRoute}
        onSelectQuote={handleSelectQuote}
        onContactContinue={handleContactContinue}
        onOpenKyc={handleOpenKyc}
        onOpenTos={handleOpenTos}
        onCompleteWithdraw={handleCompleteWithdraw}
        onRetry={resetToInput}
        onRefresh={handleRefresh}
        onClose={onClose}
      />
    </div>
  );
}
