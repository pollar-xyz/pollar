'use client';

import type { RampCountry, RampDirection, RampQuote, RampsOfframpBody, RampsOnrampBody, RampTxStatus } from '@pollar/core';
import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import type { RampStep } from './RampWidgetTemplate';
import { RampWidgetTemplate } from './RampWidgetTemplate';
import '../shared.css';
import './RampWidget.css';

interface RampWidgetProps {
  onClose: () => void;
}

const TERMINAL: RampTxStatus[] = ['completed', 'failed'];

// Common shape of the on/off-ramp, complete and signature responses.
interface RampResult {
  txId: string;
  provider: string;
  status: RampTxStatus;
  kycUrl?: string;
  stellarTxHash?: string;
  pendingSignature?: { unsignedXdr: string; action: 'sep10' | 'withdraw_payment' };
  // REST providers (Bridge) return deposit instructions as data (e.g. a Pix
  // `br_code` / bank details for on-ramp) instead of an interactive URL.
  depositInstructions?: Record<string, unknown>;
}

export function RampWidget({ onClose }: RampWidgetProps) {
  const { getClient, signTx, wallet, styles } = usePollar();
  const walletAddress = wallet?.address ?? '';
  const client = getClient();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const [step, setStep] = useState<RampStep>('input');
  const [direction, setDirection] = useState<RampDirection>('onramp');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [country, setCountry] = useState('');
  // Always collected so REST providers (Bridge) can KYC any user — including
  // wallet-only logins that have no email on file. SEP-24 ignores them.
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
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
        // depositInstructions is returned by REST providers (Bridge); the generated
        // core type for the tx endpoint may lag, so read it defensively.
        const di = (tx as { depositInstructions?: Record<string, unknown> }).depositInstructions;
        if (di) setDepositInstructions(di);
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
        const di = (tx as { depositInstructions?: Record<string, unknown> }).depositInstructions;
        if (di) setDepositInstructions(di);
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
    setTxId(null);
    setProvider('');
    setKycUrl(null);
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
      setErrorMsg(e instanceof Error ? e.message : 'Failed to fetch quotes.');
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  }

  // A provider (Bridge/REST) declares via `requiresContact` whether it needs
  // email + full name to KYC the user. Only then do we collect them (in the
  // 'contact' step); SEP-24 anchors skip straight to the flow.
  function handleSelectQuote(quote: RampQuote) {
    setSelectedQuote(quote);
    setErrorMsg(null);
    const requiresContact = (quote as { requiresContact?: boolean }).requiresContact ?? false;
    if (requiresContact && (!email.trim() || !fullName.trim())) {
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
      const base = {
        quoteId: quote.quoteId,
        amount: Number(amount),
        currency,
        country,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
        ...(walletAddress ? { walletAddress } : {}),
      };
      const result = (
        direction === 'onramp'
          ? await client.createOnRamp(base as RampsOnrampBody)
          : await client.createOffRamp(base as RampsOfframpBody)
      ) as RampResult;
      await applyResult(result);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to start the ramp.');
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenKyc() {
    if (kycUrl) window.open(kycUrl, '_blank', 'noopener,noreferrer');
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

  const canComplete = direction === 'offramp' && step === 'status' && txStatus !== 'completed' && !stellarTxHash;

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <RampWidgetTemplate
        theme={theme}
        accentColor={accentColor}
        step={step}
        direction={direction}
        amount={amount}
        currency={currency}
        country={country}
        email={email}
        fullName={fullName}
        countries={countries}
        countriesLoading={countriesLoading}
        refreshing={refreshing}
        quotes={quotes}
        isLoading={isLoading}
        provider={provider}
        txStatus={txStatus}
        kycUrl={kycUrl}
        stellarTxHash={stellarTxHash}
        depositInstructions={depositInstructions}
        canComplete={canComplete}
        completing={completing}
        errorMsg={errorMsg}
        onDirectionChange={setDirection}
        onAmountChange={setAmount}
        onEmailChange={setEmail}
        onFullNameChange={setFullName}
        onCountryChange={handleCountryChange}
        onFindRoute={handleFindRoute}
        onSelectQuote={handleSelectQuote}
        onContactContinue={handleContactContinue}
        onOpenKyc={handleOpenKyc}
        onCompleteWithdraw={handleCompleteWithdraw}
        onRetry={resetToInput}
        onRefresh={handleRefresh}
        onClose={onClose}
      />
    </div>
  );
}
