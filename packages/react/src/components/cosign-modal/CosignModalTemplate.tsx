'use client';

import { type CosignRequest, type CosignVerification, fromBaseUnits } from '@pollar/core';
import { useState } from 'react';
import { CopyButton, cropAddress, PollarModalFooter } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';

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
  onSelect: (request: CosignRequest) => void;
  onApprove: (request: CosignRequest) => void;
  onReject: (request: CosignRequest) => void;
  onClose: () => void;
}

const OPERATION_LABELS: Record<string, string> = {
  payment: 'Send',
  path_payment_strict_send: 'Swap',
  change_trust: 'Add asset',
  create_account: 'Create account',
  invoke_contract: 'Contract call',
  manage_data: 'Manage data',
};

function labelOf(request: CosignRequest): string {
  const op = request.operation ?? '';
  return OPERATION_LABELS[op] ?? (op ? op.replace(/_/g, ' ') : 'Transaction');
}

function expiresIn(request: CosignRequest): string {
  const ms = new Date(request.expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
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

function detailRows(request: CosignRequest): Array<[string, string]> {
  const details = (request.details ?? {}) as Record<string, unknown>;
  const rows: Array<[string, string]> = [];
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    rows.push([
      label,
      typeof value === 'string' && value.length > 24 && /^[GC][A-Z2-7]{55}$/.test(value) ? cropAddress(value) : String(value),
    ]);
  };
  push('Destination', details.destination);
  const readable = readableAmount(details);
  push('Amount', readable ? `${readable.amount} ${readable.symbol}` : details.amount);
  push('Asset', details.asset ?? details.assetCode ?? readable?.symbol);
  push('Network', request.network);
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
  onSelect,
  onApprove,
  onReject,
  onClose,
}: CosignModalTemplateProps) {
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
        <h2 className="pollar-modal-title">Confirm with your device</h2>
        <div className="pollar-modal-header-actions">
          <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close" title="Close">
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
                {lastResolved.status === 'APPROVED'
                  ? 'Approved'
                  : lastResolved.status === 'REJECTED'
                    ? 'Rejected'
                    : lastResolved.status.toLowerCase()}
              </p>
              <p className="pollar-cosign-muted">
                {lastResolved.submit?.hash ? (
                  <>
                    Sent. Transaction{' '}
                    {explorerUrl ? (
                      <a className="pollar-cosign-tx-link" href={explorerUrl} target="_blank" rel="noopener noreferrer">
                        {cropAddress(lastResolved.submit.hash)}
                      </a>
                    ) : (
                      cropAddress(lastResolved.submit.hash)
                    )}
                    <CopyButton
                      value={lastResolved.submit.hash}
                      label="Copy transaction hash"
                      className="pollar-copy-btn-sm pollar-cosign-copy"
                    />
                  </>
                ) : lastResolved.signedXdr ? (
                  'Signed. The app will send it.'
                ) : (
                  'Nothing was signed.'
                )}
              </p>
            </>
          ) : (
            <p className="pollar-cosign-muted">Nothing waits for your approval.</p>
          )}
          {nextStep && (
            <p className="pollar-cosign-next">
              <span className="pollar-spinner pollar-spinner-sm" aria-hidden /> Next: {nextStep}. It appears here in a few
              seconds.
            </p>
          )}
          {closesIn !== null && <p className="pollar-cosign-muted pollar-cosign-closing">Closing in {closesIn}s</p>}
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
                <span>{labelOf(r)}</span>
                <span className="pollar-cosign-muted">{expiresIn(r)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {current && (
        <div className="pollar-cosign-detail">
          <div className="pollar-cosign-detail-head">
            <p className="pollar-cosign-detail-title">{labelOf(current)}</p>
            {!verification && (
              <span className="pollar-cosign-chip">
                <span className="pollar-spinner pollar-spinner-sm" aria-hidden />
                Checking...
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
                Verified
              </button>
            )}
          </div>
          {current.summary && <p className="pollar-cosign-muted">{current.summary}</p>}
          <dl className="pollar-cosign-rows">
            {detailRows(current).map(([k, v]) => (
              <div key={k} className="pollar-cosign-row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div className="pollar-cosign-row">
              <dt>Expires in</dt>
              <dd>{expiresIn(current)}</dd>
            </div>
          </dl>

          {verification?.ok && verifiedOpen && (
            <div className="pollar-cosign-verify pollar-cosign-verify-ok">
              Checked against Turnkey: this is exactly what will be signed.
            </div>
          )}
          {/* A failed check stays spelled out: it is the only place the user learns why Approve is off. */}
          {verification && !verification.ok && (
            <div className="pollar-cosign-verify pollar-cosign-verify-bad">Not verified: {verification.reason}</div>
          )}

          {error && <div className="pollar-cosign-error">{error}</div>}

          <div className="pollar-cosign-actions">
            <button
              type="button"
              className="pollar-cosign-btn pollar-cosign-btn-secondary"
              disabled={!!busy}
              onClick={() => onReject(current)}
            >
              {busy === 'rejecting' ? 'Rejecting...' : 'Reject'}
            </button>
            <button
              type="button"
              className="pollar-cosign-btn pollar-cosign-btn-primary"
              disabled={!canVote}
              onClick={() => onApprove(current)}
            >
              {busy === 'approving' ? 'Approving...' : 'Approve'}
            </button>
          </div>
        </div>
      )}

      <PollarModalFooter />
    </div>
  );
}
