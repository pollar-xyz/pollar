'use client';

import { AUTH_ERROR_CODES, AuthState, WalletId } from '@pollar/core';

type StateStatus = 'NONE' | 'LOADING' | 'SUCCESS' | 'ERROR';
import { type CSSProperties, useState } from 'react';
import { LOGO_POLLAR } from '../../constants';
import { ModalStatusBanner, PollarModalFooter } from '../commons';
import { EmailCodeInput } from './EmailCodeInput';
import { GithubButton } from './GithubButton';
import { GoogleButton } from './GoogleButton';

type WalletAdapterEntry = { id: WalletId; meta: { label: string; iconUrl?: string; group?: string } };

function WalletAdapterButtons({
  walletAdapters,
  onConnect,
  isLoading,
  variant = 'list',
}: {
  walletAdapters: WalletAdapterEntry[];
  onConnect: (id: WalletId) => void;
  isLoading: boolean;
  // 'list'  → borderless rows for inside a group sub-picker (large icon + name).
  // 'entry' → bordered buttons that match the root-level entries (Google, Wallet,
  //           Smart Wallet) so a root adapter like Privy doesn't read as bare text.
  variant?: 'list' | 'entry';
}) {
  if (variant === 'entry') {
    return (
      <>
        {walletAdapters.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={isLoading}
            className="pollar-wallet-entry-btn"
            onClick={() => onConnect(a.id)}
          >
            {a.meta.iconUrl && <img src={a.meta.iconUrl} alt={a.meta.label} className="pollar-wallet-icon" />}
            {a.meta.label}
          </button>
        ))}
      </>
    );
  }
  return (
    <div className="pollar-wallet-list">
      {walletAdapters.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={isLoading}
          className="pollar-wallet-list-btn"
          onClick={() => onConnect(a.id)}
        >
          {a.meta.iconUrl && <img src={a.meta.iconUrl} alt={a.meta.label} className="pollar-wallet-list-icon" />}
          <span className="pollar-wallet-list-name">{a.meta.label}</span>
        </button>
      ))}
    </div>
  );
}

const AUTH_STATE_MESSAGES: Record<AuthState['step'], string> = {
  idle: '',
  creating_session: 'Initializing…',
  entering_email: '',
  sending_email: 'Sending…',
  entering_code: 'Code sent — check your inbox',
  verifying_email_code: 'Verifying…',
  opening_oauth: 'Redirecting…',
  connecting_wallet: 'Connecting wallet…',
  signing_wallet_challenge: 'Confirm in your wallet…',
  wallet_not_installed: 'Wallet not installed',
  authenticating_wallet: 'Signing in with wallet…',
  creating_passkey: 'Waiting for passkey…',
  deploying_smart_account: 'Creating your wallet…',
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
    'signing_wallet_challenge',
    'authenticating_wallet',
    'creating_passkey',
    'deploying_smart_account',
    'authenticating',
  ];
  const success: AuthState['step'][] = ['authenticated', 'entering_code'];
  const error: AuthState['step'][] = ['error', 'wallet_not_installed'];

  if (loading.includes(step)) return 'LOADING';
  if (success.includes(step)) return 'SUCCESS';
  if (error.includes(step)) return 'ERROR';
  return 'NONE';
}

