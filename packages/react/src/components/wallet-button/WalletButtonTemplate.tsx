'use client';

import { WalletId } from '@pollar/core';
import { LOGO_POLLAR } from '../../constants';
import './WalletButton.css';

function ButtonLogo() {
  return <img src={LOGO_POLLAR} alt="Pollar" width={22} height={22} className="wallet-btn-logo" />;
}

export interface WalletButtonTemplateProps {
  walletAddress: string | null;
  accentColor: string;
  open: boolean;
  copied: boolean;
  dropdownBg: string;
  dropdownBorder: string;
  itemColor: string;
  wrapperRef: React.RefObject<HTMLDivElement>;
  isInProgress: boolean;
  walletType: WalletId | null;
  /** Show the "Create account" action (external wallet not yet on-chain, IMMEDIATE funding). */
  showCreateAccount: boolean;
  creatingAccount: boolean;
  onToggleOpen: () => void;
  onCreateAccount: () => void;
  onCopy: () => void;
  onWalletBalance: () => void;
  onTxHistory: () => void;
  onSend: () => void;
  onReceive: () => void;
  onSessions: () => void;
  onKyc: () => void;
  onRamp: () => void;
  onDistributionRules: () => void;
  onLogout: () => void;
  onLogin: () => void;
}

function cropWallet(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletButtonTemplate({
  walletAddress,
  accentColor,
  open,
  copied,
  dropdownBg,
  dropdownBorder,
  itemColor,
  wrapperRef,
  isInProgress,
  showCreateAccount,
  creatingAccount,
  onToggleOpen,
  onCreateAccount,
  onCopy,
  onWalletBalance,
  onTxHistory,
  onSend,
  onReceive,
  onSessions,
  onKyc,
  onRamp,
  onDistributionRules,
  onLogout,
  onLogin,
}: WalletButtonTemplateProps) {
  if (!walletAddress) {
    return (
      <button type="button" className="wallet-login-btn" style={{ backgroundColor: accentColor }} onClick={onLogin}>
        <ButtonLogo />
        Login with Pollar
      </button>
    );
  }

  return (
    <div className="wallet-wrapper" ref={wrapperRef}>
      <button
        className="wallet-btn"
        style={{ backgroundColor: accentColor }}
        onClick={isInProgress ? undefined : onToggleOpen}
        disabled={isInProgress}
        aria-busy={isInProgress}
      >
        <span className="wallet-btn-label">{cropWallet(walletAddress)}</span>
        {isInProgress ? (
          <svg className="wallet-btn-spinner" viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="4.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
            <circle
              cx="6"
              cy="6"
              r="4.5"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="14 9"
              transform="rotate(-90 6 6)"
            />
          </svg>
        ) : (
          <svg
            className={`wallet-chevron${open ? ' open' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2,4 6,8 10,4" />
          </svg>
        )}
      </button>

      {open && (
        <div className="wallet-dropdown" style={{ backgroundColor: dropdownBg, borderColor: dropdownBorder }}>
          {showCreateAccount && (
            <>
              <button
                className="wallet-dropdown-item"
                style={{ color: itemColor }}
                onClick={onCreateAccount}
                disabled={creatingAccount}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                {creatingAccount ? 'Creating account…' : 'Create account'}
              </button>
              <div className="wallet-dropdown-divider" />
            </>
          )}
          <button className="wallet-dropdown-item" style={{ color: itemColor }} onClick={onSend}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Send
          </button>
          <button className="wallet-dropdown-item" style={{ color: itemColor }} onClick={onReceive}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="8 17 12 21 16 17" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
            </svg>
            Receive
          </button>
          <div className="wallet-dropdown-divider" />
          <button className="wallet-dropdown-item" style={{ color: itemColor }} onClick={onCopy}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? 'Copied!' : 'Copy address'}
          </button>
          <button className="wallet-dropdown-item" style={{ color: itemColor }} onClick={onWalletBalance}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <circle cx="16" cy="12" r="2" />
              <path d="M22 8H12" />
            </svg>
            Wallet balance
          </button>
          <button className="wallet-dropdown-item" style={{ color: itemColor }} onClick={onTxHistory}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10,9 9,9 8,9" />
            </svg>
            Transaction history
          </button>
          <div className="wallet-dropdown-divider" />
          {/* Buy / Sell (ramp) */}
          <button className="wallet-dropdown-item" style={{ color: itemColor }} onClick={onRamp}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            Buy / Sell
          </button>
          {/* Identity verification */}
          <button className="wallet-dropdown-item" style={{ color: itemColor }} onClick={onKyc}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              <path d="M2 21v-1a6 6 0 0 1 6-6h2" />
              <polyline points="16 11 18 13 22 9" />
            </svg>
            Identity verification
          </button>
          <button className="wallet-dropdown-item" style={{ color: itemColor }} onClick={onDistributionRules}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Distribution rules
          </button>
          <button className="wallet-dropdown-item" style={{ color: itemColor }} onClick={onSessions}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            Active sessions
          </button>
          <div className="wallet-dropdown-divider" />
          <button className="wallet-dropdown-item danger" onClick={onLogout}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
