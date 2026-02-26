'use client';

import { StateLoginCodes } from '@pollar/core';

const LOGIN_CODE_MESSAGES: Record<StateLoginCodes, { text: string; kind: 'loading' | 'success' | 'error' }> = {
  CREATE_SESSION_START: { text: 'Starting session…', kind: 'loading' },
  CREATE_SESSION_ERROR: { text: 'Failed to create session', kind: 'error' },
  CREATE_SESSION_SUCCESS: { text: 'Session created', kind: 'success' },
  EMAIL_AUTH_START: { text: 'Sending code…', kind: 'loading' },
  EMAIL_AUTH_ERROR: { text: 'Failed to send email', kind: 'error' },
  EMAIL_AUTH_SUCCESS: { text: 'Code sent — check your inbox', kind: 'success' },
  STREAM_POLL_START: { text: 'Waiting for verification…', kind: 'loading' },
  STREAM_POLL_EVENT: { text: 'Waiting for verification…', kind: 'loading' },
  STREAM_POLL_READY: { text: 'Verified', kind: 'success' },
  FETCH_SESSION_START: { text: 'Authenticating…', kind: 'loading' },
  FETCH_SESSION_SUCCESS: { text: 'Authenticated!', kind: 'success' },
  FETCH_SESSION_ERROR: { text: 'Authentication failed', kind: 'error' },
};

function LoginStatusBanner({ code }: { code: StateLoginCodes | null }) {
  if (!code) return <div className="pollar-status" />;
  const { text, kind } = LOGIN_CODE_MESSAGES[code];
  const icon =
    kind === 'error' ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ) : kind === 'success' ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M3.5 7l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="22 10" />
      </svg>
    );

  return (
    <div className="pollar-status" data-kind={kind}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

interface LoginModalTemplateProps {
  theme: string;
  accentColor: string;
  logoUrl: string | null;
  emailEnabled: boolean;
  embeddedWallets: boolean;
  providers: {
    google: boolean;
    discord: boolean;
    x: boolean;
    github: boolean;
    apple: boolean;
  };
  appName: string;
  email?: string;
  loading?: boolean;
  error?: string | null;
  onEmailChange?: (email: string) => void;
  onEmailSubmit?: () => void;
  onSocialLogin?: (provider: 'google' | 'github') => void;
  onFreighterConnect?: () => void;
  onAlbedoConnect?: () => void;
  loginStateCode: StateLoginCodes | null;
}

export function LoginModalTemplate({
  theme,
  accentColor,
  logoUrl,
  emailEnabled,
  embeddedWallets,
  providers,
  appName,
  email = '',
  loading = false,
  error,
  onEmailChange,
  onEmailSubmit,
  onSocialLogin,
  onFreighterConnect,
  onAlbedoConnect,
  loginStateCode,
}: LoginModalTemplateProps) {
  const isDark = theme === 'dark';
  const enabledSocial = Object.entries(providers).filter(([, enabled]) => enabled);

  const cssVars = {
    '--pollar-accent': accentColor,
    '--pollar-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': isDark ? '#ffffff' : '#111827',
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    '--pollar-input-bg': isDark ? '#374151' : '#ffffff',
    '--pollar-error-bg': isDark ? '#2a1515' : '#fef2f2',
    '--pollar-error-border': isDark ? '#7f1d1d' : '#fecaca',
    '--pollar-error-text': isDark ? '#f87171' : '#dc2626',
  } as React.CSSProperties;

  return (
    <div className="pollar-modal" style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-header">
        <div className="pollar-logo-wrap">
          <img src={logoUrl ?? 'https://pollar.xyz/logo_polo.png'} alt="Logo" className="pollar-logo" />
        </div>
        <h2 className="pollar-title">{appName}</h2>
        <p className="pollar-subtitle">Log in or sign up</p>
      </div>

      {error && <div className="pollar-error">{error}</div>}

      {emailEnabled && (
        <div className="pollar-email-section">
          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            disabled={loading}
            className="pollar-email-input"
            onChange={(e) => onEmailChange?.(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onEmailSubmit?.()}
          />
          <button type="button" disabled={loading || !email} className="pollar-submit-btn" onClick={onEmailSubmit}>
            Submit
          </button>
        </div>
      )}

      {emailEnabled && enabledSocial.length > 0 && (
        <div className="pollar-divider">
          <div className="pollar-divider-line" />
          <div className="pollar-divider-label">
            <span className="pollar-divider-text">or continue with</span>
          </div>
        </div>
      )}

      {enabledSocial.length > 0 && (
        <div className="pollar-social-list">
          {enabledSocial.map(([key]) => (
            <button
              key={key}
              type="button"
              disabled={loading}
              className="pollar-social-btn"
              onClick={() => onSocialLogin?.(key as 'google' | 'github')}
            >
              <span className="pollar-social-btn-text">{key}</span>
            </button>
          ))}
        </div>
      )}

      {embeddedWallets && (
        <div className="pollar-wallet-section">
          <p className="pollar-wallet-label">Continue with a wallet</p>
          <button type="button" disabled={loading} className="pollar-wallet-btn" onClick={onFreighterConnect}>
            <svg className="pollar-wallet-icon" viewBox="0 0 32 32" fill="none" aria-hidden>
              <circle cx="16" cy="16" r="16" fill="#5E4AE3" />
              <path d="M10 16l4-6h8l-4 6 4 6h-8l-4-6z" fill="white" />
            </svg>
            Freighter
          </button>
          <button type="button" disabled={loading} className="pollar-wallet-btn" onClick={onAlbedoConnect}>
            <svg className="pollar-wallet-icon" viewBox="0 0 32 32" fill="none" aria-hidden>
              <circle cx="16" cy="16" r="16" fill="#F5A623" />
              <circle cx="16" cy="16" r="7" fill="white" />
              <circle cx="16" cy="16" r="3" fill="#F5A623" />
            </svg>
            Albedo
          </button>
        </div>
      )}

      <LoginStatusBanner code={loginStateCode} />

      <div className="pollar-footer">
        <span className="pollar-footer-protected">Protected by</span>
        <div className="pollar-footer-brand">
          <img src="https://pollar.xyz/logo_polo.png" alt="Pollar" className="pollar-footer-logo" />
          <span className="pollar-footer-name">Pollar</span>
        </div>
      </div>
    </div>
  );
}
