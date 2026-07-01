'use client';

import type { RampDirection, RampQuote, RampTxStatus } from '@pollar/core';
import type { CSSProperties } from 'react';
import { RouteDisplay } from './RouteDisplay';

export type RampStep = 'input' | 'loading_quote' | 'select_route' | 'status' | 'error';

interface RampWidgetTemplateProps {
  theme: string;
  accentColor: string;
  step: RampStep;
  direction: RampDirection;
  amount: string;
  currency: string;
  country: string;
  quotes: RampQuote[];
  isLoading: boolean;
  // status step
  provider: string;
  txStatus: RampTxStatus | null;
  kycUrl: string | null;
  stellarTxHash: string | null;
  canComplete: boolean;
  completing: boolean;
  errorMsg: string | null;
  onDirectionChange: (d: RampDirection) => void;
  onAmountChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
  onCountryChange: (v: string) => void;
  onFindRoute: () => void;
  onSelectQuote: (q: RampQuote) => void;
  onOpenKyc: () => void;
  onCompleteWithdraw: () => void;
  onRetry: () => void;
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

const STATUS_LABEL: Record<RampTxStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
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
  isLoading,
  provider,
  txStatus,
  kycUrl,
  stellarTxHash,
  canComplete,
  completing,
  errorMsg,
  onDirectionChange,
  onAmountChange,
  onCurrencyChange,
  onCountryChange,
  onFindRoute,
  onSelectQuote,
  onOpenKyc,
  onCompleteWithdraw,
  onRetry,
  onClose,
}: RampWidgetTemplateProps) {
  const isDark = theme === 'dark';

  const cssVars = {
    '--pollar-accent': accentColor,
    '--pollar-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': isDark ? '#ffffff' : '#111827',
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    '--pollar-input-bg': isDark ? '#374151' : '#f9fafb',
    '--pollar-error-bg': isDark ? '#2a1515' : '#fef2f2',
    '--pollar-error-border': isDark ? '#7f1d1d' : '#fecaca',
    '--pollar-error-text': isDark ? '#f87171' : '#dc2626',
    '--pollar-success-text': isDark ? '#4ade80' : '#16a34a',
    '--pollar-buttons-border-radius': '6px',
    '--pollar-buttons-height': '44px',
    '--pollar-input-height': '44px',
    '--pollar-input-border-radius': '0.5rem',
    '--pollar-card-border-radius': '10px',
    '--pollar-modal-padding': '2rem',
    '--pollar-modal-heading-size': '1.375rem',
    '--pollar-modal-subtitle-size': '0.9rem',
  } as CSSProperties;

  const stepTitle: Record<RampStep, string> = {
    input: direction === 'onramp' ? 'Buy crypto' : 'Sell crypto',
    loading_quote: 'Finding best route',
    select_route: 'Select provider',
    status: direction === 'onramp' ? 'Complete your deposit' : 'Complete your withdrawal',
    error: 'Something went wrong',
  };

  const stepSubtitle: Record<RampStep, string> = {
    input: direction === 'onramp' ? 'Enter the amount you want to deposit' : 'Enter the amount you want to withdraw',
    loading_quote: 'Comparing providers in real time…',
    select_route: 'All prices include fees',
    status: `Finish the flow at ${provider || 'the provider'} to continue`,
    error: 'Please try again',
  };

  return (
    <div className="pollar-modal-card pollar-ramp-modal" style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-ramp-header">
        <h2 className="pollar-ramp-title">{stepTitle[step]}</h2>
        <p className="pollar-ramp-subtitle">{stepSubtitle[step]}</p>
      </div>

      {step === 'input' && (
        <>
          <div className="pollar-ramp-tabs">
            <button
              type="button"
              className="pollar-ramp-tab"
              data-active={direction === 'onramp'}
              onClick={() => onDirectionChange('onramp')}
            >
              Buy
            </button>
            <button
              type="button"
              className="pollar-ramp-tab"
              data-active={direction === 'offramp'}
              onClick={() => onDirectionChange('offramp')}
            >
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

          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="pollar-btn-primary" disabled={!amount || isLoading} onClick={onFindRoute}>
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
          <button type="button" className="pollar-btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </>
      )}

      {step === 'status' && (
        <div className="pollar-ramp-payment">
          <div className="pollar-ramp-payment-field">
            <span className="pollar-ramp-payment-label">Provider</span>
            <div className="pollar-ramp-payment-value">
              <code>{provider}</code>
            </div>
          </div>

          <div className="pollar-ramp-payment-field">
            <span className="pollar-ramp-payment-label">Status</span>
            <div className="pollar-ramp-payment-value">
              <code
                style={{ color: txStatus === 'completed' ? 'var(--pollar-success-text)' : undefined }}
              >
                {txStatus ? STATUS_LABEL[txStatus] : 'Processing'}
              </code>
            </div>
          </div>

          {stellarTxHash && (
            <div className="pollar-ramp-payment-field">
              <span className="pollar-ramp-payment-label">Stellar tx</span>
              <div className="pollar-ramp-payment-value">
                <code>
                  {stellarTxHash.slice(0, 8)}…{stellarTxHash.slice(-8)}
                </code>
              </div>
            </div>
          )}

          {kycUrl && txStatus !== 'completed' && (
            <button type="button" className="pollar-btn-primary" onClick={onOpenKyc}>
              Continue at {provider}
            </button>
          )}

          {canComplete && (
            <button type="button" className="pollar-btn-primary" disabled={completing} onClick={onCompleteWithdraw}>
              {completing ? 'Submitting…' : "I've completed KYC — withdraw"}
            </button>
          )}

          {errorMsg && (
            <p className="pollar-ramp-payment-note" style={{ color: 'var(--pollar-error-text)' }}>
              {errorMsg}
            </p>
          )}

          <button type="button" className="pollar-btn-secondary" onClick={onClose}>
            {txStatus === 'completed' ? 'Done' : 'Close'}
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="pollar-ramp-payment">
          <p className="pollar-ramp-payment-note" style={{ color: 'var(--pollar-error-text)' }}>
            {errorMsg ?? 'Unexpected error.'}
          </p>
          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="pollar-btn-primary" onClick={onRetry}>
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
