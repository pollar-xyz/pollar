'use client';

import { LOGO_POLLAR } from '../../constants';

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
  onToggleOpen: () => void;
  onCopy: () => void;
  onWalletBalance: () => void;
  onTxHistory: () => void;
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
  onToggleOpen,
  onCopy,
  onWalletBalance,
  onTxHistory,
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
      <button className="wallet-btn" style={{ backgroundColor: accentColor }} onClick={onToggleOpen}>
        {cropWallet(walletAddress)}
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
      </button>

      {open && (
        <div className="wallet-dropdown" style={{ backgroundColor: dropdownBg, borderColor: dropdownBorder }}>
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
          <button
            className="wallet-dropdown-item"
            style={{ color: itemColor }}
            onClick={onWalletBalance}
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
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <circle cx="16" cy="12" r="2" />
              <path d="M22 8H12" />
            </svg>
            Wallet balance
          </button>
          <button
            className="wallet-dropdown-item"
            style={{ color: itemColor }}
            onClick={onTxHistory}
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10,9 9,9 8,9" />
            </svg>
            Transaction history
          </button>
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