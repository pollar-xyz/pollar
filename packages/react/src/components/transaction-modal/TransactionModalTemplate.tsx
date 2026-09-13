'use client';

import { TransactionState, WalletId } from '@pollar/core';
import React from 'react';
import { PollarModalFooter } from '../commons';
import { TxStatusView } from './TxStatusView';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';

export interface TransactionModalTemplateProps {
  theme: string;
  accentColor: string;
  /** Per-app modal chrome overrides (background, card + button radius). */
  styleOverrides?: ModalStyleOverrides;
  transaction: TransactionState;
  showXdr: boolean;
  copied: boolean;
  explorerUrl: string | null;
  walletType?: WalletId | null;
  onClose: () => void;
  onSignAndSend: () => void;
  onToggleXdr: () => void;
  onCopyHash: () => void;
  onRetry?: () => void;
}

export function TransactionModalTemplate({
  theme,
  accentColor,
  styleOverrides,
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
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);

  return (
    <div className="pollar-modal-card pollar-tx-modal" data-theme={theme} style={cssVars} onClick={(e) => e.stopPropagation()}>
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
