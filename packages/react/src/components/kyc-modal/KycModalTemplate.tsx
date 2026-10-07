'use client';

import type { KycProvider, KycStartResponse, KycStatus as KycStatusValue } from '@pollar/core';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';
import { KycStatus as KycStatusBadge } from './KycStatus';

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
  isLoading: boolean;
  error?: string | null;
  onSelectProvider: (provider: KycProvider) => void;
  onDoneVerifying: () => void;
  onRefresh: () => void;
  onClose: () => void;
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
  isLoading,
  error,
  onSelectProvider,
  onDoneVerifying,
  onRefresh,
  onClose,
}: KycModalTemplateProps) {
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides, 'hero');

  return (
    <div className={`pollar-modal-card pollar-kyc-modal ${step === 'verifying' ? 'pollar-kyc-modal--verifying' : ''}`} role="dialog" aria-modal="true" aria-label="Identity verification" style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-modal-header">
        <div className="pollar-kyc-header-text">
          <h2 className="pollar-modal-title">Identity verification</h2>
          <p className="pollar-kyc-subtitle">
            {step === 'select_provider' && 'Choose your verification provider'}
            {step === 'verifying' && `Complete the steps below with ${selectedProvider?.name}`}
            {step === 'polling' && 'Waiting for verification result'}
            {step === 'done' && (kycStatus === 'approved' ? 'You’re ready to continue' : 'Your verification status')}
          </p>
        </div>
        <div className="pollar-modal-header-actions">
          {step === 'select_provider' && (
            <button
              type="button"
              className="pollar-modal-close"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="Refresh"
              title="Refresh providers"
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
          <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {error && <p className="pollar-kyc-error" role="alert">{error}</p>}

      {step === 'select_provider' &&
        (isLoading && providers.length === 0 ? (
          <div className="pollar-loading-block">
            <div className="pollar-spinner" />
            <span>Loading providers…</span>
          </div>
        ) : (
          <div className="pollar-kyc-providers">
            {providers.length === 0 && (
              <p style={{ color: 'var(--pollar-muted)', textAlign: 'center' }}>No providers available for your country.</p>
            )}
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                className="pollar-kyc-provider-btn"
                disabled={isLoading}
                onClick={() => onSelectProvider(p)}
              >
                <span className="pollar-kyc-provider-name">{p.name}</span>
                <span className="pollar-kyc-provider-flow">{isLoading && selectedProvider?.id === p.id ? 'Opening…' : p.flow === 'redirect' ? 'Continue in a new tab' : 'Continue here'}</span>
              </button>
            ))}
          </div>
        ))}

      {step === 'verifying' && selectedProvider && (
        <>
          <div className="pollar-kyc-session-bar">
            <span className="pollar-kyc-session-label"><span className="pollar-kyc-session-dot" />Verification in progress</span>
            {session?.kycUrl && <a href={session.kycUrl} target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>}
          </div>
          <div className="pollar-kyc-iframe-wrap">
            {session?.kycUrl && selectedProvider.flow === 'redirect' ? (
              <div className="pollar-kyc-iframe-mock">
                <p>Complete verification in a separate tab, then return here to check your status.</p>
                <a className="pollar-btn-primary" href={session.kycUrl} target="_blank" rel="noopener noreferrer">
                  Open verification
                </a>
              </div>
            ) : session?.kycUrl ? (
              <iframe className="pollar-kyc-iframe" src={session.kycUrl} title="KYC verification" allow="camera; microphone" />
            ) : (
              <div className="pollar-kyc-iframe-mock">
                <span>
                  {selectedProvider.flow === 'form'
                    ? 'The identity verification form will appear here.'
                    : 'Identity verification will open here.'}
                </span>
              </div>
            )}
          </div>
          <div className="pollar-kyc-footer">
            <p>Finished the steps? Check your status to continue.</p>
            <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="pollar-btn-primary" onClick={onDoneVerifying}>
              Check status
            </button>
            </div>
          </div>
        </>
      )}

      {step === 'polling' && (
        <div className="pollar-kyc-polling">
          <div className="pollar-spinner" />
          <p className="pollar-kyc-polling-text">Checking verification status…</p>
        </div>
      )}

      {step === 'done' && (
        <div className="pollar-kyc-result">
          <span className={`pollar-kyc-result-icon pollar-kyc-result-icon--${kycStatus}`} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {kycStatus === 'approved' ? <path d="m5 12 4 4L19 6" /> : kycStatus === 'rejected' ? <path d="m7 7 10 10M17 7 7 17" /> : <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>}
            </svg>
          </span>
          <KycStatusBadge status={kycStatus} />
          <p className="pollar-kyc-result-text">
            {kycStatus === 'approved'
              ? 'Your identity has been verified successfully.'
              : kycStatus === 'rejected' ? 'Your verification was not approved. Contact support for the next steps.' : 'Your verification is still being reviewed. You can check again shortly.'}
          </p>
          <div className="pollar-modal-actions">
            {kycStatus !== 'approved' && kycStatus !== 'rejected' && <button type="button" className="pollar-btn-secondary" onClick={onDoneVerifying}>Check again</button>}
            <button type="button" className="pollar-btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
