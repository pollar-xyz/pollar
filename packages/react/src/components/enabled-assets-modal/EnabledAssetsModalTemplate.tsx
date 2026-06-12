'use client';

import { EnabledAssetRecord, EnabledAssetsState } from '@pollar/core';
import { type CSSProperties } from 'react';
import { PollarModalFooter } from '../commons';

function cropAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

function AssetItem({ record }: { record: EnabledAssetRecord }) {
  const established = record.trustlineEstablished;
  return (
    <div className="pollar-asset-item">
      <div className="pollar-asset-info">
        <span className="pollar-asset-code">{record.code}</span>
        {record.name && <span className="pollar-asset-name">{record.name}</span>}
      </div>
      <span className={`pollar-asset-trustline${established ? ' established' : ''}`}>
        {established ? 'Trustline active' : 'Needs trustline'}
      </span>
    </div>
  );
}

export interface EnabledAssetsModalTemplateProps {
  theme: string;
  accentColor: string;
  enabledAssets: EnabledAssetsState;
  walletAddress: string;
  onRefresh: () => void;
  onClose: () => void;
}

export function EnabledAssetsModalTemplate({
  theme,
  accentColor,
  enabledAssets,
  walletAddress,
  onRefresh,
  onClose,
}: EnabledAssetsModalTemplateProps) {
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

  const isLoading = enabledAssets.step === 'loading';
  const data = enabledAssets.step === 'loaded' ? enabledAssets.data : null;

  return (
    <div className="pollar-modal-card pollar-asset-modal" data-theme={theme} style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">Enabled Assets</h2>
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

      {walletAddress && <div className="pollar-asset-address">{cropAddress(walletAddress)}</div>}

      {isLoading && <div className="pollar-modal-empty">Loading…</div>}

      {enabledAssets.step === 'error' && <div className="pollar-modal-error">{enabledAssets.message}</div>}

      {data && !data.exists && <div className="pollar-modal-empty">Account not found on {data.network}.</div>}

      {data && data.assets.length === 0 && <div className="pollar-modal-empty">No assets enabled for this application.</div>}

      {data && data.assets.length > 0 && (
        <div className="pollar-asset-list">
          {data.assets.map((a) => (
            <AssetItem key={a.code + (a.issuer ?? '')} record={a} />
          ))}
        </div>
      )}

      <PollarModalFooter />
    </div>
  );
}
