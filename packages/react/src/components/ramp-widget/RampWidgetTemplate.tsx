'use client';

import type { RampCountry, RampDirection, RampQuote, RampTxStatus } from '@pollar/core';
import type { CSSProperties } from 'react';
import { RouteDisplay } from './RouteDisplay';
import { CopyButton } from '../commons';

export type RampStep = 'input' | 'loading_quote' | 'select_route' | 'contact' | 'status' | 'error';

// Basic client-side email check so an invalid address never round-trips to the
// provider (which rejects it with a generic VALIDATION_ERROR).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A collected field is complete when it's non-empty and (for email) well-formed. */
function isFieldValid(spec: RampFieldSpec, raw: string | undefined): boolean {
  const value = (raw ?? '').trim();
  if (!value) return false;
  if (spec.type === 'email') return EMAIL_RE.test(value);
  return true;
}

/** A field a provider declares (via the quote) that the client must collect. */
export interface RampFieldSpec {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'select';
  bankType?: 'CLABE' | 'PIX' | 'PSE' | 'ACH' | 'BREB';
  /** For `type: 'select'` — dropdown choices (e.g. Stereum's Bolivian banks). */
  options?: { value: string; label: string }[];
}

interface RampWidgetTemplateProps {
  theme: string;
  accentColor: string;
  step: RampStep;
  direction: RampDirection;
  amount: string;
  currency: string;
  country: string;
  requiredFields: RampFieldSpec[];
  fieldValues: Record<string, string>;
  countries: RampCountry[];
  countriesLoading: boolean;
  refreshing: boolean;
  quotes: RampQuote[];
  isLoading: boolean;
  // status step
  provider: string;
  txStatus: RampTxStatus | null;
  kycUrl: string | null;
  tosUrl: string | null;
  stellarTxHash: string | null;
  /** Stellar Expert URL for `stellarTxHash` (network-aware); null when unknown. */
  explorerUrl: string | null;
  depositInstructions: Record<string, unknown> | null;
  canComplete: boolean;
  completing: boolean;
  errorMsg: string | null;
  onDirectionChange: (d: RampDirection) => void;
  onAmountChange: (v: string) => void;
  onFieldChange: (key: string, value: string) => void;
  onCountryChange: (v: string) => void;
  onFindRoute: () => void;
  onSelectQuote: (q: RampQuote) => void;
  onContactContinue: () => void;
  onOpenKyc: () => void;
  onOpenTos: () => void;
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

// Human labels for the deposit-instruction fields REST providers (Bridge) return
// (e.g. a Pix `br_code`, or bank details for ACH/SEPA). Unknown keys fall back to
// the raw key so nothing is silently dropped.
const INSTRUCTION_LABELS: Record<string, string> = {
  br_code: 'Pix code',
  account_holder_name: 'Account holder',
  bank_name: 'Bank',
  bank_address: 'Bank address',
  bank_account_number: 'Account number',
  bank_routing_number: 'Routing number',
  iban: 'IBAN',
  bic: 'BIC',
  clabe: 'CLABE',
  amount: 'Amount',
  currency: 'Currency',
  payment_rails: 'Rails',
};

type InstructionKind = 'text' | 'qr' | 'datetime';
type InstructionField = { key: string; label: string; value: string; kind: InstructionKind };

function flattenInstructions(instr: Record<string, unknown>): InstructionField[] {
  const out: InstructionField[] = [];
  for (const [k, v] of Object.entries(instr)) {
    // A base64 QR image (e.g. Stereum's Bolivian bank QR) — render as an <img>,
    // not raw text.
    if (k === 'qrBase64') {
      if (typeof v === 'string' && v) out.push({ key: k, label: INSTRUCTION_LABELS[k] ?? 'Payment QR', value: v, kind: 'qr' });
      continue;
    }
    // Expiry timestamps come as epoch milliseconds — render as a local date/time.
    if ((k === 'expiresAt' || k === 'expires_at') && (typeof v === 'number' || typeof v === 'string')) {
      const ms = Number(v);
      if (Number.isFinite(ms) && ms > 0) {
        out.push({ key: k, label: INSTRUCTION_LABELS[k] ?? 'Expires', value: new Date(ms).toLocaleString(), kind: 'datetime' });
      }
      continue;
    }
    let value = '';
    if (typeof v === 'string' || typeof v === 'number') value = String(v);
    else if (Array.isArray(v)) value = v.filter((x) => typeof x === 'string' || typeof x === 'number').join(', ');
    else continue;
    if (!value) continue;
    out.push({ key: k, label: INSTRUCTION_LABELS[k] ?? k, value, kind: 'text' });
  }
  return out;
}

export function RampWidgetTemplate({
  theme,
  accentColor,
  step,
  direction,
  amount,
  currency,
  country,
  requiredFields,
  fieldValues,
  countries,
  countriesLoading,
  refreshing,
  quotes,
  isLoading,
  provider,
  txStatus,
  kycUrl,
  tosUrl,
  stellarTxHash,
  explorerUrl,
  depositInstructions,
  canComplete,
  completing,
  errorMsg,
  onDirectionChange,
  onAmountChange,
  onFieldChange,
  onCountryChange,
  onFindRoute,
  onSelectQuote,
  onContactContinue,
  onOpenKyc,
  onOpenTos,
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
    contact: 'Your details',
    status: direction === 'onramp' ? 'Complete your deposit' : 'Complete your withdrawal',
    error: 'Something went wrong',
  };

  const stepSubtitle: Record<RampStep, string> = {
    input: direction === 'onramp' ? 'Enter the amount you want to deposit' : 'Enter the amount you want to withdraw',
    loading_quote: 'Comparing providers in real time…',
    select_route: 'All prices include fees',
    contact: `${provider || 'This provider'} needs your name and email to verify you`,
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

          <div className="pollar-ramp-field">
            <label className="pollar-ramp-label">Amount{currency ? ` (${currency})` : ''}</label>
            <input
              type="number"
              className="pollar-ramp-input"
              placeholder="0.00"
              value={amount}
              min="0"
              onChange={(e) => onAmountChange(e.target.value)}
            />
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

      {step === 'contact' && (
        <>
          {requiredFields.map((f) => (
            <div key={f.key} className="pollar-ramp-field">
              <label className="pollar-ramp-label">{f.label}</label>
              {f.type === 'select' ? (
                <select
                  className="pollar-ramp-input"
                  value={fieldValues[f.key] ?? ''}
                  onChange={(e) => onFieldChange(f.key, e.target.value)}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type}
                  className="pollar-ramp-input"
                  value={fieldValues[f.key] ?? ''}
                  autoComplete={f.type === 'email' ? 'email' : 'off'}
                  onChange={(e) => onFieldChange(f.key, e.target.value)}
                />
              )}
              {f.type === 'email' && (fieldValues[f.key] ?? '').trim() !== '' && !isFieldValid(f, fieldValues[f.key]) && (
                <span className="pollar-ramp-field-error">Enter a valid email address.</span>
              )}
            </div>
          ))}

          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-secondary" onClick={onRetry}>
              Back
            </button>
            <button
              type="button"
              className="pollar-btn-primary"
              disabled={requiredFields.some((f) => !isFieldValid(f, fieldValues[f.key])) || isLoading}
              onClick={onContactContinue}
            >
              {isLoading ? 'Starting…' : 'Continue'}
            </button>
          </div>
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
              <div className="pollar-ramp-payment-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ flex: 1, wordBreak: 'break-all' }}>
                  {stellarTxHash.slice(0, 8)}…{stellarTxHash.slice(-8)}
                </code>
                <CopyButton value={stellarTxHash} label="Copy transaction hash" />
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pollar-copy-btn"
                    aria-label="View on Stellar Expert"
                    title="View on Stellar Expert"
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <path d="M6 3H3v8h8V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M8.5 2.5h3v3M11 3L6.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          )}

          {depositInstructions &&
            txStatus !== 'completed' &&
            flattenInstructions(depositInstructions).map(({ key, label, value, kind }) => (
              <div key={key} className="pollar-ramp-payment-field">
                <span className="pollar-ramp-payment-label">{label}</span>
                <div className="pollar-ramp-payment-value">
                  {kind === 'qr' ? (
                    <img
                      src={value.startsWith('data:') ? value : `data:image/png;base64,${value}`}
                      alt={label}
                      style={{ width: '100%', maxWidth: 220, height: 'auto', display: 'block', margin: '0 auto' }}
                    />
                  ) : kind === 'datetime' ? (
                    <span>{value}</span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code style={{ flex: 1, wordBreak: 'break-all' }}>{value}</code>
                      <CopyButton value={value} label={`Copy ${label}`} />
                    </span>
                  )}
                </div>
              </div>
            ))}

          {/* KYC / ToS onboarding steps at the provider. Hidden once deposit
              instructions exist — by then onboarding is done and the only
              remaining action is to pay using the instructions above. */}
          {tosUrl && !depositInstructions && txStatus !== 'completed' && (
            <button type="button" className="pollar-btn-primary" onClick={onOpenTos}>
              Accept terms at {provider}
            </button>
          )}

          {kycUrl && !depositInstructions && txStatus !== 'completed' && (
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
