'use client';

import { useEffect, useRef, useState } from 'react';
import { usePollar } from './context';
import './WalletButton.css';

function cropWallet(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const { login, logout, walletAddress, status } = usePollar();
  const [ open, setOpen ] = useState(false);
  const [ copied, setCopied ] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  console.log({ walletAddress, status });
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
    logout();
  }
  
  if (!walletAddress) {
    return (
      <button className="wallet-sign-in-btn" onClick={login}>
        Sign in
      </button>
    );
  }
  
  return (
    <div className="wallet-wrapper" ref={wrapperRef}>
      <button className="wallet-btn" onClick={() => setOpen((v) => !v)}>
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
        <div className="wallet-dropdown">
          <button className="wallet-dropdown-item" onClick={handleCopy}>
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
