'use client';

import { useInheritedLanguage } from '../../language-context';
import { type CosignRequest, type CosignVerification, type PollarLanguage, type StellarNetwork } from '@pollar/core';
import { useState } from 'react';
import { CHAIN_LOGOS } from '../../constants';
import { CopyButton, cropAddress, PollarModalFooter } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';
import { AssetLogo, TxFeeBadge, TxReview } from '../tx-review/TxReview';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { headlineAsset, reviewFromRequest } from '../tx-review/tx-review-model';
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
  /** This device is not one of the wallet's devices: it cannot vote, only reject, until it is added. */
  deviceNotLinked?: boolean;
  /** Opens where this device gets added; the button shows only with it. */
  onLinkDevice?: () => void;
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
  /** The app's network, shown next to the chain in the details. */
  network?: StellarNetwork | undefined;
  onSelect: (request: CosignRequest) => void;
  onApprove: (request: CosignRequest) => void;
  onReject: (request: CosignRequest) => void;
  /** The user asked to close (the X): the container closes or asks first. */
  onClose: () => void;
  /** Closing was asked while a request waits: the modal asks before leaving it unsigned. */
  confirmingClose?: boolean;
  onKeepOpen?: () => void;
  onCloseAnyway?: () => void;
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

/**
 * The logo next to the title: the asset the action moves with its chain in the
 * corner, or the chain alone when it moves no asset.
 */
