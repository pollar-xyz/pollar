'use client';

import { useInheritedLanguage } from '../../language-context';
import { PollarLanguage, TransactionState, WalletId } from '@pollar/core';
import React from 'react';
import { PollarModalFooter } from '../commons';
import { TRANSACTION_COPY } from './transaction-copy';
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
  /** Language of the modal. Defaults to the user's device; the modal passes the resolved one. */
  language?: PollarLanguage | undefined;
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
  language: languageProp,
}: TransactionModalTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);
  const copy = TRANSACTION_COPY[language];

  return (
    <div className="pollar-modal-card pollar-tx-modal" data-theme={theme} style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">{copy.title}</h2>
      </div>
      <button type="button" className="pollar-close-btn" onClick={onClose} aria-label={copy.close}>
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
        language={language}
      />

      <PollarModalFooter />
    </div>
  );
}
