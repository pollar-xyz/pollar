'use client';

import { useEffect, useRef, useState } from 'react';
import { LOGO_POLLAR } from './constants';
import { usePollar } from './context';
import './WalletButton.css';

function cropWallet(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function ButtonLogo() {
  return <img src={LOGO_POLLAR} alt="Pollar" width={22} height={22} className="wallet-btn-logo" />;
}

export function WalletButton() {
  const { getClient, walletAddress, styles, openLoginModal } = usePollar();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const isDark = theme === 'dark';
  const dropdownBg = isDark ? '#18181b' : '#fff';
  const dropdownBorder = isDark ? '#3f3f46' : '#e4e4e7';
  const itemColor = isDark ? '#fafafa' : '#18181b';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleCopy() {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleLogout() {
    setOpen(false);
    getClient().logout();
  }

  if (!walletAddress) {
    return (
      <button type="button" className="wallet-login-btn" style={{ backgroundColor: accentColor }} onClick={openLoginModal}>
        <ButtonLogo />
        Login with Pollar
      </button>
    );
  }

  return (
    <div className="wallet-wrapper" ref={wrapperRef}>
      <button className="wallet-btn" style={{ backgroundColor: accentColor }} onClick={() => setOpen((v) => !v)}>
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
          <button className="wallet-dropdown-item" style={{ color: itemColor }} onClick={handleCopy}>
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
          <button className="wallet-dropdown-item danger" onClick={handleLogout}>
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
