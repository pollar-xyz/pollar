'use client';

import type {
  RampAsset,
  RampDirection,
  RampField,
  RampFiat,
  RampOrder,
  RampQuote,
  RampQuoteRejection,
  RampScannable,
  StellarNetwork,
} from '@pollar/core';
import { describeRampAction, rampLegStatus, rampLegTitle, rampResolutionText } from '@pollar/core';
import { RejectedRouteDisplay, RouteDisplay } from './RouteDisplay';
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
function isFieldValid(spec: RampField, raw: string | undefined): boolean {
  const value = (raw ?? '').trim();
  if (!value) return spec.optional === true;
  if (spec.type === 'email') return EMAIL_RE.test(value);
  return true;
}

/**
 * The `src` for a scannable that is not inline-safe. `encoding` and `inlineSafe`
 * are independent: an SVG a provider sent (so not inline-safe) still arrives as
 * `utf8`, and base64-wrapping that text yields a data URL the browser cannot
 * decode - a blank QR on the payment screen.
 */
function scannableImageSrc(image: RampScannable['image']): string {
  return image.encoding === 'base64'
    ? `data:${image.mediaType};base64,${image.data}`
    : `data:${image.mediaType};charset=utf-8,${encodeURIComponent(image.data)}`;
}

/** "a", "a and b", "a, b and c" - for naming what a step is asking for. */
function listOf(items: string[]): string {
  const last = items[items.length - 1];
  if (last === undefined) return 'a few details';
  if (items.length === 1) return last;
  return `${items.slice(0, -1).join(', ')} and ${last}`;
}

/** The placeholder to show: the one a sibling select dictates, else the static one. */
function placeholderFor(field: RampField, fields: RampField[], values: Record<string, string>): string | undefined {
  if (field.placeholderFrom) {
    const source = fields.find((f) => f.key === field.placeholderFrom);
    const chosen = source?.options?.find((o) => o.value === values[field.placeholderFrom as string]);
    if (chosen?.placeholder) return chosen.placeholder;
  }
  return field.placeholder;
}

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

const CHAIN_NAME: Record<string, string> = { STELLAR: 'Stellar', POLYGON: 'Polygon', SOLANA: 'Solana' };

/** The explorer transaction URL by chain; testnet is Solana devnet and Polygon Amoy. */
function explorerTxUrl(chain: string, hash: string, network: StellarNetwork): string {
  const testnet = network === 'testnet';
  if (chain === 'SOLANA') return `https://explorer.solana.com/tx/${hash}${testnet ? '?cluster=devnet' : ''}`;
  if (chain === 'POLYGON') return `https://${testnet ? 'amoy.' : ''}polygonscan.com/tx/${hash}`;
  return `https://stellar.expert/explorer/${testnet ? 'testnet' : 'public'}/tx/${hash}`;
}

/** The chain a leg's on-chain transaction ran on: where its funds left from, else where they arrived. */
function legChain(leg: RampOrder['legs'][number]): string {
  if (leg.from.kind === 'asset') return leg.from.chain;
  return leg.to.kind === 'asset' ? leg.to.chain : 'STELLAR';
}

export const fiatKey = (fiat: Pick<RampFiat, 'currency' | 'rail'>) => `${fiat.currency}:${fiat.rail}`;
export const assetKey = (asset: Pick<RampAsset, 'code' | 'chain' | 'identifier'>) =>
  `${asset.code}:${asset.chain}:${asset.identifier ?? ''}`;

