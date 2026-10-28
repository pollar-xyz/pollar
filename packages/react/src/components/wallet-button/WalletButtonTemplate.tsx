'use client';

import type { CosignCustody } from '@pollar/core';
import { useState } from 'react';
import { LOGO_POLLAR_MARK_ON_DARK, LOGO_POLLAR_MARK_ON_LIGHT } from '../../constants';
import { buildModalCssVars, readableTextOn, type ModalStyleOverrides } from '../modal-theme';
import '../shared.css';
import './WalletButton.css';

/** The Pollar mark that reads on the accent fill: white on a dark accent, the
 *  blue one on a pale accent (where the label turns dark too). */
function ButtonLogo({ accentColor }: { accentColor: string }) {
  const src = readableTextOn(accentColor) === '#ffffff' ? LOGO_POLLAR_MARK_ON_DARK : LOGO_POLLAR_MARK_ON_LIGHT;
  return <img src={src} alt="Pollar" width={22} height={22} className="pollar-wallet-btn-logo" />;
}

export interface WalletButtonTemplateProps {
  walletAddress: string | null;
  theme: string;
  accentColor: string;
  /** The app's Branding, as every modal template takes it. */
  styleOverrides?: ModalStyleOverrides;
  open: boolean;
  copied: boolean;
  wrapperRef: React.RefObject<HTMLDivElement>;
  isInProgress: boolean;
  /** Show the "Create account" action (external wallet not yet on-chain, IMMEDIATE funding). */
  showCreateAccount: boolean;
  /**
   * Why the wallet cannot act on-chain yet (its account is being created, or
   * that failed), or null when it can. Shown as a banner in the dropdown, since
   * the address itself is valid and worth copying either way. Optional, so a
   * custom template written before this existed keeps compiling.
   */
  notReadyReason?: string | null;
  /**
   * The wallet has no recovery method yet and signs nothing but its own setup.
   * Shown at the top of the menu with a way to fix it. Optional for custom templates.
   */
  recoveryLocked?: boolean;
  /** Open the recovery methods; the item shows only when set. */
  onRecovery?: () => void;
  creatingAccount: boolean;
  /**
   * Signed in with no wallet yet (an app that creates wallets on demand, or
   * none). The button then shows the account menu instead of Login, with Create
   * wallet only when `onCreateWallet` is set. Optional, so a custom template
   * written before this existed keeps compiling.
   */
  signedIn?: boolean;
  creatingWallet?: boolean;
  createWalletError?: string | null;
  /**
   * The app leaves the custody to the user (USER_CHOICE): Create wallet offers
   * co-signed and self-custody, and calls `onCreateWallet` with the pick. A
   * self-custody wallet is created only after the user accepts its risks.
   */
  custodyChoice?: boolean;
  onCreateWallet?: (custody?: CosignCustody) => void;
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
  theme,
  accentColor,
  styleOverrides,
  open,
  copied,
  wrapperRef,
  isInProgress,
  showCreateAccount,
  notReadyReason,
  recoveryLocked,
  onRecovery,
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
  signedIn,
  creatingWallet,
  createWalletError,
  custodyChoice,
  onCreateWallet,
}: WalletButtonTemplateProps) {
  const [selfCustodyNotice, setSelfCustodyNotice] = useState(false);
  const [risksAccepted, setRisksAccepted] = useState(false);
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);
  if (!walletAddress && signedIn) {
    return (
      <div className="pollar-wallet-wrapper" ref={wrapperRef} style={cssVars}>
        <button className="pollar-wallet-btn" onClick={onToggleOpen}>
          <span className="pollar-wallet-btn-label">{onCreateWallet ? 'No wallet' : 'Signed in'}</span>
          <svg
            className={`pollar-wallet-chevron${open ? ' pollar-open' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2,4 6,8 10,4" />
          </svg>
        </button>

        {open && (
          <div className="pollar-wallet-dropdown">
            {createWalletError && (
              <>
                <div className="pollar-wallet-dropdown-notice" role="status">
                  {createWalletError}
                </div>
                <div className="pollar-wallet-dropdown-divider" />
              </>
            )}
            {onCreateWallet && !custodyChoice && (
              <>
                <button className="pollar-wallet-dropdown-item" onClick={() => onCreateWallet()} disabled={creatingWallet}>
                  {creatingWallet ? 'Creating wallet…' : 'Create wallet'}
                </button>
                <div className="pollar-wallet-dropdown-divider" />
              </>
            )}
            {onCreateWallet && custodyChoice && !selfCustodyNotice && (
              <>
                <button
                  className="pollar-wallet-dropdown-item"
                  onClick={() => onCreateWallet('COSIGNED')}
                  disabled={creatingWallet}
                >
                  {creatingWallet ? 'Creating wallet…' : 'Create co-signed wallet'}
                </button>
                <div className="pollar-wallet-dropdown-notice">
                  You and the app approve every signature together. Your wallet can be recovered with help.
                </div>
                <button
                  className="pollar-wallet-dropdown-item"
                  onClick={() => setSelfCustodyNotice(true)}
                  disabled={creatingWallet}
                >
                  Create self-custody wallet
                </button>
                <div className="pollar-wallet-dropdown-notice">
                  Only your device signs. Nobody else can move or recover your funds.
                </div>
                <div className="pollar-wallet-dropdown-divider" />
              </>
            )}
            {onCreateWallet && custodyChoice && selfCustodyNotice && (
              <>
                <div className="pollar-wallet-dropdown-notice" role="alert">
                  In a self-custody wallet only your device can sign. If you lose this device and every recovery method, nobody
                  can recover the wallet or its funds, not the app and not Pollar. Nobody can undo or freeze a transaction you
                  sign.
                </div>
                <label className="pollar-wallet-dropdown-notice">
                  <input
                    type="checkbox"
                    checked={risksAccepted}
                    onChange={(e) => setRisksAccepted(e.target.checked)}
                    disabled={creatingWallet}
                  />{' '}
                  I understand and accept these risks
                </label>
                <button
                  className="pollar-wallet-dropdown-item"
                  onClick={() => onCreateWallet('SELF_CUSTODY')}
                  disabled={creatingWallet || !risksAccepted}
                >
                  {creatingWallet ? 'Creating wallet…' : 'Create self-custody wallet'}
                </button>
                <button
                  className="pollar-wallet-dropdown-item"
                  onClick={() => {
                    setSelfCustodyNotice(false);
                    setRisksAccepted(false);
                  }}
                  disabled={creatingWallet}
                >
                  Back
                </button>
                <div className="pollar-wallet-dropdown-divider" />
              </>
            )}
            <button className="pollar-wallet-dropdown-item" onClick={onSessions}>
              Active sessions
            </button>
            <div className="pollar-wallet-dropdown-divider" />
            <button className="pollar-wallet-dropdown-item pollar-danger" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <button type="button" className="pollar-wallet-login-btn" style={cssVars} onClick={onLogin}>
        <ButtonLogo accentColor={accentColor} />
        Login with Pollar
      </button>
    );
  }

  return (
    <div className="pollar-wallet-wrapper" ref={wrapperRef} style={cssVars}>
      <button
        className="pollar-wallet-btn"
        onClick={isInProgress ? undefined : onToggleOpen}
        disabled={isInProgress}
        aria-busy={isInProgress}
      >
        <span className="pollar-wallet-btn-label">{cropWallet(walletAddress)}</span>
        {isInProgress ? (
          <svg className="pollar-wallet-btn-spinner" viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden>
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
            className={`pollar-wallet-chevron${open ? ' pollar-open' : ''}`}
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
        <div className="pollar-wallet-dropdown">
          {recoveryLocked && (
            <>
              <div className="pollar-wallet-dropdown-notice pollar-danger" role="alert">
                Locked: add a way to recover this wallet before sending or receiving. If you lose this device without one, the
                funds are lost.
              </div>
              <div className="pollar-wallet-dropdown-divider" />
            </>
          )}
          {notReadyReason && (
            <>
              <div className="pollar-wallet-dropdown-notice" role="status">
                {notReadyReason}
              </div>
              <div className="pollar-wallet-dropdown-divider" />
            </>
          )}
          {showCreateAccount && (
            <>
              <button className="pollar-wallet-dropdown-item" onClick={onCreateAccount} disabled={creatingAccount}>
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
              <div className="pollar-wallet-dropdown-divider" />
            </>
          )}
          <button className="pollar-wallet-dropdown-item" onClick={onSend}>
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
          <button className="pollar-wallet-dropdown-item" onClick={onReceive}>
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
          <div className="pollar-wallet-dropdown-divider" />
          <button className="pollar-wallet-dropdown-item" onClick={onCopy}>
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
          <button className="pollar-wallet-dropdown-item" onClick={onWalletBalance}>
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
          <button className="pollar-wallet-dropdown-item" onClick={onTxHistory}>
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
          <div className="pollar-wallet-dropdown-divider" />
          {/* Buy / Sell (ramp) */}
          <button className="pollar-wallet-dropdown-item" onClick={onRamp}>
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
          <button className="pollar-wallet-dropdown-item" onClick={onKyc}>
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
          <button className="pollar-wallet-dropdown-item" onClick={onDistributionRules}>
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
          <button className="pollar-wallet-dropdown-item" onClick={onSessions}>
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
          {onRecovery && (
            <button className={`pollar-wallet-dropdown-item${recoveryLocked ? ' pollar-danger' : ''}`} onClick={onRecovery}>
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
                <path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3z" />
              </svg>
              {recoveryLocked ? 'Set up wallet recovery' : 'Wallet recovery'}
            </button>
          )}
          <div className="pollar-wallet-dropdown-divider" />
          <button className="pollar-wallet-dropdown-item pollar-danger" onClick={onLogout}>
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
