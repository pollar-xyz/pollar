'use client';

import type { KycProvider, KycStartResponse, KycStatus as KycStatusValue, PollarLanguage } from '@pollar/core';
import { PollarModalFooter } from '../commons';
import { deviceLanguage } from '../commons-copy';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';
import { KycStatus as KycStatusBadge } from './KycStatus';
import { KYC_COPY } from './kyc-copy';
import { kycProcessingMessage, kycReviewMessage } from './kyc-messages';

export type KycStep = 'select_provider' | 'verifying' | 'polling' | 'done';

interface KycModalTemplateProps {
  theme: string;
  accentColor: string;
  /** Per-app modal chrome overrides (background, card + button radius). */
  styleOverrides?: ModalStyleOverrides;
  step: KycStep;
  providers: KycProvider[];
  selectedProvider: KycProvider | null;
  session: KycStartResponse | null;
  kycStatus: KycStatusValue;
  /** Set when the decision is held for manual review (e.g. DUPLICATE_DOCUMENT). */
  reviewReason?: string | null;
  /** The vendor approved and Pollar is still recording it (`kycStatus` stays `pending`). */
  processing?: boolean;
  /** The provider list is loading. */
  isLoading: boolean;
  /** The option whose session is opening: it shows a spinner and every option waits on it. */
  startingProviderId?: string | null;
  /** The option was named for the user (a ramp's step), so it opens without showing the list. */
  directOpen?: boolean;
  error?: string | null;
  onSelectProvider: (provider: KycProvider) => void;
  onDoneVerifying: () => void;
  /** Open a new session after the previous one expired. */
  onStartAgain?: () => void;
  onRefresh: () => void;
  onClose: () => void;
  /** Defaults to the user's device; the modal passes the resolved one. */
  language?: PollarLanguage | undefined;
}

