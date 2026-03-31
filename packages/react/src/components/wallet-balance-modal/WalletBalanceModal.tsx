'use client';

import { WalletBalanceContent, WalletBalanceRecord } from '@pollar/core';
import { type CSSProperties, useEffect, useState } from 'react';
import { usePollar } from '../../context';
import { PollarModalFooter } from '../commons';
import '../shared.css';
import './WalletBalanceModal.css';

function formatBalance(balance: string): string {
  const n = parseFloat(balance);
  return isNaN(n) ? balance : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

function cropAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

function BalanceItem({ record }: { record: WalletBalanceRecord }) {
  const balanceDiffers = record.balance !== record.available;
  return (
    <div className="pollar-bal-item">
      <span className="pollar-bal-asset">{record.code}</span>
      <div className="pollar-bal-amounts">
        <span className="pollar-bal-amount">{formatBalance(record.balance)}</span>
        {balanceDiffers && (
          <span className="pollar-bal-available">{formatBalance(record.available)} available</span>
        )}
      </div>
    </div>
  );
}

interface WalletBalanceModalProps {
  onClose: () => void;
}

export function WalletBalanceModal({ onClose }: WalletBalanceModalProps) {
  const { getBalance, walletAddress, styles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const isDark = theme === 'dark';

  const cssVars = {
    '--pollar-accent': accentColor,
    '--pollar-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': isDark ? '#ffffff' : '#111827',
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    '--pollar-input-bg': isDark ? '#374151' : 'rgba(0,0,0,0.04)',
    '--pollar-error-text': isDark ? '#f87171' : '#dc2626',
  } as CSSProperties;

  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [data, setData] = useState<WalletBalanceContent | null>(null);

  async function load() {
    setStatus('loading');
    const result = await getBalance();
    if (result) {
      setData(result);
      setStatus('loaded');
    } else {
      setStatus('error');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const isLoading = status === 'loading';

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <div className="pollar-bal-modal" data-theme={theme} style={cssVars} onClick={(e) => e.stopPropagation()}>
        <div className="pollar-modal-header">
          <h2 className="pollar-modal-title">Wallet Balance</h2>
          <div className="pollar-modal-header-actions">
            <button className="pollar-modal-refresh-btn" onClick={load} disabled={isLoading}>
              <svg
                className={`pollar-modal-refresh-icon${isLoading ? ' spinning' : ''}`}
                width="13"
                height="13"
                viewBox="0 0 13 13"
                fill="none"
                aria-hidden
              >
                <path d="M11.5 6.5a5 5 0 11-1.5-3.536" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10 1v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Refresh
            </button>
            <button className="pollar-modal-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {walletAddress && (
          <div className="pollar-bal-address">{cropAddress(walletAddress)}</div>
        )}

        {isLoading && <div className="pollar-modal-empty">Loading…</div>}

        {status === 'error' && (
          <div className="pollar-modal-error">Failed to load balances. Check your connection.</div>
        )}

        {status === 'loaded' && data && !data.exists && (
          <div className="pollar-modal-empty">Account not found on {data.network}.</div>
        )}

        {status === 'loaded' && data?.exists && data.balances.length === 0 && (
          <div className="pollar-modal-empty">No balances found.</div>
        )}

        {status === 'loaded' && data?.exists && data.balances.length > 0 && (
          <div className="pollar-bal-list">
            {data.balances.map((b) => (
              <BalanceItem key={b.code + (b.issuer ?? '')} record={b} />
            ))}
          </div>
        )}

        <PollarModalFooter />
      </div>
    </div>
  );
}