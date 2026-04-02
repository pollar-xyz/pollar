'use client';

import { WalletBalanceRecord, WalletBalanceState } from '@pollar/core';
import { type CSSProperties } from 'react';
import { PollarModalFooter } from '../commons';

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

export interface WalletBalanceModalTemplateProps {
  theme: string;
  accentColor: string;
  walletBalance: WalletBalanceState;
  walletAddress: string;
  onRefresh: () => void;
  onClose: () => void;
}

export function WalletBalanceModalTemplate({
  theme,
  accentColor,
  walletBalance,
  walletAddress,
  onRefresh,
  onClose,
}: WalletBalanceModalTemplateProps) {
  const isDark = theme === 'dark';

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
  } as CSSProperties;

  const isLoading = walletBalance.step === 'loading';
  const data = walletBalance.step === 'loaded' ? walletBalance.data : null;

  return (
    <div className="pollar-modal-card pollar-bal-modal" data-theme={theme} style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">Wallet Balance</h2>
        <div className="pollar-modal-header-actions">
          <button className="pollar-modal-refresh-btn" onClick={onRefresh} disabled={isLoading}>
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

      {walletBalance.step === 'error' && (
        <div className="pollar-modal-error">{walletBalance.message}</div>
      )}

      {data && !data.exists && (
        <div className="pollar-modal-empty">Account not found on {data.network}.</div>
      )}

      {data?.exists && data.balances.length === 0 && (
        <div className="pollar-modal-empty">No balances found.</div>
      )}

      {data?.exists && data.balances.length > 0 && (
        <div className="pollar-bal-list">
          {data.balances.map((b) => (
            <BalanceItem key={b.code + (b.issuer ?? '')} record={b} />
          ))}
        </div>
      )}

      <PollarModalFooter />
    </div>
  );
}