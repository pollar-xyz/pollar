'use client';

import type { KycProvider, KycStartResponse, KycStatus as KycStatusValue } from '@pollar/core';
import type { CSSProperties } from 'react';
import { KycStatus as KycStatusBadge } from './KycStatus';

export type KycStep = 'select_provider' | 'verifying' | 'polling' | 'done';

interface KycModalTemplateProps {
  theme: string;
  accentColor: string;
  step: KycStep;
  providers: KycProvider[];
  selectedProvider: KycProvider | null;
  session: KycStartResponse | null;
  kycStatus: KycStatusValue;
  isLoading: boolean;
  onSelectProvider: (provider: KycProvider) => void;
  onDoneVerifying: () => void;
  onClose: () => void;
}

export function KycModalTemplate({
  theme,
  accentColor,
  step,
  providers,
  selectedProvider,
  session,
  kycStatus,
  isLoading,
  onSelectProvider,
  onDoneVerifying,
  onClose,
}: KycModalTemplateProps) {
  const isDark = theme === 'dark';

  const cssVars = {
    '--pollar-accent': accentColor,
    '--pollar-buttons-border-radius': '6px',
    '--pollar-buttons-height': '44px',
    '--pollar-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': isDark ? '#ffffff' : '#111827',
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    '--pollar-input-bg': isDark ? '#374151' : '#f9fafb',
  } as CSSProperties;

  return (
    <div className="pollar-kyc-modal" style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-kyc-header">
        <h2 className="pollar-kyc-title">Identity verification</h2>
        <p className="pollar-kyc-subtitle">
          {step === 'select_provider' && 'Choose your verification provider'}
          {step === 'verifying' && `Verifying with ${selectedProvider?.name}`}
          {step === 'polling' && 'Waiting for verification result'}
          {step === 'done' && 'Verification complete'}
        </p>
      </div>

      {step === 'select_provider' && (
        <div className="pollar-kyc-providers">
          {providers.length === 0 && <p style={{ color: 'var(--pollar-muted)', textAlign: 'center' }}>No providers available for your country.</p>}
          {providers.map((p) => (
            <button key={p.id} type="button" className="pollar-kyc-provider-btn" disabled={isLoading} onClick={() => onSelectProvider(p)}>
              <span className="pollar-kyc-provider-name">{p.name}</span>
              <span className="pollar-kyc-provider-flow">{p.flow}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'verifying' && selectedProvider && (
        <>
          <div className="pollar-kyc-iframe-wrap">
            {session?.kycUrl ? (
              <iframe className="pollar-kyc-iframe" src={session.kycUrl} title="KYC verification" allow="camera; microphone" />
            ) : (
              <div className="pollar-kyc-iframe-mock">
                <span>🔒</span>
                <span>
                  {selectedProvider.flow === 'form'
                    ? 'Form-based KYC — fields will render here once backend is connected'
                    : 'KYC iframe will load here once backend is connected'}
                </span>
                <code style={{ fontSize: '0.7rem', opacity: 0.6 }}>provider: {selectedProvider.id}</code>
              </div>
            )}
          </div>
          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="pollar-btn-primary" onClick={onDoneVerifying}>
              I've completed verification
            </button>
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
          <span className="pollar-kyc-result-icon">{kycStatus === 'approved' ? '✅' : '❌'}</span>
          <KycStatusBadge status={kycStatus} />
          <p className="pollar-kyc-result-text">
            {kycStatus === 'approved' ? 'Your identity has been verified successfully.' : 'Verification was not approved. Please try again.'}
          </p>
          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