interface RampWidgetTemplateProps {
  theme: string;
  accentColor: string;
  /** Per-app modal chrome overrides (background, card + button radius). */
  styleOverrides?: ModalStyleOverrides;
  network: StellarNetwork;
  step: RampStep;
  /** Labels of the steps this run goes through: 'Details' only when the route asks for fields. */
  flowSteps: string[];
  /** Index into `flowSteps`, or -1 outside the flow (the error step). */
  flowStepIndex: number;
  direction: RampDirection;
  routesLoading: boolean;
  countries: Array<{ country: string; fiats: RampFiat[] }>;
  country: string;
  fiats: RampFiat[];
  fiat: RampFiat | null;
  assets: RampAsset[];
  asset: RampAsset | null;
  amount: string;
  quotes: RampQuote[];
  rejected: RampQuoteRejection[];
  /** Quote whose order request is in flight, so its row can show it. */
  startingQuoteId: string | null;
  fields: RampField[];
  fieldValues: Record<string, string>;
  order: RampOrder | null;
  /** Orders waiting on the user, to resume. */
  pendingOrders: RampOrder[];
  isLoading: boolean;
  refreshing: boolean;
  signing: boolean;
  errorMsg: string | null;
  onDirectionChange: (direction: RampDirection) => void;
  onCountryChange: (country: string) => void;
  onFiatChange: (key: string) => void;
  onAssetChange: (key: string) => void;
  onAmountChange: (value: string) => void;
  onFindRoute: () => void;
  onSelectQuote: (quote: RampQuote) => void;
  onFieldChange: (key: string, value: string) => void;
  onContactContinue: () => void;
  onSign: () => void;
  onApprove: () => void;
  onResumeOrder: (id: string) => void;
  onNewOrder: () => void;
  /** Step back, keeping what was entered. */
  onBack: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  onClose: () => void;
}

const LOADING_STEPS = ['Checking routes…', 'Quoting each step…', 'Route found!'];

