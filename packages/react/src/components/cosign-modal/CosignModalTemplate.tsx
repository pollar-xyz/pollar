'use client';

import { useInheritedLanguage } from '../../language-context';
import { type CosignRequest, type CosignVerification, fromBaseUnits, type PollarLanguage } from '@pollar/core';
import { useState } from 'react';
import { CopyButton, cropAddress, PollarModalFooter } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';
import { COSIGN_COPY } from './cosign-copy';

type CosignCopy = (typeof COSIGN_COPY)[PollarLanguage];

export interface CosignModalTemplateProps {
  theme: string;
  accentColor: string;
  /** Per-app modal chrome overrides (background, card + button radius). */
  styleOverrides?: ModalStyleOverrides;
  /** Requests waiting for this device's vote, oldest first. */
  pending: CosignRequest[];
  /** The request shown in detail; the first pending one when not chosen. */
  current: CosignRequest | null;
  /** Verification of `current`, or null while it runs. */
  verification: CosignVerification | null;
  busy: 'approving' | 'rejecting' | null;
  error: string | null;
  /** Approve stays off for a request whose approval just failed. */
  approveBlocked?: boolean;
  /** The last request that reached a final state, shown once the list is empty. */
  lastResolved?: CosignRequest;
  /** Explorer page of {@link lastResolved}'s transaction, when it was sent. */
  explorerUrl?: string | null;
  /** Seconds until the modal closes on its own, while what it shows needs nothing from the user. */
  closesIn?: number | null;
  /** The approval coming next in the same flow, shown while the modal waits for it. */
  nextStep?: string | null;
  /** Language of the modal's text; the device's when not given. */
  language?: PollarLanguage | undefined;
  onSelect: (request: CosignRequest) => void;
  onApprove: (request: CosignRequest) => void;
  onReject: (request: CosignRequest) => void;
  onClose: () => void;
}

function labelOf(request: CosignRequest, copy: CosignCopy): string {
  const op = request.operation ?? '';
  return copy.operations[op] ?? (op ? op.replace(/_/g, ' ') : copy.transaction);
}

