'use client';

import type { RampCountry, RampDirection, RampQuote, RampTxStatus } from '@pollar/core';
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
  countries: RampCountry[];
  countriesLoading: boolean;
  refreshing: boolean;
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
  onRefresh: () => void;
  onClose: () => void;
}

const LOADING_STEPS = ['Detecting your country…', 'Consulting providers…', 'Route found!'];

/**
 * Flag emoji from a 2-letter ISO 3166-1 alpha-2 country code by mapping each
 * letter to its Regional Indicator Symbol code point (U+1F1E6 = 'A'). Returns an
 * empty string for anything that isn't a pair of ASCII letters.
 */
function flagEmoji(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  const base = 0x1f1e6;
  return String.fromCodePoint(base + (cc.charCodeAt(0) - 65), base + (cc.charCodeAt(1) - 65));
}

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
  countries,
  countriesLoading,
  refreshing,
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
  onRefresh,
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
      <div className="pollar-modal-header">
        <div className="pollar-ramp-header-text">
          <h2 className="pollar-modal-title">{stepTitle[step]}</h2>
          <p className="pollar-ramp-subtitle">{stepSubtitle[step]}</p>
        </div>
        <div className="pollar-modal-header-actions">
          <button type="button" className="pollar-modal-close" onClick={onRefresh} disabled={refreshing} aria-label="Refresh">
            <svg
              className={refreshing ? 'pollar-modal-refresh-icon spinning' : 'pollar-modal-refresh-icon'}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
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
            {countriesLoading ? (
              <div className="pollar-ramp-input pollar-ramp-input-loading">Loading countries…</div>
            ) : countries.length === 0 ? (
              <div className="pollar-modal-error">No ramp providers available on this network yet.</div>
            ) : (
              <select className="pollar-ramp-input" value={country} onChange={(e) => onCountryChange(e.target.value)}>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {flagEmoji(c.code)} {c.code}
                    {c.currency ? ` — ${c.currency}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="pollar-btn-primary"
              disabled={!amount || isLoading || countriesLoading || countries.length === 0}
              onClick={onFindRoute}
            >
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
              <code style={{ color: txStatus === 'completed' ? 'var(--pollar-success-text)' : undefined }}>
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