export function RampWidgetTemplate({
  theme,
  accentColor,
  styleOverrides,
  network,
  step,
  flowSteps,
  flowStepIndex,
  direction,
  routesLoading,
  countries,
  country,
  fiats,
  fiat,
  assets,
  asset,
  amount,
  quotes,
  rejected,
  startingQuoteId,
  fields,
  fieldValues,
  order,
  pendingOrders,
  isLoading,
  refreshing,
  signing,
  errorMsg,
  onDirectionChange,
  onCountryChange,
  onFiatChange,
  onAssetChange,
  onAmountChange,
  onFindRoute,
  onSelectQuote,
  onFieldChange,
  onContactContinue,
  onSign,
  onApprove,
  onResumeOrder,
  onNewOrder,
  onBack,
  onRetry,
  onRefresh,
  onClose,
}: RampWidgetTemplateProps) {
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides, 'hero');
  const onramp = direction === 'ONRAMP';
  const sendUnit = onramp ? fiat?.currency : asset?.code;
  const view = order ? describeRampAction(order) : null;
  const settled = order ? ['completed', 'failed', 'refunded'].includes(order.state) : false;

  const stepTitle: Record<RampStep, string> = {
    input: onramp ? 'Buy crypto' : 'Sell crypto',
    loading_quote: 'Finding the best route',
    select_route: 'Choose a route',
    contact: 'Your details',
    status: order?.state === 'completed' ? 'Transfer completed' : onramp ? 'Your purchase' : 'Your sale',
    error: 'Something went wrong',
  };
  const stepSubtitle: Record<RampStep, string> = {
    input: onramp ? 'Pick what you receive and how much you pay' : 'Pick what you sell and how much',
    loading_quote: 'Comparing routes in real time…',
    select_route: 'All amounts include fees',
    contact: `This route needs ${listOf(fields.filter((f) => !f.optional).map((f) => f.label.toLowerCase()))} to continue`,
    status: view?.title ?? 'Processing',
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

      {step === 'input' && pendingOrders.length > 0 && (
        <section className="pollar-ramp-payment pollar-ramp-saved" aria-label="Pending operations">
          <p className="pollar-ramp-payment-note">
            These operations are waiting for you. Starting another does not cancel them.
          </p>
          {pendingOrders.map((pending) => (
            <div className="pollar-ramp-saved-row" key={pending.id}>
              <button
                type="button"
                className="pollar-btn-secondary"
                disabled={isLoading}
                onClick={() => onResumeOrder(pending.id)}
              >
                Resume {pending.direction === 'ONRAMP' ? 'purchase' : 'sale'} · {pending.id.slice(-8)}
              </button>
            </div>
          ))}
        </section>
      )}

      {step === 'input' && (
        <>
          <div className="pollar-tabs">
            <button type="button" className="pollar-tab" data-active={onramp} onClick={() => onDirectionChange('ONRAMP')}>
              Buy
            </button>
            <button type="button" className="pollar-tab" data-active={!onramp} onClick={() => onDirectionChange('OFFRAMP')}>
              Sell
            </button>
          </div>

          {routesLoading ? (
            <div className="pollar-ramp-input pollar-select-loading">
              <span className="pollar-spinner pollar-spinner-sm" />
              <span>Loading routes…</span>
            </div>
          ) : countries.length === 0 ? (
            <div className="pollar-modal-error">No ramp routes are available for this app yet.</div>
          ) : (
            <>
              <div className="pollar-ramp-field">
                <label className="pollar-ramp-label" htmlFor="pollar-ramp-country">
                  Country
                </label>
                <select
                  id="pollar-ramp-country"
                  className="pollar-ramp-input"
                  value={country}
                  onChange={(e) => onCountryChange(e.target.value)}
                >
                  {countries.map((c) => (
                    <option key={c.country} value={c.country}>
                      {flagEmoji(c.country)} {c.country}
                    </option>
                  ))}
                </select>
              </div>

              {fiats.length > 1 && (
                <div className="pollar-ramp-field">
                  <label className="pollar-ramp-label" htmlFor="pollar-ramp-fiat">
                    {onramp ? 'Pay with' : 'Receive in'}
                  </label>
                  <select
                    id="pollar-ramp-fiat"
                    className="pollar-ramp-input"
                    value={fiat ? fiatKey(fiat) : ''}
                    onChange={(e) => onFiatChange(e.target.value)}
                  >
                    {fiats.map((f) => (
                      <option key={fiatKey(f)} value={fiatKey(f)}>
                        {f.currency} · {f.rail}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pollar-ramp-field">
                <label className="pollar-ramp-label" htmlFor="pollar-ramp-asset">
                  {onramp ? 'Receive' : 'Sell'}
                </label>
                <select
                  id="pollar-ramp-asset"
                  className="pollar-ramp-input"
                  value={asset ? assetKey(asset) : ''}
                  onChange={(e) => onAssetChange(e.target.value)}
                >
                  {assets.map((a) => (
                    <option key={assetKey(a)} value={assetKey(a)}>
                      {a.code} on {CHAIN_NAME[a.chain] ?? a.chain}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pollar-ramp-field">
                <label className="pollar-ramp-label" htmlFor="pollar-ramp-amount">
                  {onramp ? 'You pay' : 'You sell'}
                  {sendUnit ? ` (${sendUnit})` : ''}
                </label>
                <input
                  id="pollar-ramp-amount"
                  type="number"
                  inputMode="decimal"
                  className="pollar-ramp-input"
                  placeholder="0.00"
                  value={amount}
                  min="0"
                  onChange={(e) => onAmountChange(e.target.value)}
                />
                {errorMsg && <span className="pollar-ramp-field-error">{errorMsg}</span>}
              </div>
            </>
          )}

          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="pollar-btn-primary"
              disabled={!amount || !fiat || !asset || isLoading || routesLoading}
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
                key={q.quoteId}
                quote={q}
                best={i === 0}
                busy={startingQuoteId === q.quoteId}
                disabled={startingQuoteId != null && q.quoteId !== startingQuoteId}
                onSelect={onSelectQuote}
              />
            ))}
            {rejected.map((r, i) => (
              <RejectedRouteDisplay key={i} rejection={r} />
            ))}
          </div>
          {quotes.length === 0 && (
            <p className="pollar-ramp-payment-note">No route can take this amount right now. Try another amount.</p>
          )}
          {errorMsg && (
            <p className="pollar-ramp-payment-note" style={{ color: 'var(--pollar-error-text)' }}>
              {errorMsg}
            </p>
          )}
          <button
            type="button"
            className={errorMsg || !quotes.length ? 'pollar-btn-primary' : 'pollar-btn-secondary'}
            onClick={onBack}
          >
            Back
          </button>
        </>
      )}

      {step === 'contact' && (
        <>
          {fields.map((f) => (
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
                  placeholder={placeholderFor(f, fields, fieldValues)}
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
          {errorMsg && <p className="pollar-ramp-field-error">{errorMsg}</p>}

          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-secondary" onClick={onBack}>
              Back
            </button>
            <button
              type="button"
              className="pollar-btn-primary"
              disabled={fields.some((f) => !isFieldValid(f, fieldValues[f.key])) || isLoading}
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

      {step === 'status' && order && view && (
        <div className="pollar-ramp-payment">
          <ol className="pollar-ramp-legs" aria-label="Progress">
            {order.legs.map((leg) => {
              const status = rampLegStatus(leg);
              const hash = leg.onchainTxHash;
              return (
                <li key={leg.index} className="pollar-ramp-leg" data-status={status}>
                  <span className="pollar-ramp-leg-dot" aria-hidden />
                  <span className="pollar-ramp-leg-title">{rampLegTitle(leg)}</span>
                  {status === 'active' && !settled && (
                    <span className="pollar-spinner pollar-spinner-sm" aria-label="In progress" />
                  )}
                  {hash && (
                    <a
                      className="pollar-ramp-leg-link"
                      href={explorerTxUrl(legChain(leg), hash, network)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {hash.slice(0, 6)}…{hash.slice(-4)}
                    </a>
                  )}
                </li>
              );
            })}
          </ol>

          {order.failure && (
            <div className="pollar-ramp-payment-field">
              <span className="pollar-ramp-payment-label">What to do</span>
              <p className="pollar-ramp-payment-note">{rampResolutionText(order.failure)}</p>
              <div className="pollar-ramp-payment-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ flex: 1, wordBreak: 'break-all' }}>Order {order.id}</code>
                <CopyButton value={order.id} label="Copy order id" />
              </div>
            </div>
          )}

          {!settled && view.scannable && (
            <div className="pollar-ramp-payment-field">
              <span className="pollar-ramp-payment-label">Payment QR</span>
              <div className="pollar-ramp-payment-value">
                {view.scannable.image.inlineSafe ? (
                  <div
                    className="pollar-ramp-qr"
                    aria-label="Payment QR"
                    dangerouslySetInnerHTML={{ __html: view.scannable.image.data }}
                  />
                ) : (
                  <img
                    src={scannableImageSrc(view.scannable.image)}
                    alt="Payment QR"
                    style={{ width: '100%', maxWidth: 220, height: 'auto', display: 'block', margin: '0 auto' }}
                  />
                )}
              </div>
            </div>
          )}
          {!settled && view.scannable?.payload && view.scannable.payloadLabel && (
            <div className="pollar-ramp-payment-field">
              <span className="pollar-ramp-payment-label">{view.scannable.payloadLabel}</span>
              <div className="pollar-ramp-payment-value">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <code style={{ flex: 1, wordBreak: 'break-all' }}>{view.scannable.payload}</code>
                  <CopyButton value={view.scannable.payload} label={`Copy ${view.scannable.payloadLabel}`} />
                </span>
              </div>
            </div>
          )}
          {!settled &&
            view.details.map((d) => (
              <div key={d.label} className="pollar-ramp-payment-field">
                <span className="pollar-ramp-payment-label">{d.label}</span>
                <div className="pollar-ramp-payment-value">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code style={{ flex: 1, wordBreak: 'break-all' }}>{d.value}</code>
                    <CopyButton value={d.value} label={`Copy ${d.label}`} />
                  </span>
                </div>
              </div>
            ))}

          {!settled && view.canSign && (
            <button type="button" className="pollar-btn-primary" disabled={signing} onClick={onSign}>
              {signing ? 'Waiting for your wallet…' : 'Authorize'}
            </button>
          )}
          {!settled && view.canApprove && (
            <button type="button" className="pollar-btn-primary" onClick={onApprove}>
              Approve on this device
            </button>
          )}
          {!settled && view.link && (
            <a
              className="pollar-btn-primary pollar-ramp-hosted-link"
              href={view.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Complete verification
            </a>
          )}
          {!settled && order.pendingAction?.kind === 'KYC' && !view.link && (
            <p className="pollar-ramp-payment-note">The provider is reviewing your details. This updates on its own.</p>
          )}
          {errorMsg && <p className="pollar-ramp-field-error">{errorMsg}</p>}

          <div className="pollar-ramp-explore">
            <button type="button" className="pollar-btn-secondary" onClick={onNewOrder}>
              Start another operation
            </button>
            {!settled && <p className="pollar-ramp-payment-note">This one keeps going; you can resume it later.</p>}
          </div>
        </div>
      )}

      {step === 'error' && (
        <>
          <div className="pollar-modal-error">{errorMsg ?? 'Something went wrong.'}</div>
          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="pollar-btn-primary" onClick={onRetry}>
              Try again
            </button>
          </div>
        </>
      )}
    </div>
  );
}
