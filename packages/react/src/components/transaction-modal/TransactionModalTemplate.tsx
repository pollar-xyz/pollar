'use client';

import { TransactionState, WalletType } from '@pollar/core';
import React from 'react';
import { PollarModalFooter } from '../commons';
import { TxStatusView } from './TxStatusView';

export interface TransactionModalTemplateProps {
  theme: string;
  accentColor: string;
  transaction: TransactionState;
  showXdr: boolean;
  copied: boolean;
  explorerUrl: string | null;
  walletType?: WalletType | null;
  onClose: () => void;
  onSignAndSend: () => void;
  onToggleXdr: () => void;
  onCopyHash: () => void;
  onRetry?: () => void;
}

export function TransactionModalTemplate({
  theme,
  accentColor,
  transaction,
  showXdr,
  copied,
  explorerUrl,
  walletType,
  onClose,
  onSignAndSend,
  onToggleXdr,
  onCopyHash,
  onRetry,
}: TransactionModalTemplateProps) {
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
  } as React.CSSProperties;

  return (
    <div
      className="pollar-modal-card pollar-tx-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">Transaction</h2>
      </div>
      <button type="button" className="pollar-close-btn" onClick={onClose} aria-label="Close">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

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
        onDone={onClose}
      />

      <PollarModalFooter />
    </div>
  );
}