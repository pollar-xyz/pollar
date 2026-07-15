'use client';

import { EnabledAssetRecord, EnabledAssetsState } from '@pollar/core';
import { useState, type CSSProperties } from 'react';
import { PollarModalFooter } from '../commons';

function cropAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

function cssVarsFor(theme: string, accentColor: string): CSSProperties {
  const isDark = theme === 'dark';
  return {
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
}

function assetKey(record: { code: string; issuer?: string }): string {
  return record.code + (record.issuer ?? '');
}

function AssetItem({
  record,
  busy,
  disabled,
  onToggle,
}: {
  record: EnabledAssetRecord;
  busy: boolean;
  disabled: boolean;
  onToggle: (record: EnabledAssetRecord) => void;
}) {
  const established = record.trustlineEstablished;
  const isNative = record.type === 'native';

  return (
    <div className="pollar-asset-item">
      <div className="pollar-asset-info">
        <div className="pollar-asset-code-row">
          <span className="pollar-asset-code">{record.code}</span>
          {record.enabledInApp && <span className="pollar-asset-tag">App</span>}
        </div>
        {record.name && <span className="pollar-asset-name">{record.name}</span>}
        {!isNative && record.enabledInApp && (
          <span className="pollar-asset-sponsor">
            {record.sponsored ? 'Reserve sponsored by the app' : 'You pay the reserve (~0.5 XLM)'}
          </span>
        )}
      </div>
      <div className="pollar-asset-actions">
        <span className={`pollar-asset-trustline${established ? ' pollar-established' : ''}`}>
          {established ? 'Trustline active' : 'Needs trustline'}
        </span>
        {!isNative && (
          <button
            className={`pollar-asset-btn${established ? ' pollar-danger' : ''}`}
            onClick={() => onToggle(record)}
            disabled={busy || disabled}
          >
            {busy ? (
              <span className="pollar-spinner pollar-spinner-sm pollar-spinner-current" />
            ) : established ? (
              'Disable'
            ) : (
              'Enable'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export interface EnabledAssetsModalTemplateProps {
  theme: string;
  accentColor: string;
  enabledAssets: EnabledAssetsState;
  walletAddress: string;
  /** Key (`code+issuer`) of the asset whose trustline action is in flight. */
  busyKey: string | null;
  actionError: string | null;
  onRefresh: () => void;
  onClose: () => void;
  onToggleTrustline: (record: EnabledAssetRecord) => void;
  onAddCustom: () => void;
}

export function EnabledAssetsModalTemplate({
  theme,
  accentColor,
  enabledAssets,
  walletAddress,
  busyKey,
  actionError,
  onRefresh,
  onClose,
  onToggleTrustline,
  onAddCustom,
}: EnabledAssetsModalTemplateProps) {
  const cssVars = cssVarsFor(theme, accentColor);

  const isLoading = enabledAssets.step === 'loading';
  const data = enabledAssets.step === 'loaded' ? enabledAssets.data : null;
  const busy = busyKey !== null;

  return (
    <div
      className="pollar-modal-card pollar-asset-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">Trustlines</h2>
        <div className="pollar-modal-header-actions">
          <button
            type="button"
            className="pollar-modal-close"
            onClick={onRefresh}
            disabled={isLoading || busy}
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

      {walletAddress && <div className="pollar-asset-address">{cropAddress(walletAddress)}</div>}

      {isLoading && (
        <div className="pollar-loading-block">
          <div className="pollar-spinner" />
          <span>Loading…</span>
        </div>
      )}

      {enabledAssets.step === 'error' && <div className="pollar-modal-error">{enabledAssets.message}</div>}

      {actionError && <div className="pollar-modal-action-error">{actionError}</div>}

      {data && !data.exists && <div className="pollar-modal-empty">Account not found on {data.network}.</div>}

      {data && data.assets.length === 0 && <div className="pollar-modal-empty">No trustlines found.</div>}

      {data && data.assets.length > 0 && (
        <div className="pollar-asset-list">
          {data.assets.map((a) => (
            <AssetItem
              key={assetKey(a)}
              record={a}
              busy={busyKey === assetKey(a)}
              disabled={busy && busyKey !== assetKey(a)}
              onToggle={onToggleTrustline}
            />
          ))}
        </div>
      )}

      <button className="pollar-asset-add-custom" onClick={onAddCustom} disabled={busy}>
        + Add custom trustline
      </button>

      <PollarModalFooter />
    </div>
  );
}

export interface CustomTrustlineModalTemplateProps {
  theme: string;
  accentColor: string;
  busy: boolean;
  actionError: string | null;
  onBack: () => void;
  onClose: () => void;
  onSubmit: (input: { code: string; issuer: string; limit?: string }) => void;
}

function isValidIssuer(issuer: string): boolean {
  return issuer.length === 56 && issuer.startsWith('G');
}

export function CustomTrustlineModalTemplate({
  theme,
  accentColor,
  busy,
  actionError,
  onBack,
  onClose,
  onSubmit,
}: CustomTrustlineModalTemplateProps) {
  const cssVars = cssVarsFor(theme, accentColor);

  const [code, setCode] = useState('');
  const [issuer, setIssuer] = useState('');
  const [limit, setLimit] = useState('');

  const codeOk = code.trim().length >= 1 && code.trim().length <= 12;
  const issuerOk = isValidIssuer(issuer.trim());
  const canSubmit = codeOk && issuerOk && !busy;

  const submit = () => {
    if (!canSubmit) return;
    const trimmedLimit = limit.trim();
    onSubmit({ code: code.trim(), issuer: issuer.trim(), ...(trimmedLimit ? { limit: trimmedLimit } : {}) });
  };

  return (
    <div
      className="pollar-modal-card pollar-asset-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <div className="pollar-modal-header-actions">
          <button className="pollar-modal-close" onClick={onBack} disabled={busy} aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="pollar-modal-title">Add custom trustline</h2>
        </div>
        <button className="pollar-modal-close" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <p className="pollar-asset-custom-hint">
        Custom trustlines aren&apos;t sponsored — your wallet pays the 0.5 XLM reserve and the transaction fee.
      </p>

      <div className="pollar-field">
        <label className="pollar-label" htmlFor="pollar-trustline-code">
          Asset code
        </label>
        <input
          id="pollar-trustline-code"
          className="pollar-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="USDC"
          maxLength={12}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </div>

      <div className="pollar-field">
        <label className="pollar-label" htmlFor="pollar-trustline-issuer">
          Issuer
        </label>
        <input
          id="pollar-trustline-issuer"
          className="pollar-input"
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          placeholder="G…"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        {issuer.trim().length > 0 && !issuerOk && (
          <span className="pollar-field-error">Issuer must be a 56-character Stellar address starting with G.</span>
        )}
      </div>

      <div className="pollar-field">
        <label className="pollar-label" htmlFor="pollar-trustline-limit">
          Limit <span className="pollar-label-optional">(optional)</span>
        </label>
        <input
          id="pollar-trustline-limit"
          className="pollar-input"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="Maximum"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </div>

      {actionError && <div className="pollar-modal-action-error">{actionError}</div>}

      <div className="pollar-modal-actions">
        <button type="button" className="pollar-btn-primary" onClick={submit} disabled={!canSubmit}>
          {busy ? (
            <>
              <span className="pollar-spinner pollar-spinner-sm" />
              Enabling…
            </>
          ) : (
            'Enable trustline'
          )}
        </button>
      </div>

      <PollarModalFooter />
    </div>
  );
}
