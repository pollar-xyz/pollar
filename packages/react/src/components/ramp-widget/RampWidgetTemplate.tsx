'use client';

import type {
  RampCountry,
  RampDepositInstructions,
  RampDirection,
  RampInstructionField,
  RampQuote,
  RampTxStatus,
} from '@pollar/core';
import { RouteDisplay } from './RouteDisplay';
import { CopyButton } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';

export type RampStep = 'input' | 'loading_quote' | 'select_route' | 'contact' | 'status' | 'error';

// Basic client-side email check so an invalid address never round-trips to the
// provider (which rejects it with a generic VALIDATION_ERROR).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A collected field is complete when it's non-empty and (for email) well-formed.
 * An `optional` field is complete while blank, but still has to be well-formed
 * once something is typed into it.
 */
function isFieldValid(spec: RampFieldSpec, raw: string | undefined): boolean {
  const value = (raw ?? '').trim();
  if (!value) return spec.optional === true;
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
  options?: { value: string; label: string; placeholder?: string }[];
  /** Declared but not mandatory (Abroad's tax id). Blank must not block Continue. */
  optional?: boolean;
  /** Example of the expected shape, for formats a user cannot guess. */
  placeholder?: string;
  /**
   * Key of a sibling `select` whose chosen option supplies the placeholder. One
   * Pix field can then show a CPF mask, an email or a +55 number as the user
   * switches kind, without this component knowing what a Pix key is.
   */
  placeholderFrom?: string;
  /** Secondary line under the field, for a rule the label has no room for. */
  hint?: string;
}

/** "a", "a and b", "a, b and c" — for naming what a step is asking for. */
function listOf(items: string[]): string {
  const last = items[items.length - 1];
  if (last === undefined) return 'a few details';
  if (items.length === 1) return last;
  return `${items.slice(0, -1).join(', ')} and ${last}`;
}

/** The placeholder to show: the one a sibling select dictates, else the static one. */
function placeholderFor(field: RampFieldSpec, fields: RampFieldSpec[], values: Record<string, string>): string | undefined {
  if (field.placeholderFrom) {
    const source = fields.find((f) => f.key === field.placeholderFrom);
    const chosen = source?.options?.find((o) => o.value === values[field.placeholderFrom as string]);
    if (chosen?.placeholder) return chosen.placeholder;
  }
  return field.placeholder;
}

interface RampWidgetTemplateProps {
  theme: string;
  accentColor: string;
  /** Per-app modal chrome overrides (background, card + button radius). */
  styleOverrides?: ModalStyleOverrides;
  step: RampStep;
  /** Labels of the steps this run goes through. Length varies by route: only
   *  providers that collect fields add a 'Details' step. */
  flowSteps: string[];
  /** Index into `flowSteps`, or -1 when the current step is outside the flow
   *  (the error step) and the progress bar should be hidden. */
  flowStepIndex: number;
  /** Quote whose start request is in flight, so its row can show it. */
  startingQuoteId: string | null;
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
  /** Provider gated the flow on KYC and published no link; nothing was signed. */
  kycBlocking: boolean;
  /** The gate has since cleared — the user needs a fresh quote to continue. */
  kycJustApproved: boolean;
  stellarTxHash: string | null;
  /** Stellar Expert URL for `stellarTxHash` (network-aware); null when unknown. */
  explorerUrl: string | null;
  depositInstructions: RampDepositInstructions | null;
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
  /** Step back to the amount, keeping what was entered. Distinct from `onRetry`
   *  (which restarts a failed flow) so a "Back" button reads as navigation. */
  onBack: () => void;
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

/**
 * A timestamp field arrives as ISO-8601 (the server no longer guesses at epoch
 * milliseconds); render it in the viewer's locale. Anything unparseable falls
 * back to the raw string rather than showing "Invalid Date".
 */
function displayValue(field: RampInstructionField): string {
  if (field.type !== 'datetime') return field.value;
  const at = new Date(field.value);
  return Number.isNaN(at.getTime()) ? field.value : at.toLocaleString();
}

export function RampWidgetTemplate({
  theme,
  accentColor,
  styleOverrides,
  step,
  flowSteps,
  flowStepIndex,
  startingQuoteId,
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
  kycBlocking,
  kycJustApproved,
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
  onBack,
  onRetry,
  onRefresh,
  onClose,
}: RampWidgetTemplateProps) {
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides, 'hero');

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
    // What this step actually asks for is whatever the route declared, and that
    // is rarely a name and an email: an Abroad off-ramp asks where to send the
    // money, not who you are. Say which, rather than asserting the Bridge case
    // over every provider.
    contact: `${provider || 'This provider'} needs ${listOf(requiredFields.filter((f) => !f.optional).map((f) => f.label.toLowerCase()))} to continue`,
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
              className={refreshing ? 'pollar-modal-refresh-icon pollar-spinning' : 'pollar-modal-refresh-icon'}
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

