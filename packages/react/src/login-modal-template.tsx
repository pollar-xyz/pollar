'use client';

import { StateLoginCodes, StateStatus } from '@pollar/core';
import { RefObject, useRef, useState } from 'react';

const LOGIN_CODE_MESSAGES: Record<StateLoginCodes, { text: string }> = {
  CREATE_SESSION_START: { text: 'Starting session…' },
  CREATE_SESSION_ERROR: { text: 'Failed to create session' },
  CREATE_SESSION_SUCCESS: { text: 'Session created' },
  EMAIL_AUTH_START: { text: 'Sending code…' },
  EMAIL_AUTH_START_ERROR: { text: 'Failed to send email' },
  EMAIL_AUTH_START_SUCCESS: { text: 'Code sent — check your inbox' },
  EMAIL_AUTH_CODE_ERROR: { text: 'Invalid code. Try again.' },
  EMAIL_AUTH_CODE_SUCCESS: { text: 'Code verified!' },
  WALLET_AUTH_FREIGHTER_NOT_INSTALLED: { text: 'Freighter is not installed' },
  WALLET_AUTH_ALBEDO_NOT_INSTALLED: { text: 'Albedo is not available' },
  WALLET_AUTH_WALLET_NOT_AVAILABLE: { text: 'Wallet not available' },
  STREAM_POLL_START: { text: 'Waiting for verification…' },
  STREAM_POLL_EVENT: { text: 'Waiting for verification…' },
  STREAM_POLL_READY: { text: 'Verified' },
  FETCH_SESSION_START: { text: 'Authenticating…' },
  FETCH_SESSION_SUCCESS: { text: 'Authenticated!' },
  FETCH_SESSION_ERROR: { text: 'Authentication failed' },
  ERROR_UNKNOWN: { text: 'Something went wrong' },
  ABORTED: { text: 'Login cancelled' },
};

function LoginStatusBanner({
  code,
  status,
  onCancel,
}: {
  code: StateLoginCodes | null;
  status: StateStatus;
  onCancel?: () => void;
}) {
  if (!code) return <div className="pollar-status" />;
  const { text } = LOGIN_CODE_MESSAGES[code] || { text: '' };
  const isLoading = status === StateStatus.LOADING;
  const icon =
    status === StateStatus.ERROR ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ) : status === StateStatus.SUCCESS ? (
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
    <div className="pollar-status" data-kind={status}>
      {icon}
      <span>{text}</span>
      {isLoading && onCancel && (
        <button type="button" className="pollar-status-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

function EmailCodeInput({
  onSubmit,
  loading,
  error,
}: {
  onSubmit: (code: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function submit(next: string[]) {
    if (next.every(Boolean)) onSubmit(next.join(''));
  }

  function handleChange(index: number, value: string) {
    const cleaned = value.replace(/\D/g, '').slice(-1);
    const next = digits.map((d, i) => (i === index ? cleaned : d));
    setDigits(next);
    if (cleaned && index < 5) inputRefs.current[index + 1]?.focus();
    submit(next);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = Array.from({ length: 6 }, (_, i) => text[i] ?? '');
    setDigits(next);
    inputRefs.current[Math.min(text.length - 1, 5)]?.focus();
    submit(next);
  }

  return (
    <div className="pollar-code-section">
      <p className="pollar-code-label">Enter the 6-digit code sent to your email</p>
      <div className="pollar-code-inputs">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={digit}
            className="pollar-code-input"
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
          />
        ))}
      </div>
      {error && <div className="pollar-error">{error}</div>}
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
  status: StateStatus;
  error?: string | null;
  onEmailChange?: (email: string) => void;
  onEmailSubmit?: () => void;
  onSocialLogin?: (provider: 'google' | 'github') => void;
  onFreighterConnect?: () => void;
  onAlbedoConnect?: () => void;
  loginStateCode: StateLoginCodes | null;
  awaitingEmailCode?: boolean;
  onCodeSubmit?: (code: string) => void;
  codeError?: string | null;
  cancelLoginRef: RefObject<(() => void) | null>;
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
  status,
  error,
  onEmailChange,
  onEmailSubmit,
  onSocialLogin,
  onFreighterConnect,
  onAlbedoConnect,
  loginStateCode,
  awaitingEmailCode = false,
  onCodeSubmit,
  codeError = null,
  cancelLoginRef,
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

  const isLoading = status === StateStatus.LOADING;

  return (
    <div className="pollar-modal" style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-header">
        <div className="pollar-logo-wrap">
          <img src={logoUrl ?? 'https://pollar.xyz/logo_polo.png'} alt="Logo" className="pollar-logo" />
        </div>
        <h2 className="pollar-title">{appName}</h2>
        <p className="pollar-subtitle">Log in or sign up</p>
      </div>

      {awaitingEmailCode ? (
        <EmailCodeInput onSubmit={onCodeSubmit ?? (() => {})} loading={isLoading} error={codeError} />
      ) : (
        <>
          {error && <div className="pollar-error">{error}</div>}

          {emailEnabled && (
            <div className="pollar-email-section">
              <input
                type="email"
                placeholder="you@email.com"
                value={email}
                disabled={isLoading}
                className="pollar-email-input"
                onChange={(e) => onEmailChange?.(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onEmailSubmit?.()}
              />
              <button type="button" disabled={isLoading || !email} className="pollar-submit-btn" onClick={onEmailSubmit}>
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
                  disabled={isLoading}
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
              <button type="button" disabled={isLoading} className="pollar-wallet-btn" onClick={onFreighterConnect}>
                <svg className="pollar-wallet-icon" viewBox="0 0 32 32" fill="none" aria-hidden>
                  <circle cx="16" cy="16" r="16" fill="#5E4AE3" />
                  <path d="M10 16l4-6h8l-4 6 4 6h-8l-4-6z" fill="white" />
                </svg>
                Freighter
              </button>
              <button type="button" disabled={isLoading} className="pollar-wallet-btn" onClick={onAlbedoConnect}>
                <svg className="pollar-wallet-icon" viewBox="0 0 32 32" fill="none" aria-hidden>
                  <circle cx="16" cy="16" r="16" fill="#F5A623" />
                  <circle cx="16" cy="16" r="7" fill="white" />
                  <circle cx="16" cy="16" r="3" fill="#F5A623" />
                </svg>
                Albedo
              </button>
            </div>
          )}
        </>
      )}

      <LoginStatusBanner code={loginStateCode} status={status} onCancel={() => cancelLoginRef.current?.()} />

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