interface LoginModalTemplateProps {
  theme: string;
  accentColor: string;
  logoUrl: string | null;
  emailEnabled: boolean;
  embeddedWallets: boolean;
  /** Show the "Smart Wallet" (passkey) option. Optional & defaults to off so
   *  adding it isn't a breaking change for existing template consumers. */
  smartWallet?: boolean;
  providers: {
    google: boolean;
    discord: boolean;
    x: boolean;
    github: boolean;
    apple: boolean;
  };
  /** Registered wallet adapters to render as buttons (Freighter, Albedo, Privy, …). */
  walletAdapters: WalletAdapterEntry[];
  appName: string;
  email?: string;
  onEmailChange?: (email: string) => void;
  onEmailSubmit?: () => void;
  onSocialLogin?: (provider: 'google' | 'github') => void;
  onWalletConnect?: (id: WalletId) => void;
  /** Log in with an existing passkey (returning user). */
  onLoginSmartWallet?: () => void;
  /** Create a new passkey + smart wallet (new user). */
  onCreateSmartWallet?: () => void;
  authState: AuthState;
  codeInputKey?: number;
  onCodeSubmit?: (code: string) => void;
  onBack: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

/** Theme-derived CSS custom properties shared by the login modal and its
 *  loading/error status card. Kept as a standalone helper so both render paths
 *  stay visually in lockstep. */
export function buildModalCssVars(theme: string, accentColor: string): CSSProperties {
  const isDark = theme === 'dark';
  return {
    '--pollar-accent': accentColor,
    '--pollar-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': isDark ? '#ffffff' : '#111827',
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    '--pollar-input-bg': isDark ? '#374151' : '#f9fafb',
    '--pollar-error-bg': isDark ? '#2a1515' : '#fef2f2',
    '--pollar-error-border': isDark ? '#7f1d1d' : '#fecaca',
    '--pollar-error-text': isDark ? '#f87171' : '#dc2626',
    '--pollar-success-text': isDark ? '#4ade80' : '#16a34a',
    '--pollar-buttons-border-radius': '6px',
    '--pollar-buttons-height': '44px',
    '--pollar-input-height': '44px',
    '--pollar-input-border-radius': '0.5rem',
    '--pollar-card-border-radius': '10px',
    '--pollar-modal-padding': '2rem',
    '--pollar-modal-heading-size': '1.375rem',
    '--pollar-modal-subtitle-size': '0.9rem',
  } as CSSProperties;
}

export function LoginModalTemplate({
  theme,
  accentColor,
  logoUrl,
  emailEnabled,
  embeddedWallets,
  smartWallet = false,
  providers,
  walletAdapters,
  appName,
  email = '',
  onEmailChange,
  onEmailSubmit,
  onSocialLogin,
  onWalletConnect,
  onLoginSmartWallet,
  onCreateSmartWallet,
  authState,
  codeInputKey,
  onCodeSubmit,
  onBack,
  onCancel,
  onRetry,
}: LoginModalTemplateProps) {
  const [showPasskeyChooser, setShowPasskeyChooser] = useState(false);
  // Which wallet group's sub-picker is open (gateway label), or null for the root view.
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const enabledSocial = Object.entries(providers).filter(([, enabled]) => enabled);

  // Split registered adapters into root-level buttons (no `meta.group`, e.g. Privy)
  // and gateway groups (adapters sharing a `meta.group` collapse behind one button
  // that opens a sub-picker — e.g. the Stellar Wallets Kit wallets under "Wallet").
  const rootAdapters = walletAdapters.filter((a) => !a.meta.group);
  const walletGroups = walletAdapters
    .filter((a) => a.meta.group)
    .reduce<{ label: string; adapters: WalletAdapterEntry[] }[]>((acc, a) => {
      const label = a.meta.group as string;
      const existing = acc.find((g) => g.label === label);
      if (existing) existing.adapters.push(a);
      else acc.push({ label, adapters: [a] });
      return acc;
    }, []);
  const activeGroupAdapters = walletGroups.find((g) => g.label === activeGroup)?.adapters ?? [];

  const cssVars = buildModalCssVars(theme, accentColor);

  const status = authStateToStatus(authState.step);
  const isLoading = status === 'LOADING';
  const isEmailCodeError =
    authState.step === 'error' &&
    (authState.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_EXPIRED ||
      authState.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_INVALID);
  const awaitingEmailCode = authState.step === 'entering_code' || authState.step === 'verifying_email_code' || isEmailCodeError;
  const statusMessage = authState.step === 'error' ? authState.message : AUTH_STATE_MESSAGES[authState.step];

  const BackButton = ({ onClick }: { onClick: () => void }) => (
    <button type="button" className="pollar-back-btn" onClick={onClick} aria-label="Back">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );

  return (
    <div className="pollar-modal-card pollar-modal" style={cssVars} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="pollar-close-btn" onClick={onCancel} aria-label="Close">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="pollar-header">
        <div className="pollar-logo-wrap">
          <img src={logoUrl ?? LOGO_POLLAR} alt="Logo" className="pollar-logo" />
        </div>
        <h2 className="pollar-title">{appName}</h2>
        <p className="pollar-subtitle">Log in or sign up</p>
      </div>

      {awaitingEmailCode ? (
        <>
          <BackButton onClick={onBack} />
          <EmailCodeInput key={codeInputKey} email={email} onSubmit={onCodeSubmit ?? (() => {})} />
        </>
      ) : activeGroup ? (
        <>
          <BackButton onClick={() => setActiveGroup(null)} />
          <WalletAdapterButtons
            walletAdapters={activeGroupAdapters}
            onConnect={onWalletConnect ?? (() => {})}
            isLoading={isLoading}
          />
        </>
      ) : showPasskeyChooser ? (
        <>
          <BackButton onClick={() => setShowPasskeyChooser(false)} />
          <div className="pollar-wallet-section">
            <button type="button" disabled={isLoading} className="pollar-btn-primary" onClick={onCreateSmartWallet}>
              Create a new wallet
            </button>
            <button type="button" disabled={isLoading} className="pollar-wallet-entry-btn" onClick={onLoginSmartWallet}>
              Log in with an existing wallet
            </button>
          </div>
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
                className="pollar-input"
                onChange={(e) => onEmailChange?.(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onEmailSubmit?.()}
              />
              <button
                type="button"
                disabled={isLoading || !email}
                className="pollar-btn-primary"
                style={{ marginTop: '0.75rem' }}
                onClick={onEmailSubmit}
              >
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

          {(embeddedWallets || smartWallet) && (
            <div className="pollar-wallet-section">
              {embeddedWallets && (
                <>
                  {walletGroups.map((g) => (
                    <button
                      key={g.label}
                      type="button"
                      disabled={isLoading}
                      className="pollar-wallet-entry-btn"
                      onClick={() => setActiveGroup(g.label)}
                    >
                      <svg
                        width="18"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      {g.label}
                    </button>
                  ))}
                  {rootAdapters.length > 0 && (
                    <WalletAdapterButtons
                      walletAdapters={rootAdapters}
                      onConnect={onWalletConnect ?? (() => {})}
                      isLoading={isLoading}
                      variant="entry"
                    />
                  )}
                </>
              )}

              {smartWallet && (
                <button
                  type="button"
                  disabled={isLoading}
                  className="pollar-wallet-entry-btn"
                  onClick={() => setShowPasskeyChooser(true)}
                >
                  <svg
                    width="18"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16 8V6a4 4 0 00-8 0v2M5 8h14a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V9a1 1 0 011-1zm7 5v2" />
                  </svg>
                  Smart Wallet
                </button>
              )}
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

/** Placeholder shown inside the login modal while the app config is loading, or
 *  when its remote fetch failed — instead of the empty shell that renders when
 *  `styles` is still the default `{}`. Mirrors the template's card chrome (logo,
 *  title, footer) so the swap to the real form isn't jarring. */
export function LoginModalStatus({
  status,
  theme,
  accentColor,
  logoUrl,
  appName,
  onRetry,
  onCancel,
}: {
  status: 'loading' | 'error';
  theme: string;
  accentColor: string;
  logoUrl: string | null;
  appName: string;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const cssVars = buildModalCssVars(theme, accentColor);
  return (
    <div className="pollar-modal-card pollar-modal" style={cssVars} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="pollar-close-btn" onClick={onCancel} aria-label="Close">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="pollar-header">
        <div className="pollar-logo-wrap">
          <img src={logoUrl ?? LOGO_POLLAR} alt="Logo" className="pollar-logo" />
        </div>
        <h2 className="pollar-title">{appName}</h2>
        <p className="pollar-subtitle">Log in or sign up</p>
      </div>

      {status === 'loading' ? (
        <div className="pollar-loading-block">
          <div className="pollar-spinner" />
          <span>Loading...</span>
        </div>
      ) : (
        <div className="pollar-wallet-section">
          <p className="pollar-modal-error">Could not load sign-in options. Check your connection and try again.</p>
          <button type="button" className="pollar-btn-primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      <PollarModalFooter />
    </div>
  );
}