      {/* How far along the run is. The segment count comes from the route, not
          from a constant: a provider that collects no fields genuinely has one
          step fewer. Hidden on the error step, which is not part of the flow. */}
      {flowStepIndex >= 0 && flowSteps.length > 0 && (
        <div className="pollar-ramp-steps">
          <span className="pollar-ramp-steps-label">
            Step {flowStepIndex + 1} of {flowSteps.length}
          </span>
          <div
            className="pollar-ramp-steps-track"
            role="progressbar"
            aria-valuenow={flowStepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={flowSteps.length}
            aria-label={flowSteps[flowStepIndex]}
          >
            {flowSteps.map((label, i) => (
              <span key={label} className="pollar-ramp-steps-segment" data-done={i <= flowStepIndex || undefined} />
            ))}
          </div>
        </div>
      )}

      {step === 'input' && (
        <>
          <div className="pollar-tabs">
            <button
              type="button"
              className="pollar-tab"
              data-active={direction === 'onramp'}
              onClick={() => onDirectionChange('onramp')}
            >
              Buy
            </button>
            <button
              type="button"
              className="pollar-tab"
              data-active={direction === 'offramp'}
              onClick={() => onDirectionChange('offramp')}
            >
              Sell
            </button>
          </div>

          <div className="pollar-ramp-field">
            <label className="pollar-ramp-label">Country</label>
            {countriesLoading ? (
              <div className="pollar-ramp-input pollar-select-loading">
                <span className="pollar-spinner pollar-spinner-sm" />
                <span>Loading countries…</span>
              </div>
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
            {/* Why the user was sent back here (e.g. the route's minimum), kept
                under the field they came to fix. Clears as soon as they type. */}
            {errorMsg && <span className="pollar-ramp-field-error">{errorMsg}</span>}
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
          <div className="pollar-spinner pollar-ramp-loading-spinner" />
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
              <RouteDisplay
                key={i}
                quote={q}
                busy={startingQuoteId != null && q.quoteId === startingQuoteId}
                disabled={startingQuoteId != null && q.quoteId !== startingQuoteId}
                onSelect={onSelectQuote}
              />
            ))}
          </div>
          {/* A route whose limits the amount breaks reports it here, so the user
              can pick another route or go back and edit — without leaving the
              list for the error step. */}
          {errorMsg && (
            <p className="pollar-ramp-payment-note" style={{ color: 'var(--pollar-error-text)' }}>
              {errorMsg}
            </p>
          )}
          {/* Back returns to the amount, which is the only way out of a route
              whose minimum the amount misses — so it takes the primary weight
              while that message is up. The header's ✕ still closes the modal. */}
          <button type="button" className={errorMsg ? 'pollar-btn-primary' : 'pollar-btn-secondary'} onClick={onBack}>
            Back
          </button>
        </>
      )}

