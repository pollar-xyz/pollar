'use client';

import {
  type PaymentInstructions,
  type RampDirection,
  type RampQuote,
  type RampsOnrampBody,
} from '@pollar/core';
import { useState } from 'react';
import { usePollar } from '../../context';
import type { RampStep } from './RampWidgetTemplate';
import { RampWidgetTemplate } from './RampWidgetTemplate';
import '../shared.css';
import './RampWidget.css';

interface RampWidgetProps {
  onClose: () => void;
}

// ─── Mock data — used until backend implements /ramps/quote and /ramps/onramp ──

const MOCK_DEFAULT_QUOTES: RampQuote[] = [
  { quoteId: 'meld-default', provider: 'Meld', fee: 1.2, feeCurrency: 'USD', rate: 1, rail: 'ACH', protocol: 'REST', estimatedTime: '~20 min', recommended: true },
];

const MOCK_QUOTES: Partial<Record<string, RampQuote[]>> & { DEFAULT: RampQuote[] } = {
  MX: [
    { quoteId: 'etherfuse-mx', provider: 'Etherfuse', fee: 0.5, feeCurrency: 'MXN', rate: 17.2, rail: 'SPEI', protocol: 'SEP-24', estimatedTime: '~10 min', recommended: true },
    { quoteId: 'alfredpay-mx', provider: 'AlfredPay', fee: 0.8, feeCurrency: 'MXN', rate: 17.1, rail: 'SPEI', protocol: 'REST', estimatedTime: '~15 min', recommended: false },
  ],
  BR: [{ quoteId: 'abroad-br', provider: 'Abroad', fee: 0.6, feeCurrency: 'BRL', rate: 5.1, rail: 'PIX', protocol: 'REST', estimatedTime: '~5 min', recommended: true }],
  CO: [
    { quoteId: 'abroad-co', provider: 'Abroad', fee: 0.7, feeCurrency: 'COP', rate: 4100, rail: 'PSE', protocol: 'REST', estimatedTime: '~10 min', recommended: true },
    { quoteId: 'koywe-co', provider: 'Koywe', fee: 0.9, feeCurrency: 'COP', rate: 4095, rail: 'PSE', protocol: 'REST', estimatedTime: '~15 min', recommended: false },
  ],
  DEFAULT: MOCK_DEFAULT_QUOTES,
};

const MOCK_PAYMENT: PaymentInstructions = {
  type: 'CLABE',
  value: '646180157088723456',
  amount: 1000,
  currency: 'MXN',
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
};

// ────────────────────────────────────────────────────────────────────────────────

export function RampWidget({ onClose }: RampWidgetProps) {
  const { getClient, walletAddress, styles } = usePollar();

  const [step, setStep] = useState<RampStep>('input');
  const [direction, setDirection] = useState<RampDirection>('onramp');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('MXN');
  const [country, setCountry] = useState('MX');
  const [quotes, setQuotes] = useState<RampQuote[]>([]);
  const [paymentInstructions, setPaymentInstructions] = useState<PaymentInstructions | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const client = getClient();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  async function handleFindRoute() {
    setStep('loading_quote');
    setIsLoading(true);

    try {
      // Real call — will work once backend implements /ramps/quote
      const result = await client.getRampsQuote({
        country,
        amount: Number(amount),
        currency,
        direction,
      });
      if (result.quotes) setQuotes(result.quotes);
    } catch {
      // Backend not ready yet — fall back to mock data
      await new Promise((r) => setTimeout(r, 1500));
      setQuotes(MOCK_QUOTES[country] ?? MOCK_DEFAULT_QUOTES);
    } finally {
      setIsLoading(false);
      setStep('select_route');
    }
  }

  async function handleSelectQuote(quote: RampQuote) {
    if (!walletAddress) return;
    setIsLoading(true);

    const body: RampsOnrampBody = {
      quoteId: `${quote.provider}-${Date.now()}`,
      amount: Number(amount),
      currency,
      country,
      walletAddress,
    };

    try {
      // Real call — will work once backend implements /ramps/onramp
      const result = await client.createOnRamp(body);
      setPaymentInstructions(result.paymentInstructions);
    } catch {
      // Backend not ready yet — fall back to mock data
      await new Promise((r) => setTimeout(r, 800));
      setPaymentInstructions({ ...MOCK_PAYMENT, currency });
    } finally {
      setIsLoading(false);
      setStep('payment_instructions');
    }
  }

  function handleCopy(value: string) {
    navigator.clipboard.writeText(value).catch(() => {});
  }

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
        paymentInstructions={paymentInstructions}
        isLoading={isLoading}
        onDirectionChange={setDirection}
        onAmountChange={setAmount}
        onCurrencyChange={setCurrency}
        onCountryChange={setCountry}
        onFindRoute={handleFindRoute}
        onSelectQuote={handleSelectQuote}
        onCopy={handleCopy}
        onClose={onClose}
      />
    </div>
  );
}
