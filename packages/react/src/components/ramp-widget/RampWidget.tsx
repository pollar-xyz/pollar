'use client';

import type { RampDirection, RampQuote, RampsOfframpBody, RampsOnrampBody, RampTxStatus } from '@pollar/core';
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

export function RampWidget({ onClose }: RampWidgetProps) {
  const { getClient, wallet, styles } = usePollar();
  const walletAddress = wallet?.address ?? '';
  const client = getClient();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const [step, setStep] = useState<RampStep>('input');
  const [direction, setDirection] = useState<RampDirection>('onramp');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [country, setCountry] = useState('AR');
  const [quotes, setQuotes] = useState<RampQuote[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // status step
  const [txId, setTxId] = useState<string | null>(null);
  const [provider, setProvider] = useState('');
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<RampTxStatus | null>(null);
  const [stellarTxHash, setStellarTxHash] = useState<string | null>(null);
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

  function resetToInput() {
    setStep('input');
    setQuotes([]);
    setTxId(null);
    setProvider('');
    setKycUrl(null);
    setTxStatus(null);
    setStellarTxHash(null);
    setErrorMsg(null);
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

  async function handleSelectQuote(quote: RampQuote) {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const base = { quoteId: quote.quoteId, amount: Number(amount), currency, country };
      const result =
        direction === 'onramp'
          ? await client.createOnRamp({ ...base, ...(walletAddress ? { walletAddress } : {}) } as RampsOnrampBody)
          : await client.createOffRamp({ ...base, ...(walletAddress ? { walletAddress } : {}) } as RampsOfframpBody);

      if (result.pendingSignature) {
        // EXTERNAL (user-controlled) wallet — needs client-side signing, not yet
        // supported in this widget. Custodial wallets return a kycUrl instead.
        setErrorMsg('This wallet type needs client-side signing, which is not supported in the widget yet.');
        setStep('error');
        return;
      }

      setTxId(result.txId);
      setProvider(result.provider);
      setKycUrl(result.kycUrl ?? null);
      setTxStatus(result.status);
      setStellarTxHash(result.stellarTxHash ?? null);
      setStep('status');
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
      const result = await client.completeWithdraw(txId);
      if (result.pendingSignature) {
        setErrorMsg('This wallet type needs client-side signing, which is not supported in the widget yet.');
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
        quotes={quotes}
        isLoading={isLoading}
        provider={provider}
        txStatus={txStatus}
        kycUrl={kycUrl}
        stellarTxHash={stellarTxHash}
        canComplete={canComplete}
        completing={completing}
        errorMsg={errorMsg}
        onDirectionChange={setDirection}
        onAmountChange={setAmount}
        onCurrencyChange={setCurrency}
        onCountryChange={setCountry}
        onFindRoute={handleFindRoute}
        onSelectQuote={handleSelectQuote}
        onOpenKyc={handleOpenKyc}
        onCompleteWithdraw={handleCompleteWithdraw}
        onRetry={resetToInput}
        onClose={onClose}
      />
    </div>
  );
}
