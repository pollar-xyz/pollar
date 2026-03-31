'use client';

import type { PaymentInstructions, RampDirection, RampQuote } from '@pollar/core';
import type { CSSProperties } from 'react';
import { RouteDisplay } from './RouteDisplay';

export type RampStep = 'input' | 'loading_quote' | 'select_route' | 'payment_instructions';

interface RampWidgetTemplateProps {
  theme: string;
  accentColor: string;
  step: RampStep;
  direction: RampDirection;
  amount: string;
  currency: string;
  country: string;
  quotes: RampQuote[];
  paymentInstructions: PaymentInstructions | null;
  isLoading: boolean;
  onDirectionChange: (d: RampDirection) => void;
  onAmountChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
  onCountryChange: (v: string) => void;
  onFindRoute: () => void;
  onSelectQuote: (q: RampQuote) => void;
  onCopy: (value: string) => void;
  onClose: () => void;
}

const LOADING_STEPS = ['Detecting your country…', 'Consulting providers…', 'Route found!'];

const COUNTRY_CURRENCIES: Record<string, string> = {
  MX: 'MXN',
  BR: 'BRL',
  CO: 'COP',
  CL: 'CLP',
  PE: 'PEN',
  AR: 'ARS',
};

export function RampWidgetTemplate({
  theme,
  accentColor,
  step,
  direction,
  amount,
  currency,
  country,
  quotes,
  paymentInstructions,
  isLoading,
  onDirectionChange,
  onAmountChange,
  onCurrencyChange,
  onCountryChange,
  onFindRoute,
  onSelectQuote,
  onCopy,
  onClose,
}: RampWidgetTemplateProps) {
  const isDark = theme === 'dark';

  const cssVars = {
    '--pollar-accent': accentColor,
    '--pollar-buttons-border-radius': '6px',
    '--pollar-buttons-height': '44px',
    '--pollar-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': isDark ? '#ffffff' : '#111827',
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    '--pollar-input-bg': isDark ? '#374151' : '#f9fafb',
  } as CSSProperties;

  const stepTitle: Record<RampStep, string> = {
    input: direction === 'onramp' ? 'Buy crypto' : 'Sell crypto',
    loading_quote: 'Finding best route',
    select_route: 'Select provider',
    payment_instructions: 'Payment instructions',
  };

  const stepSubtitle: Record<RampStep, string> = {
    input: direction === 'onramp' ? 'Enter the amount you want to deposit' : 'Enter the amount you want to withdraw',
    loading_quote: 'Comparing providers in real time…',
    select_route: 'All prices include fees',
    payment_instructions: 'Send the exact amount to complete your transaction',
  };

  return (
    <div className="pollar-ramp-modal" style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-ramp-header">
        <h2 className="pollar-ramp-title">{stepTitle[step]}</h2>
        <p className="pollar-ramp-subtitle">{stepSubtitle[step]}</p>
      </div>

      {step === 'input' && (
        <>
          <div className="pollar-ramp-tabs">
            <button type="button" className="pollar-ramp-tab" data-active={direction === 'onramp'} onClick={() => onDirectionChange('onramp')}>
              Buy
            </button>
            <button type="button" className="pollar-ramp-tab" data-active={direction === 'offramp'} onClick={() => onDirectionChange('offramp')}>
              Sell
            </button>
          </div>

          <div className="pollar-ramp-input-row">
            <div className="pollar-ramp-field">
              <label className="pollar-ramp-label">Amount</label>
              <input
                type="number"
                className="pollar-ramp-input"
                placeholder="0.00"
                value={amount}
                min="0"
                onChange={(e) => onAmountChange(e.target.value)}
              />
            </div>
            <div className="pollar-ramp-field" style={{ maxWidth: 90 }}>
              <label className="pollar-ramp-label">Currency</label>
              <input
                type="text"
                className="pollar-ramp-input"
                placeholder="MXN"
                value={currency}
                maxLength={5}
                onChange={(e) => onCurrencyChange(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="pollar-ramp-field">
            <label className="pollar-ramp-label">Country</label>
            <select
              className="pollar-ramp-input"
              value={country}
              onChange={(e) => {
                const c = e.target.value;
                onCountryChange(c);
                if (COUNTRY_CURRENCIES[c]) onCurrencyChange(COUNTRY_CURRENCIES[c]);
              }}
            >
              <option value="MX">🇲🇽 Mexico</option>
              <option value="BR">🇧🇷 Brazil</option>
              <option value="CO">🇨🇴 Colombia</option>
              <option value="CL">🇨🇱 Chile</option>
              <option value="PE">🇵🇪 Peru</option>
              <option value="AR">🇦🇷 Argentina</option>
            </select>
          </div>

          <div className="pollar-ramp-actions">
            <button type="button" className="pollar-ramp-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="pollar-ramp-btn-primary" disabled={!amount || isLoading} onClick={onFindRoute}>
              Find best route
            </button>
          </div>
        </>
      )}

      {step === 'loading_quote' && (
        <div className="pollar-ramp-loading">
          {LOADING_STEPS.map((text, i) => (
            <div key={i} className="pollar-ramp-loading-row">
              <div className="pollar-ramp-loading-dot" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}

      {step === 'select_route' && (
        <>
          <div className="pollar-ramp-route-list">
            {quotes.map((q, i) => (
              <RouteDisplay key={i} quote={q} onSelect={onSelectQuote} />
            ))}
          </div>
          <button type="button" className="pollar-ramp-btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </>
      )}

      {step === 'payment_instructions' && paymentInstructions && (
        <div className="pollar-ramp-payment">
          <p className="pollar-ramp-payment-title">{paymentInstructions.type}</p>

          <div className="pollar-ramp-payment-field">
            <span className="pollar-ramp-payment-label">
              {paymentInstructions.type === 'CLABE' ? 'CLABE number' : paymentInstructions.type === 'PIX' ? 'PIX key' : 'Account number'}
            </span>
            <div className="pollar-ramp-payment-value">
              <code>{paymentInstructions.value}</code>
              <button type="button" className="pollar-ramp-copy-btn" onClick={() => onCopy(paymentInstructions.value)}>
                Copy
              </button>
            </div>
          </div>

          <div className="pollar-ramp-payment-field">
            <span className="pollar-ramp-payment-label">Amount to send</span>
            <div className="pollar-ramp-payment-value">
              <code>
                {paymentInstructions.amount.toLocaleString()} {paymentInstructions.currency}
              </code>
              <button
                type="button"
                className="pollar-ramp-copy-btn"
                onClick={() => onCopy(`${paymentInstructions.amount} ${paymentInstructions.currency}`)}
              >
                Copy
              </button>
            </div>
          </div>

          {paymentInstructions.expiresAt && (
            <p className="pollar-ramp-payment-note">
              Instructions expire at {new Date(paymentInstructions.expiresAt).toLocaleTimeString()}
            </p>
          )}

          <button type="button" className="pollar-ramp-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
