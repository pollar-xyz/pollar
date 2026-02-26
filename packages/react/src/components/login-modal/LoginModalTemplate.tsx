'use client';

import { StateLoginCodes, StateStatus } from '@pollar/core';
import { RefObject } from 'react';
import { LOGO_ALBEDO, LOGO_FREIGHTER, LOGO_POLLAR } from '../../constants';
import { EmailCodeInput } from './EmailCodeInput';
import { GithubButton } from './GithubButton';
import { GoogleButton } from './GoogleButton';
import { LoginStatusBanner } from './LoginStatusBanner';

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
  cancelLoginRef: RefObject<(() => void) | null>;
  onRetry: () => void;
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
  cancelLoginRef,
  onRetry,
}: LoginModalTemplateProps) {
  const isDark = theme === 'dark';
  const enabledSocial = Object.entries(providers).filter(([, enabled]) => enabled);

  const cssVars = {
    '--pollar-accent': accentColor,
    '--pollar-buttons-border-radius': '6px',
    '--pollar-buttons-height': '44px',
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
          <img src={logoUrl ?? LOGO_POLLAR} alt="Logo" className="pollar-logo" />
        </div>
        <h2 className="pollar-title">{appName}</h2>
        <p className="pollar-subtitle">Log in or sign up</p>
      </div>

      {awaitingEmailCode ? (
        <EmailCodeInput email={email} onSubmit={onCodeSubmit ?? (() => {})} />
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
              {enabledSocial.some(([key]) => key === 'google') && (
                <GoogleButton disabled={isLoading} onClick={() => onSocialLogin?.('google')} />
              )}
              {enabledSocial.some(([key]) => key === 'github') && (
                <GithubButton disabled={isLoading} onClick={() => onSocialLogin?.('github')} />
              )}
            </div>
          )}

          {embeddedWallets && (
            <div className="pollar-wallet-section">
              <p className="pollar-wallet-label">Continue with a wallet</p>
              <button type="button" disabled={isLoading} className="pollar-wallet-btn" onClick={onFreighterConnect}>
                <img src={LOGO_FREIGHTER} alt="Freighter" className="pollar-wallet-icon" />
                Freighter
              </button>
              <button type="button" disabled={isLoading} className="pollar-wallet-btn" onClick={onAlbedoConnect}>
                <img src={LOGO_ALBEDO} alt="Albedo" className="pollar-wallet-icon" />
                Albedo
              </button>
            </div>
          )}
        </>
      )}

      <LoginStatusBanner code={loginStateCode} status={status} onCancel={() => cancelLoginRef.current?.()} onRetry={onRetry} />

      <div className="pollar-footer">
        <span className="pollar-footer-protected">Protected by</span>
        <div className="pollar-footer-brand">
          <img src={LOGO_POLLAR} alt="Pollar" className="pollar-footer-logo" />
          <span className="pollar-footer-name">Pollar</span>
        </div>
      </div>
    </div>
  );
}