function expiresIn(request: CosignRequest, copy: CosignCopy): string {
  const ms = new Date(request.expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return copy.expired;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** A base-unit amount with the `decimals` and `symbol` written next to it, as the user reads it; null when either is missing. */
function readableAmount(details: Record<string, unknown>): { amount: string; symbol: string } | null {
  const { amount, decimals, symbol } = details;
  if (typeof amount !== 'string' || typeof decimals !== 'number' || typeof symbol !== 'string') return null;
  try {
    return { amount: fromBaseUnits(amount, decimals), symbol };
  } catch {
    return null;
  }
}

function detailRows(request: CosignRequest, copy: CosignCopy): Array<[string, string]> {
  const details = (request.details ?? {}) as Record<string, unknown>;
  const rows: Array<[string, string]> = [];
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    rows.push([
      label,
      typeof value === 'string' && value.length > 24 && /^[GC][A-Z2-7]{55}$/.test(value) ? cropAddress(value) : String(value),
    ]);
  };
  push(copy.rows.destination, details.destination);
  const readable = readableAmount(details);
  push(copy.rows.amount, readable ? `${readable.amount} ${readable.symbol}` : details.amount);
  push(copy.rows.asset, details.asset ?? details.assetCode ?? readable?.symbol);
  push(copy.rows.network, request.network);
  return rows;
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="7" fill="currentColor" />
      <path d="M3.5 7l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CosignModalTemplate({
  theme,
  accentColor,
  styleOverrides,
  pending,
  current,
  verification,
  busy,
  error,
  approveBlocked = false,
  lastResolved,
  explorerUrl,
  closesIn = null,
  nextStep = null,
  language: languageProp,
  onSelect,
  onApprove,
  onReject,
  onClose,
}: CosignModalTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = COSIGN_COPY[language];
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);
  const verified = verification?.ok === true;
  const canVote = !!current && verified && !busy && !approveBlocked;
  // Keyed by request id, so the explanation folds back when another request is shown.
  const [verifiedOpenFor, setVerifiedOpenFor] = useState<string | null>(null);
  const verifiedOpen = !!current && verifiedOpenFor === current.id;

  return (
    <div
      className="pollar-modal-card pollar-cosign-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">{copy.title}</h2>
        <div className="pollar-modal-header-actions">
          <button type="button" className="pollar-modal-close" onClick={onClose} aria-label={copy.close} title={copy.close}>
            <CloseIcon />
          </button>
        </div>
      </div>

      {pending.length === 0 && (
        <div className="pollar-cosign-empty">
          {lastResolved ? (
            <>
              {lastResolved.status === 'APPROVED' && (
                <svg className="pollar-cosign-approved-icon" width="44" height="44" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <circle cx="7" cy="7" r="7" fill="currentColor" />
                  <path
                    d="M3.5 7l2.5 2.5 4.5-5"
                    stroke="white"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <p className="pollar-cosign-empty-title">
                {copy.status[lastResolved.status] ?? lastResolved.status.toLowerCase()}
              </p>
              <p className="pollar-cosign-muted">
                {lastResolved.submit?.hash ? (
                  <>
                    {copy.sentTransaction}{' '}
                    {explorerUrl ? (
                      <a className="pollar-cosign-tx-link" href={explorerUrl} target="_blank" rel="noopener noreferrer">
                        {cropAddress(lastResolved.submit.hash)}
                      </a>
                    ) : (
                      cropAddress(lastResolved.submit.hash)
                    )}
                    <CopyButton
                      value={lastResolved.submit.hash}
                      label={copy.copyHash}
                      className="pollar-copy-btn-sm pollar-cosign-copy"
                    />
                  </>
                ) : lastResolved.signedXdr ? (
                  copy.signedAppSends
                ) : (
                  copy.nothingSigned
                )}
              </p>
            </>
          ) : (
            <p className="pollar-cosign-muted">{copy.nothingWaiting}</p>
          )}
          {nextStep && (
            <p className="pollar-cosign-next">
              <span className="pollar-spinner pollar-spinner-sm" aria-hidden /> {copy.next(nextStep)}
            </p>
          )}
          {closesIn !== null && <p className="pollar-cosign-muted pollar-cosign-closing">{copy.closingIn(closesIn)}</p>}
        </div>
      )}

      {pending.length > 1 && (
        <ul className="pollar-cosign-list">
          {pending.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={`pollar-cosign-item${current?.id === r.id ? ' pollar-cosign-item-active' : ''}`}
                onClick={() => onSelect(r)}
              >
                <span>{labelOf(r, copy)}</span>
                <span className="pollar-cosign-muted">{expiresIn(r, copy)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {current && (
        <div className="pollar-cosign-detail">
          <div className="pollar-cosign-detail-head">
            <p className="pollar-cosign-detail-title">{labelOf(current, copy)}</p>
            {!verification && (
              <span className="pollar-cosign-chip">
                <span className="pollar-spinner pollar-spinner-sm" aria-hidden />
                {copy.checking}
              </span>
            )}
            {verification?.ok && (
              <button
                type="button"
                className="pollar-cosign-chip pollar-cosign-chip-ok"
                aria-expanded={verifiedOpen}
                onClick={() => setVerifiedOpenFor(verifiedOpen ? null : current.id)}
              >
                <VerifiedIcon />
                {copy.verified}
              </button>
            )}
          </div>
          {current.summary && <p className="pollar-cosign-muted">{current.summary}</p>}
          <dl className="pollar-cosign-rows">
            {detailRows(current, copy).map(([k, v]) => (
              <div key={k} className="pollar-cosign-row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div className="pollar-cosign-row">
              <dt>{copy.expiresIn}</dt>
              <dd>{expiresIn(current, copy)}</dd>
            </div>
          </dl>

          {verification?.ok && verifiedOpen && (
            <div className="pollar-cosign-verify pollar-cosign-verify-ok">{copy.checkedAgainstTurnkey}</div>
          )}
          {/* A failed check stays spelled out: it is the only place the user learns why Approve is off. */}
          {verification && !verification.ok && (
            <div className="pollar-cosign-verify pollar-cosign-verify-bad">
              {copy.notVerified} {verification.reason}
            </div>
          )}

          {error && <div className="pollar-cosign-error">{error}</div>}

          <div className="pollar-cosign-actions">
            <button
              type="button"
              className="pollar-cosign-btn pollar-cosign-btn-secondary"
              disabled={!!busy}
              onClick={() => onReject(current)}
            >
              {busy === 'rejecting' ? copy.rejecting : copy.reject}
            </button>
            <button
              type="button"
              className="pollar-cosign-btn pollar-cosign-btn-primary"
              disabled={!canVote}
              onClick={() => onApprove(current)}
            >
              {busy === 'approving' ? copy.approving : copy.approve}
            </button>
          </div>
        </div>
      )}

      <PollarModalFooter />
    </div>
  );
}
