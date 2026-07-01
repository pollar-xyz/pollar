'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import type { InteractiveAuthAdapter } from '@pollar/core';
import { LOGO_POLLAR } from '../../constants';
import { ModalStatusBanner, PollarModalFooter } from '../commons';
import { EmailCodeInput } from './EmailCodeInput';
import { GithubButton } from './GithubButton';
import { GoogleButton } from './GoogleButton';

type StateStatus = 'NONE' | 'LOADING' | 'SUCCESS' | 'ERROR';

interface PrivyLoginSubmodalProps {
  /** The interactive adapter whose login (email/oauth) we drive. */
  adapter: InteractiveAuthAdapter;
  theme: string;
  accentColor: string;
  logoUrl: string | null;
  appName: string;
  /** Return to the root login view. */
  onBack: () => void;
  /** Close the whole login modal. */
  onCancel: () => void;
  /** The provider login finished — hand off to `login({ provider })`. */
  onAuthenticated: () => void;
}

/**
 * Sub-modal for an {@link InteractiveAuthAdapter} (e.g. `@pollar/privy-adapter`).
 * It renders the adapter's `getAuthOptions()` (email / Google / GitHub), runs the
 * provider login by calling the adapter's methods, then signals
 * {@link PrivyLoginSubmodalProps.onAuthenticated} so the host triggers the normal
 * `login({ provider })` (which runs `connect()` + SEP-10).
 *
 * Owned by `@pollar/react`; reuses the login-modal CSS classes/vars.
 */
export function PrivyLoginSubmodal({
  adapter,
  theme,
  accentColor,
  logoUrl,
  appName,
  onBack,
  onCancel,
  onAuthenticated,
}: PrivyLoginSubmodalProps) {
  const options = useMemo(() => adapter.getAuthOptions(), [adapter]);
  const [email, setEmail] = useState('');
  const [view, setView] = useState<'root' | 'email-code'>('root');
  const [status, setStatus] = useState<StateStatus>('NONE');
  const [message, setMessage] = useState('');

  const isDark = theme === 'dark';
  const isLoading = status === 'LOADING';

  const cssVars = {
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

  function fail(error: unknown) {
    setStatus('ERROR');
    setMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
  }

  async function handleEmailSubmit() {
    if (!email) return;
    setStatus('LOADING');
    setMessage('');
    try {
      await adapter.sendEmailCode(email);
      setStatus('SUCCESS');
      setMessage('Code sent — check your inbox');
      setView('email-code');
    } catch (error) {
      fail(error);
    }
  }

  async function handleCodeSubmit(code: string) {
    setStatus('LOADING');
    setMessage('Verifying…');
    try {
      await adapter.verifyEmailCode(code);
      onAuthenticated();
    } catch (error) {
      fail(error);
    }
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setStatus('LOADING');
    setMessage('');
    try {
      // On web Privy may redirect for OAuth; completion then arrives after the
      // round-trip. Email login resolves in-session and is the robust path.
      await adapter.loginWithOAuth(provider);
      onAuthenticated();
    } catch (error) {
      fail(error);
    }
  }

  const BackButton = ({ onClick }: { onClick: () => void }) => (
    <button type="button" className="pollar-back-btn" onClick={onClick} aria-label="Back">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );

  const showEmail = options.includes('email');
  const showGoogle = options.includes('google');
  const showGithub = options.includes('github');

  return (
    <div className="pollar-modal-card pollar-modal" style={cssVars} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="pollar-close-btn" onClick={onCancel} aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      <div className="pollar-header">
        <div className="pollar-logo-wrap">
          <img src={logoUrl ?? LOGO_POLLAR} alt="Logo" className="pollar-logo" />
        </div>
        <h2 className="pollar-title">{appName}</h2>
        <p className="pollar-subtitle">{adapter.meta.label}</p>
      </div>

      {view === 'email-code' ? (
        <>
          <BackButton onClick={() => setView('root')} />
          <EmailCodeInput email={email} onSubmit={handleCodeSubmit} />
        </>
      ) : (
        <>
          <BackButton onClick={onBack} />
          {showEmail && (
            <div className="pollar-email-section">
              <input
                type="email"
                placeholder="you@email.com"
                value={email}
                disabled={isLoading}
                className="pollar-email-input"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
              />
              <button
                type="button"
                disabled={isLoading || !email}
                className="pollar-btn-primary"
                style={{ marginTop: '0.75rem' }}
                onClick={handleEmailSubmit}
              >
                Submit
              </button>
            </div>
          )}

          {showEmail && (showGoogle || showGithub) && (
            <div className="pollar-divider">
              <div className="pollar-divider-line" />
              <div className="pollar-divider-label">
                <span className="pollar-divider-text">or continue with</span>
              </div>
            </div>
          )}

          {(showGoogle || showGithub) && (
            <div className="pollar-social-list">
              {showGoogle && <GoogleButton disabled={isLoading} onClick={() => handleOAuth('google')} />}
              {showGithub && <GithubButton disabled={isLoading} onClick={() => handleOAuth('github')} />}
            </div>
          )}
        </>
      )}

      <ModalStatusBanner message={message} status={status} onCancel={onCancel} onRetry={undefined} />
      <PollarModalFooter />
    </div>
  );
}