      {step === 'contact' && (
        <>
          {requiredFields.map((f) => (
            <div key={f.key} className="pollar-ramp-field">
              <label className="pollar-ramp-label">
                {f.label}
                {f.optional && <span className="pollar-ramp-field-optional"> (optional)</span>}
              </label>
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
                  placeholder={placeholderFor(f, requiredFields, fieldValues)}
                  autoComplete={f.type === 'email' ? 'email' : 'off'}
                  onChange={(e) => onFieldChange(f.key, e.target.value)}
                />
              )}
              {f.hint && <span className="pollar-ramp-field-hint">{f.hint}</span>}
              {f.type === 'email' && (fieldValues[f.key] ?? '').trim() !== '' && !isFieldValid(f, fieldValues[f.key]) && (
                <span className="pollar-ramp-field-error">Enter a valid email address.</span>
              )}
            </div>
          ))}

          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-secondary" onClick={onBack}>
              Back
            </button>
            <button
              type="button"
              className="pollar-btn-primary"
              disabled={requiredFields.some((f) => !isFieldValid(f, fieldValues[f.key])) || isLoading}
              onClick={onContactContinue}
            >
              {isLoading ? (
                <>
                  <span className="pollar-spinner pollar-spinner-sm" />
                  Starting…
                </>
              ) : (
                'Continue'
              )}
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
              {txStatus !== 'completed' && txStatus !== 'failed' && (
                <span className="pollar-spinner pollar-spinner-sm" aria-label="Checking status" />
              )}
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
                      <path
                        d="M6 3H3v8h8V8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M8.5 2.5h3v3M11 3L6.5 7.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* The code to scan. The server sends it rendered, so there is no QR
              library here and no per-provider branch: a Pollar-made SVG is
              inlined (it uses `currentColor`, so it follows the modal's theme),
              and a provider's own bitmap goes through an <img>. */}
          {depositInstructions?.scannable && txStatus !== 'completed' && (
            <div className="pollar-ramp-payment-field">
              <span className="pollar-ramp-payment-label">Payment QR</span>
              <div className="pollar-ramp-payment-value">
                {depositInstructions.scannable.image.inlineSafe ? (
                  <div
                    className="pollar-ramp-qr"
                    aria-label="Payment QR"
                    dangerouslySetInnerHTML={{ __html: depositInstructions.scannable.image.data }}
                  />
                ) : (
                  <img
                    src={`data:${depositInstructions.scannable.image.mediaType};base64,${depositInstructions.scannable.image.data}`}
                    alt="Payment QR"
                    style={{ width: '100%', maxWidth: 220, height: 'auto', display: 'block', margin: '0 auto' }}
                  />
                )}
              </div>
            </div>
          )}

          {/* The payload as text, when it is worth pasting. On the phone holding
              the screen there is nothing to scan, and a Pix code is designed to
              be pasted. The server decides by setting `payloadLabel`. */}
          {depositInstructions?.scannable?.payload &&
            depositInstructions.scannable.payloadLabel &&
            txStatus !== 'completed' && (
              <div className="pollar-ramp-payment-field">
                <span className="pollar-ramp-payment-label">{depositInstructions.scannable.payloadLabel}</span>
                <div className="pollar-ramp-payment-value">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code style={{ flex: 1, wordBreak: 'break-all' }}>{depositInstructions.scannable.payload}</code>
                    <CopyButton
                      value={depositInstructions.scannable.payload}
                      label={`Copy ${depositInstructions.scannable.payloadLabel}`}
                    />
                  </span>
                </div>
              </div>
            )}

          {/* Everything else. Labelled and formatted server-side, so this only
              iterates — it knows nothing about which provider served the route. */}
          {depositInstructions &&
            txStatus !== 'completed' &&
            depositInstructions.fields.map((f) => (
              <div key={f.key} className="pollar-ramp-payment-field">
                <span className="pollar-ramp-payment-label">{f.label}</span>
                <div className="pollar-ramp-payment-value">
                  {f.copyable ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code style={{ flex: 1, wordBreak: 'break-all' }}>{f.value}</code>
                      <CopyButton value={f.value} label={`Copy ${f.label}`} />
                    </span>
                  ) : f.type === 'url' ? (
                    <a href={f.value} target="_blank" rel="noopener noreferrer">
                      {f.value}
                    </a>
                  ) : (
                    <span>{displayValue(f)}</span>
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

          {/* Link-less KYC gate: there is nowhere to send the user, so say what
              is blocking and keep the withdraw button out of reach. No funds
              have moved and nothing was signed. */}
          {kycBlocking && (
            <p className="pollar-ramp-payment-note">
              {provider} needs to verify your identity before this payout. Nothing has been sent yet — complete verification
              with {provider}, and this will update on its own.
            </p>
          )}

          {kycJustApproved && (
            <p className="pollar-ramp-payment-note">
              {provider} approved your verification. Request a new quote to continue — the previous one was consumed.
            </p>
          )}

          {canComplete && (
            <button type="button" className="pollar-btn-primary" disabled={completing} onClick={onCompleteWithdraw}>
              {completing ? (
                <>
                  <span className="pollar-spinner pollar-spinner-sm" />
                  Submitting…
                </>
              ) : (
                "I've completed KYC — withdraw"
              )}
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
