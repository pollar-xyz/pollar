'use client';

import { PollarError, WalletType } from '@pollar/core';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { usePollar } from './context';
import type { PollarStyles } from './types';
import './LoginModal.css';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  API_KEY_NOT_FOUND: 'Invalid API key. Contact the app administrator.',
  API_KEY_EXPIRED: 'API key has expired. Contact the app administrator.',
  ORIGIN_NOT_ALLOWED: 'This origin is not authorized. Contact the app administrator.',
  FREIGHTER_NOT_INSTALLED: 'Freighter is not installed. Get it at freighter.app.',
  WALLET_NOT_AVAILABLE: 'Wallet is not available.',
};

function getErrorMessage(err: unknown): string {
  if (err instanceof PollarError && ERROR_MESSAGES[err.code]) {
    return ERROR_MESSAGES[err.code] ?? '';
  }
  return 'Something went wrong. Please try again.';
}

const SOCIAL_PROVIDERS: { id: string; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'discord', label: 'Discord' },
  { id: 'x', label: 'X' },
  { id: 'github', label: 'GitHub' },
  { id: 'apple', label: 'Apple' },
];

const POLLAR_LOGO = 'https://pollar.xyz/logo_polo.png';

function DefaultLogo() {
  return <img src={POLLAR_LOGO} alt="Pollar" width={64} height={64} className="pollar-logo" />;
}

function SmallDefaultLogo() {
  return <img src={POLLAR_LOGO} alt="Pollar" width={18} height={18} className="pollar-footer-logo" />;
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const { getClient, styles } = usePollar();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    theme = 'light',
    accentColor = '#005DB4',
    logoBase64,
    emailEnabled,
    embeddedWallets,
    providers,
  } = styles;

  const isDark = theme === 'dark';
  const cardBg = isDark ? '#1a1a1a' : '#FFFFFF';
  const cardBorder = isDark ? '#374151' : '#E5E7EB';
  const titleColor = isDark ? '#fff' : '#111827';
  const mutedColor = isDark ? '#9CA3AF' : '#6B7280';
  const socialBg = isDark ? '#374151' : '#FFFFFF';
  const socialBorder = isDark ? '#4B5563' : '#E5E7EB';

  const enabledSocial = SOCIAL_PROVIDERS.filter(
    (s) => providers?.[s.id as keyof PollarStyles['providers']],
  );

  if (!open) return null;

  function handleClose() {
    setEmail('');
    setError(null);
    onClose();
  }

  async function handleEmail() {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      await getClient().login({ provider: 'email', email });
      handleClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleWalletConnect(type: WalletType) {
    setLoading(true);
    setError(null);
    try {
      await getClient().connectWallet(type);
      handleClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialLogin(provider: string) {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await getClient().login({ provider } as any);
      handleClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pollar-overlay" onClick={handleClose}>
      <div
        className="pollar-modal"
        style={
          {
            '--pollar-accent': accentColor,
            backgroundColor: cardBg,
            borderColor: cardBorder,
          } as CSSProperties
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pollar-header">
          <div className="pollar-logo-wrap">
            {logoBase64 ? (
              <img src={logoBase64} alt="Logo" className="pollar-logo" />
            ) : (
              <DefaultLogo />
            )}
          </div>
          <h2 className="pollar-title" style={{ color: titleColor }}>
            Pollar
          </h2>
          <p className="pollar-subtitle" style={{ color: mutedColor }}>
            Log in or sign up
          </p>
        </div>

        {error && <p className="pollar-error">{error}</p>}

        {/* Email */}
        {emailEnabled && (
          <div className="pollar-email-section">
            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEmail()}
              className="pollar-email-input"
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleEmail}
              disabled={loading || !email}
              className="pollar-submit-btn"
              style={{ backgroundColor: accentColor }}
            >
              Submit
            </button>
          </div>
        )}

        {/* Divider */}
        {emailEnabled && enabledSocial.length > 0 && (
          <div className="pollar-divider">
            <div className="pollar-divider-line" />
            <div className="pollar-divider-label">
              <span
                className="pollar-divider-text"
                style={{ backgroundColor: cardBg, color: mutedColor }}
              >
                or continue with
              </span>
            </div>
          </div>
        )}

        {/* Social buttons */}
        {enabledSocial.length > 0 && (
          <div className="pollar-social-list">
            {enabledSocial.map((s) => (
              <button
                key={s.id}
                type="button"
                className="pollar-social-btn"
                disabled={loading}
                style={{ backgroundColor: socialBg, borderColor: socialBorder }}
                onClick={() => handleSocialLogin(s.id)}
              >
                <span className="pollar-social-btn-text" style={{ color: titleColor }}>
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Wallets */}
        {embeddedWallets && (
          <div className="pollar-wallet-section">
            <p className="pollar-wallet-label" style={{ color: mutedColor }}>
              Continue with a wallet
            </p>
            <div className="pollar-wallet-list">
              <button
                type="button"
                className="pollar-wallet-btn"
                disabled={loading}
                style={{
                  borderColor: accentColor,
                  color: accentColor,
                  backgroundColor: `${accentColor}10`,
                }}
                onClick={() => handleWalletConnect(WalletType.FREIGHTER)}
              >
                <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden>
                  <circle cx="16" cy="16" r="16" fill="#5E4AE3" />
                  <path d="M10 16l4-6h8l-4 6 4 6h-8l-4-6z" fill="white" />
                </svg>
                Freighter
              </button>
              <button
                type="button"
                className="pollar-wallet-btn"
                disabled={loading}
                style={{
                  borderColor: accentColor,
                  color: accentColor,
                  backgroundColor: `${accentColor}10`,
                }}
                onClick={() => handleWalletConnect(WalletType.ALBEDO)}
              >
                <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden>
                  <circle cx="16" cy="16" r="16" fill="#F5A623" />
                  <circle cx="16" cy="16" r="7" fill="white" />
                  <circle cx="16" cy="16" r="3" fill="#F5A623" />
                </svg>
                Albedo
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pollar-footer" style={{ borderColor: cardBorder }}>
          <span className="pollar-footer-protected" style={{ color: mutedColor }}>
            Protected by
          </span>
          <div className="pollar-footer-brand">
            <SmallDefaultLogo />
            <span className="pollar-footer-name" style={{ color: titleColor }}>
              Pollar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
