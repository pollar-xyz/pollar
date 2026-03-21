'use client';

import { AUTH_ERROR_CODES, AuthState, StateStatus } from '@pollar/core';
import { type CSSProperties } from 'react';
import { LOGO_ALBEDO, LOGO_FREIGHTER, LOGO_POLLAR } from '../../constants';
import { ModalStatusBanner, PollarModalFooter } from '../commons';
import { EmailCodeInput } from './EmailCodeInput';
import { GithubButton } from './GithubButton';
import { GoogleButton } from './GoogleButton';

const AUTH_STATE_MESSAGES: Record<AuthState['step'], string> = {
  idle: '',
  creating_session: 'Initializing…',
  entering_email: '',
  sending_email: 'Sending…',
  entering_code: 'Code sent — check your inbox',
  verifying_email_code: 'Verifying…',
  opening_oauth: 'Redirecting…',
  connecting_wallet: 'Connecting wallet…',
  wallet_not_installed: 'Wallet not installed',
  authenticating_wallet: 'Signing in with wallet…',
  authenticating: 'Authenticating…',
  authenticated: 'Welcome!',
  error: '',
};

function authStateToStatus(step: AuthState['step']): StateStatus {
  const loading: AuthState['step'][] = [
    'creating_session',
    'sending_email',
    'verifying_email_code',
    'opening_oauth',
    'connecting_wallet',
    'authenticating_wallet',
    'authenticating',
  ];
  const success: AuthState['step'][] = ['authenticated', 'entering_code'];
  const error: AuthState['step'][] = ['error', 'wallet_not_installed'];

  if (loading.includes(step)) return StateStatus.LOADING;
  if (success.includes(step)) return StateStatus.SUCCESS;
  if (error.includes(step)) return StateStatus.ERROR;
  return StateStatus.NONE;
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
  onEmailChange?: (email: string) => void;
  onEmailSubmit?: () => void;
  onSocialLogin?: (provider: 'google' | 'github') => void;
  onFreighterConnect?: () => void;
  onAlbedoConnect?: () => void;
  authState: AuthState;
  codeInputKey?: number;
  onCodeSubmit?: (code: string) => void;
  onBack: () => void;
  onCancel: () => void;
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
  onEmailChange,
  onEmailSubmit,
  onSocialLogin,
  onFreighterConnect,
  onAlbedoConnect,
  authState,
  codeInputKey,
  onCodeSubmit,
  onBack,
  onCancel,
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
  } as CSSProperties;

  const status = authStateToStatus(authState.step);
  const isLoading = status === StateStatus.LOADING;
  const isEmailCodeError =
    authState.step === 'error' &&
    (authState.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_EXPIRED ||
      authState.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_INVALID);
  const awaitingEmailCode =
    authState.step === 'entering_code' || authState.step === 'verifying_email_code' || isEmailCodeError;
  const statusMessage =
    authState.step === 'error' ? authState.message : AUTH_STATE_MESSAGES[authState.step];

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
        <>
          <button type="button" className="pollar-back-btn" onClick={onBack}>
            ← Back
          </button>
          <EmailCodeInput key={codeInputKey} email={email} onSubmit={onCodeSubmit ?? (() => {})} />
        </>
      ) : (
        <>
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

      <ModalStatusBanner
        message={statusMessage}
        status={status}
        onCancel={onCancel}
        onRetry={isEmailCodeError ? undefined : onRetry}
      />

      <PollarModalFooter />
    </div>
  );
}