export function TitleMark({ chain, asset }: { chain: string | undefined; asset?: string | undefined }) {
  const src = chain ? CHAIN_LOGOS[chain as keyof typeof CHAIN_LOGOS] : undefined;
  if (!asset) return src ? <img className="pollar-cosign-chain" src={src} alt="" aria-hidden /> : null;
  return (
    <span className="pollar-cosign-mark" aria-hidden>
      <AssetLogo key={asset} asset={asset} small />
      {src && <img className="pollar-cosign-mark-chain" src={src} alt="" />}
    </span>
  );
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
  deviceNotLinked = false,
  onLinkDevice,
  lastResolved,
  explorerUrl,
  closesIn = null,
  nextStep = null,
  language: languageProp,
  network,
  onSelect,
  onApprove,
  onReject,
  onClose,
  confirmingClose = false,
  onKeepOpen,
  onCloseAnyway,
}: CosignModalTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = COSIGN_COPY[language];
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);
  const verified = verification?.ok === true && !deviceNotLinked;
  const canVote = !!current && verified && !busy && !approveBlocked;
  // Keyed by request id, so the explanation folds back when another request is shown.
  const [verifiedOpenFor, setVerifiedOpenFor] = useState<string | null>(null);
  const verifiedOpen = !!current && verifiedOpenFor === current.id;
  const reviewOf = (request: CosignRequest) =>
    reviewFromRequest(
      {
        chain: request.network,
        network,
        operation: request.operation,
        summary: request.summary,
        details: request.details,
        signWith: request.account ?? request.signWith,
        raw: request.unsignedPayload,
        fallbackTitle: labelOf(request, copy),
        extraRows: [{ label: copy.expiresIn, value: expiresIn(request, copy) }],
        appPaysFee: request.appPaysFee,
      },
      TX_REVIEW_COPY[language],
    );
  const review = current ? reviewOf(current) : null;
  const grouped = pending.length > 1;
  // One request: the header is the action itself. Several: how many wait, and each names itself below.
  const shown = grouped ? null : (current ?? (pending.length === 0 ? lastResolved : undefined) ?? null);
  const shownReview = shown ? (shown === current ? review : reviewOf(shown)) : null;
  const heading = confirmingClose
    ? copy.closeTitle
    : grouped
      ? copy.manyPending(pending.length)
      : (shownReview?.title ?? copy.title);

  const chip = current && !confirmingClose && (
    <>
      {!verification && !deviceNotLinked && (
        <span className="pollar-cosign-chip">
          <span className="pollar-spinner pollar-spinner-sm" aria-hidden />
          {copy.checking}
        </span>
      )}
      {verified && (
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
    </>
  );

  return (
    <div
      className="pollar-modal-card pollar-cosign-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title pollar-cosign-heading">
          {!confirmingClose && (
            <TitleMark chain={shown?.network} asset={shownReview ? headlineAsset(shownReview) : undefined} />
          )}
          <span>{heading}</span>
        </h2>
        <div className="pollar-modal-header-actions">
          {!grouped && chip}
          {!confirmingClose && (
            <button type="button" className="pollar-modal-close" onClick={onClose} aria-label={copy.close} title={copy.close}>
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {confirmingClose ? (
        <div className="pollar-cosign-leave">
          <p className="pollar-cosign-muted">{copy.closeBody}</p>
          <button type="button" className="pollar-cosign-btn pollar-cosign-btn-primary" onClick={onKeepOpen}>
            {copy.backToSign}
          </button>
          <button type="button" className="pollar-cosign-text-btn" onClick={onCloseAnyway}>
            {copy.closeAnyway}
          </button>
        </div>
      ) : (
        <>
          {pending.length === 0 && (
            <div className="pollar-cosign-empty">
              {lastResolved ? (
                <>
                  {lastResolved.status === 'APPROVED' && (
                    <svg
                      className="pollar-cosign-approved-icon"
                      width="44"
                      height="44"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden
                    >
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
                  {lastResolved.submit?.sponsored !== undefined && (
                    <p className="pollar-cosign-fee">
                      <TxFeeBadge sponsored={lastResolved.submit.sponsored} language={language} />
                    </p>
                  )}
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

          {grouped && (
            <ul className="pollar-cosign-list">
              {pending.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`pollar-cosign-item${current?.id === r.id ? ' pollar-cosign-item-active' : ''}`}
                    onClick={() => onSelect(r)}
                  >
                    <span className="pollar-cosign-heading">
                      <TitleMark chain={r.network} asset={headlineAsset(reviewOf(r))} />
                      {reviewOf(r).title}
                    </span>
                    <span className="pollar-cosign-muted">{expiresIn(r, copy)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {current && review && (
            <div className={`pollar-cosign-detail${grouped ? ' pollar-cosign-detail-grouped' : ''}`}>
              {grouped && (
                <div className="pollar-cosign-detail-head">
                  <p className="pollar-cosign-detail-title">{review.title}</p>
                  {chip}
                </div>
              )}
              <TxReview
                key={current.id}
                data={review}
                language={language}
                detailsIntro={{ title: copy.whyTitle, body: copy.whyBody }}
                detailsAction={{
                  label: busy === 'rejecting' ? copy.rejecting : copy.rejectRequest,
                  onClick: () => onReject(current),
                  disabled: !!busy,
                }}
              />

              {verified && verifiedOpen && (
                <div className="pollar-cosign-verify pollar-cosign-verify-ok">{copy.checkedExact}</div>
              )}
              {/* A failed check stays spelled out: it is the only place the user learns why Approve is off. */}
              {deviceNotLinked ? (
                <div className="pollar-cosign-verify pollar-cosign-verify-bad">
                  {copy.deviceNotLinked}
                  {onLinkDevice && (
                    <button type="button" className="pollar-cosign-link" onClick={onLinkDevice}>
                      {copy.linkDevice}
                    </button>
                  )}
                </div>
              ) : (
                verification &&
                !verification.ok && (
                  <div className="pollar-cosign-verify pollar-cosign-verify-bad">
                    {copy.notVerified} {verification.reason}
                  </div>
                )
              )}

              {error && <div className="pollar-cosign-error">{error}</div>}

              <button
                type="button"
                className="pollar-cosign-btn pollar-cosign-btn-primary"
                disabled={!canVote}
                onClick={() => onApprove(current)}
              >
                {busy === 'approving' ? copy.approving : review.kind === 'activate_wallet' ? copy.activateWallet : copy.approve}
              </button>
            </div>
          )}
        </>
      )}

      <PollarModalFooter />
    </div>
  );
}
