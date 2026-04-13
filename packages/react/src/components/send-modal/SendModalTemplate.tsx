'use client';

import { TransactionState, WalletBalanceRecord, WalletType } from '@pollar/core';
import { type CSSProperties } from 'react';
import { PollarModalFooter } from '../commons';
import { TxStatusView } from '../transaction-modal/TxStatusView';

function formatBalance(balance: string): string {
  const n = parseFloat(balance);
  return isNaN(n) ? balance : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

function assetKey(record: WalletBalanceRecord): string {
  return `${record.code}:${record.issuer ?? 'native'}`;
}

export interface SendModalTemplateProps {
  theme: string;
  accentColor: string;
  step: 'form' | 'tx';
  txTitle: string;
  assets: WalletBalanceRecord[];
  selectedAsset: WalletBalanceRecord | null;
  amount: string;
  destination: string;
  formError: string;
  isLoadingBalance: boolean;
  transaction: TransactionState;
  showXdr: boolean;
  copied: boolean;
  explorerUrl: string | null;
  walletType?: WalletType | null | undefined;
  showBack: boolean;
  isInProgress: boolean;
  onClose: () => void;
  onBack: () => void;
  onSelectAsset: (asset: WalletBalanceRecord) => void;
  onAmountChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSubmit: () => void;
  onSignAndSend: () => void;
  onToggleXdr: () => void;
  onCopyHash: () => void;
  onRetry: () => void;
  onDone: () => void;
}

export function SendModalTemplate({
  theme,
  accentColor,
  step,
  txTitle,
  assets,
  selectedAsset,
  amount,
  destination,
  formError,
  isLoadingBalance,
  transaction,
  showXdr,
  copied,
  explorerUrl,
  walletType,
  showBack,
  isInProgress,
  onClose,
  onBack,
  onSelectAsset,
  onAmountChange,
  onDestinationChange,
  onSubmit,
  onSignAndSend,
  onToggleXdr,
  onCopyHash,
  onRetry,
  onDone,
}: SendModalTemplateProps) {
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

  const enabledAssets = assets.filter((a) => a.enabledInApp);
  const otherAssets = assets.filter((a) => !a.enabledInApp);
  const selectedKey = selectedAsset ? assetKey(selectedAsset) : '';
  const canSubmit = !!selectedAsset && !!amount && !!destination.trim() && !isLoadingBalance;

  const title = step === 'form' ? 'Send' : txTitle;

  return (
    <div
      className="pollar-modal-card pollar-send-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="pollar-modal-header">
        <div className="pollar-send-header-left">
          {showBack && (
            <button type="button" className="pollar-modal-close" onClick={onBack} aria-label="Back">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <h2 className="pollar-modal-title">{title}</h2>
        </div>
        {!isInProgress && (
          <div className="pollar-modal-header-actions">
            <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Form step */}
      {step === 'form' && (
        <>
          {/* Asset selector */}
          <div className="pollar-send-field">
            <label className="pollar-send-label">Asset</label>
            {isLoadingBalance ? (
              <div className="pollar-send-skeleton" />
            ) : (
              <select
                className="pollar-input pollar-send-select"
                value={selectedKey}
                onChange={(e) => {
                  const all = [...enabledAssets, ...otherAssets];
                  const found = all.find((a) => assetKey(a) === e.target.value);
                  if (found) onSelectAsset(found);
                }}
              >
                <option value="" disabled>
                  Select asset
                </option>
                {enabledAssets.length > 0 && (
                  <optgroup label="App assets">
                    {enabledAssets.map((a) => (
                      <option key={assetKey(a)} value={assetKey(a)}>
                        {a.code} — {formatBalance(a.available)} available
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherAssets.length > 0 && (
                  <optgroup label="Other assets">
                    {otherAssets.map((a) => (
                      <option key={assetKey(a)} value={assetKey(a)}>
                        {a.code} — {formatBalance(a.available)} available
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>

          {/* Amount */}
          <div className="pollar-send-field">
            <div className="pollar-send-label-row">
              <label className="pollar-send-label">Amount</label>
              {selectedAsset && (
                <span className="pollar-send-hint">
                  Available: {formatBalance(selectedAsset.available)} {selectedAsset.code}
                </span>
              )}
            </div>
            <input
              className="pollar-input"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
            />
          </div>

          {/* Destination */}
          <div className="pollar-send-field">
            <label className="pollar-send-label">Destination wallet</label>
            <input
              className="pollar-input"
              type="text"
              placeholder="G…"
              value={destination}
              onChange={(e) => onDestinationChange(e.target.value)}
            />
          </div>

          {formError && <div className="pollar-modal-error">{formError}</div>}

          <div className="pollar-modal-actions">
            <button className="pollar-btn-primary" onClick={onSubmit} disabled={!canSubmit}>
              Continue
            </button>
          </div>
        </>
      )}

      {/* Transaction step */}
      {step === 'tx' && (
        <TxStatusView
          transaction={transaction}
          showXdr={showXdr}
          copied={copied}
          explorerUrl={explorerUrl}
          walletType={walletType}
          onSignAndSend={onSignAndSend}
          onToggleXdr={onToggleXdr}
          onCopyHash={onCopyHash}
          onRetry={onRetry}
          onDone={onDone}
        />
      )}

      <PollarModalFooter />
    </div>
  );
}