export function KycModalTemplate({
  theme,
  accentColor,
  styleOverrides,
  step,
  providers,
  selectedProvider,
  session,
  kycStatus,
  reviewReason,
  processing = false,
  isLoading,
  startingProviderId = null,
  directOpen = false,
  error,
  onSelectProvider,
  onDoneVerifying,
  onStartAgain,
  onRefresh,
  onClose,
  language = deviceLanguage(),
}: KycModalTemplateProps) {
  const copy = KYC_COPY[language];
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides, 'hero');
  const busy = isLoading || startingProviderId !== null;

  return (
    <div
      className={`pollar-modal-card pollar-kyc-modal ${step === 'verifying' ? 'pollar-kyc-modal--verifying' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <div className="pollar-kyc-header-text">
          <h2 className="pollar-modal-title">{copy.title}</h2>
          <p className="pollar-kyc-subtitle">
            {step === 'select_provider' && copy.subtitle.select}
            {step === 'verifying' && copy.subtitle.verifying(selectedProvider?.name ?? copy.theProvider)}
            {step === 'polling' && copy.subtitle.polling}
            {step === 'done' && (kycStatus === 'approved' ? copy.subtitle.ready : copy.subtitle.status)}
          </p>
        </div>
        <div className="pollar-modal-header-actions">
          {step === 'select_provider' && (
            <button
              type="button"
              className="pollar-modal-close"
              onClick={onRefresh}
              disabled={busy}
              aria-label={copy.refresh}
              title={copy.refreshProviders}
            >
              <svg
                className={isLoading ? 'pollar-modal-refresh-icon pollar-spinning' : 'pollar-modal-refresh-icon'}
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
          )}
          <button type="button" className="pollar-modal-close" onClick={onClose} aria-label={copy.close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <p className="pollar-kyc-error" role="alert">
          {error}
        </p>
      )}

      {step === 'select_provider' &&
        (startingProviderId !== null && directOpen ? (
          <div className="pollar-loading-block" aria-live="polite">
            <div className="pollar-spinner" />
            <span>{copy.opening(selectedProvider?.name ?? copy.verification)}</span>
          </div>
        ) : isLoading && providers.length === 0 ? (
          <div className="pollar-loading-block">
            <div className="pollar-spinner" />
            <span>{copy.loadingProviders}</span>
          </div>
        ) : (
          <div className="pollar-kyc-providers">
            {providers.length === 0 && <p style={{ color: 'var(--pollar-muted)', textAlign: 'center' }}>{copy.noProviders}</p>}
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                className="pollar-kyc-provider-btn"
                disabled={busy}
                aria-busy={startingProviderId === p.id}
                onClick={() => onSelectProvider(p)}
              >
                <span className="pollar-kyc-provider-name">{p.name}</span>
                <span className="pollar-kyc-provider-flow">
                  {startingProviderId === p.id ? (
                    <>
                      <span className="pollar-spinner pollar-spinner-sm" />
                      {copy.openingShort}
                    </>
                  ) : p.flow === 'redirect' ? (
                    copy.continueNewTab
                  ) : (
                    copy.continueHere
                  )}
                </span>
              </button>
            ))}
          </div>
        ))}

      {step === 'verifying' && selectedProvider && (
        <>
          <div className="pollar-kyc-session-bar">
            <span className="pollar-kyc-session-label">
              <span className="pollar-kyc-session-dot" />
              {copy.inProgress}
            </span>
            {session?.kycUrl && (
              <a href={session.kycUrl} target="_blank" rel="noopener noreferrer">
                {copy.openNewTab}
              </a>
            )}
          </div>
          <div className="pollar-kyc-iframe-wrap">
            {session?.kycUrl && selectedProvider.flow === 'redirect' ? (
              <div className="pollar-kyc-iframe-mock">
                <p>{copy.separateTab}</p>
                <a className="pollar-btn-primary" href={session.kycUrl} target="_blank" rel="noopener noreferrer">
                  {copy.openVerification}
                </a>
              </div>
            ) : session?.kycUrl ? (
              <iframe className="pollar-kyc-iframe" src={session.kycUrl} title={copy.iframeTitle} allow="camera; microphone" />
            ) : (
              <div className="pollar-kyc-iframe-mock">
                <span>{selectedProvider.flow === 'form' ? copy.formHere : copy.opensHere}</span>
              </div>
            )}
          </div>
          <div className="pollar-kyc-footer">
            <p>{copy.finished}</p>
            <div className="pollar-modal-actions">
              <button type="button" className="pollar-btn-secondary" onClick={onClose}>
                {copy.close}
              </button>
              <button type="button" className="pollar-btn-primary" onClick={onDoneVerifying}>
                {copy.checkStatus}
              </button>
            </div>
          </div>
        </>
      )}

      {step === 'polling' && (
        <div className="pollar-kyc-polling">
          <div className="pollar-spinner" />
          <p className="pollar-kyc-polling-text">{copy.checking}</p>
        </div>
      )}

      {step === 'done' && (
        <div className="pollar-kyc-result">
          <span className={`pollar-kyc-result-icon pollar-kyc-result-icon--${kycStatus}`} aria-hidden="true">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {kycStatus === 'approved' ? (
                <path d="m5 12 4 4L19 6" />
              ) : kycStatus === 'rejected' ? (
                <path d="m7 7 10 10M17 7 7 17" />
              ) : (
                <>
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 7v5l3 2" />
                </>
              )}
            </svg>
          </span>
          <KycStatusBadge status={kycStatus} language={language} {...(processing ? { label: copy.approved } : {})} />
          <p className="pollar-kyc-result-text">
            {kycStatus === 'approved'
              ? copy.result.approved
              : kycStatus === 'rejected'
                ? copy.result.rejected
                : kycStatus === 'expired'
                  ? copy.result.expired
                  : processing
                    ? kycProcessingMessage(language)
                    : kycReviewMessage(reviewReason, language)}
          </p>
          <div className="pollar-modal-actions">
            {kycStatus === 'expired' && onStartAgain && (
              <button type="button" className="pollar-btn-secondary" onClick={onStartAgain} disabled={busy}>
                {copy.startAgain}
              </button>
            )}
            {kycStatus !== 'approved' && kycStatus !== 'rejected' && kycStatus !== 'expired' && (
              <button type="button" className="pollar-btn-secondary" onClick={onDoneVerifying}>
                {copy.checkAgain}
              </button>
            )}
            <button type="button" className="pollar-btn-primary" onClick={onClose}>
              {copy.close}
            </button>
          </div>
        </div>
      )}
      <PollarModalFooter language={language} />
    </div>
  );
}
