'use client';

import { WalletBalanceRecord, WalletBalanceState } from '@pollar/core';
import { type CSSProperties } from 'react';
import { CopyButton, PollarModalFooter } from '../commons';

// Stellar amounts are int64 scaled by 10^7, so 7 decimals is the ledger's exact
// precision. Always render all 7 (padded) in monospace so columns line up.
function formatBalance(balance: string): string {
  const n = parseFloat(balance);
  return isNaN(n) ? balance : n.toLocaleString(undefined, { minimumFractionDigits: 7, maximumFractionDigits: 7 });
}

function cropAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

// Short label + accent per chain for the network tag. Only shown when the app
// spans more than one chain, so a single-chain (Stellar-only) app looks unchanged.
const CHAIN_TAG: Record<string, { label: string; color: string }> = {
  STELLAR: { label: 'Stellar', color: '#7d00ff' },
  POLYGON: { label: 'Polygon', color: '#8247e5' },
  SOLANA: { label: 'Solana', color: '#14f195' },
};

function ChainTag({ chain }: { chain: string }) {
  const tag = CHAIN_TAG[chain] ?? { label: chain, color: '#6b7280' };
  return (
    <span className="pollar-bal-chain-tag" style={{ '--pollar-chain-color': tag.color } as CSSProperties}>
      {tag.label}
    </span>
  );
}

function BalanceItem({ record, showChain }: { record: WalletBalanceRecord; showChain: boolean }) {
  const balanceDiffers = record.balance !== record.available;
  return (
    <div className="pollar-bal-item">
      <div className="pollar-bal-asset-info">
        <span className="pollar-bal-asset-code-row">
          <span className="pollar-bal-asset">{record.code}</span>
          {showChain && record.chain && <ChainTag chain={record.chain} />}
        </span>
        {record.issuer && (
          <span className="pollar-bal-issuer">
            <span className="pollar-bal-issuer-addr">{cropAddress(record.issuer)}</span>
            <CopyButton value={record.issuer} label="Copy issuer address" className="pollar-copy-btn-sm" />
          </span>
        )}
      </div>
      <div className="pollar-bal-amounts">
        <span className="pollar-bal-amount">{formatBalance(record.balance)}</span>
        {balanceDiffers && <span className="pollar-bal-available">{formatBalance(record.available)} available</span>}
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
          <button
            type="button"
            className="pollar-modal-close"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh"
            title="Refresh"
          >
            <svg
              className={isLoading ? 'pollar-modal-refresh-icon pollar-spinning' : 'pollar-modal-refresh-icon'}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button className="pollar-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {walletAddress && (
        <div className="pollar-bal-address-row">
          <span className="pollar-bal-address">{cropAddress(walletAddress)}</span>
          <CopyButton value={walletAddress} label="Copy wallet address" />
        </div>
      )}

      {isLoading && (
        <div className="pollar-loading-block">
          <div className="pollar-spinner" />
          <span>Loading…</span>
        </div>
      )}

      {walletBalance.step === 'error' && <div className="pollar-modal-error">{walletBalance.message}</div>}

      {data && !data.exists && <div className="pollar-modal-empty">Account not found on {data.network}.</div>}

      {data?.exists && data.balances.length === 0 && <div className="pollar-modal-empty">No balances found.</div>}

      {data?.exists && data.balances.length > 0 && (
        <div className="pollar-bal-list">
          {data.balances.map((b) => (
            <BalanceItem key={(b.chain ?? '') + b.code + (b.issuer ?? '')} record={b} showChain={data.multichain === true} />
          ))}
        </div>
      )}

      <PollarModalFooter />
    </div>
  );
}
