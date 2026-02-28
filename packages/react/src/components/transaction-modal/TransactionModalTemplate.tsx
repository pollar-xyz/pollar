'use client';

import { STATE_VAR_CODES, StateTransactionCodes, TxBuildResponse } from '@pollar/core';
import React, { useState } from 'react';
import { PollarModalFooter } from '../commons';

export interface TransactionModalTemplateProps {
  theme: string;
  accentColor: string;
  stateCode: StateTransactionCodes;
  buildResult: TxBuildResponse['content'] | null;
  submitResult: { hash: string; status: string } | null;
  isLoading: boolean;
  onClose: () => void;
  onSignAndSend: () => void;
  onRetry: () => void;
}

type Phase = 'building' | 'ready' | 'error' | 'success';

function phaseFromStateCode(stateCode: StateTransactionCodes, submitResult: { hash: string; status: string } | null): Phase {
  if (
    stateCode === STATE_VAR_CODES.transaction.BUILD_TRANSACTION_ERROR ||
    stateCode === STATE_VAR_CODES.transaction.BUILD_TRANSACTION_ERROR_NO_WALLET ||
    stateCode === STATE_VAR_CODES.transaction.SIGN_TRANSACTION_ERROR ||
    stateCode === STATE_VAR_CODES.transaction.SEND_TRANSACTION_ERROR
  )
    return 'error';
  if (stateCode === STATE_VAR_CODES.transaction.SEND_TRANSACTION_SUCCESS || submitResult) return 'success';
  if (
    stateCode === STATE_VAR_CODES.transaction.BUILD_TRANSACTION_SUCCESS ||
    stateCode === STATE_VAR_CODES.transaction.SIGN_TRANSACTION_START ||
    stateCode === STATE_VAR_CODES.transaction.SIGN_TRANSACTION_SUCCESS ||
    stateCode === STATE_VAR_CODES.transaction.SEND_TRANSACTION_START
  )
    return 'ready';
  return 'building';
}

const TX_TITLES: Record<StateTransactionCodes, string> = {
  NONE: 'Preparing transaction…',
  BUILD_TRANSACTION_START: 'Building transaction…',
  BUILD_TRANSACTION_SUCCESS: 'Confirm Transaction',
  BUILD_TRANSACTION_ERROR: 'Transaction failed',
  BUILD_TRANSACTION_ERROR_NO_WALLET: 'No wallet connected',
  SIGN_TRANSACTION_START: 'Waiting for wallet…',
  SIGN_TRANSACTION_SUCCESS: 'Signed — submitting…',
  SIGN_TRANSACTION_ERROR: 'Signing failed',
  SEND_TRANSACTION_START: 'Submitting transaction…',
  SEND_TRANSACTION_SUCCESS: 'Transaction sent',
  SEND_TRANSACTION_ERROR: 'Transaction failed',
};

export function TransactionModalTemplate({
  theme,
  accentColor,
  stateCode,
  buildResult,
  submitResult,
  isLoading,
  onClose,
  onSignAndSend,
  onRetry,
}: TransactionModalTemplateProps) {
  const isDark = theme === 'dark';

  const cssVars = {
    '--pollar-accent': accentColor,
    '--pollar-buttons-border-radius': '8px',
    '--pollar-buttons-height': '44px',
    '--pollar-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': isDark ? '#ffffff' : '#111827',
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    '--pollar-input-bg': isDark ? '#374151' : 'rgba(0,0,0,0.04)',
    '--pollar-error-text': isDark ? '#f87171' : '#dc2626',
    '--pollar-success-text': isDark ? '#4ade80' : '#16a34a',
  } as React.CSSProperties;

  const [showXdr, setShowXdr] = useState(false);

  const phase = phaseFromStateCode(stateCode, submitResult);

  const title = TX_TITLES[stateCode] || '';

  return (
    <div className="pollar-tx-modal" data-theme={theme} style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-tx-header">
        <h2 className="pollar-tx-title">{title}</h2>
        <button className="pollar-tx-close" onClick={onClose} disabled={isLoading} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {buildResult && phase !== 'building' && (
        <>
          <div className="pollar-tx-summary">
            <p className="pollar-tx-summary-title">Details</p>
            <ul className="pollar-tx-summary-lines">
              {buildResult.summary.lines.map((line, i) => (
                <li key={i} className="pollar-tx-summary-line">
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="pollar-tx-meta">
            <div className="pollar-tx-meta-item">
              <span className="pollar-tx-meta-label">Network</span>
              <span className="pollar-tx-meta-value">{buildResult.summary.network}</span>
            </div>
            <div className="pollar-tx-meta-item">
              <span className="pollar-tx-meta-label">Fee</span>
              <span className="pollar-tx-meta-value">{buildResult.summary.fee}</span>
            </div>
          </div>
          <div className="pollar-tx-xdr">
            <button className="pollar-tx-xdr-toggle" onClick={() => setShowXdr((v) => !v)}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
                style={{ transform: showXdr ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
              >
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Raw transaction (XDR)
            </button>
            {showXdr && <pre className="pollar-tx-xdr-content">{buildResult.unsignedXdr}</pre>}
          </div>
        </>
      )}

      {phase === 'success' && submitResult && (
        <div className="pollar-tx-result">
          <span className="pollar-tx-result-label">Transaction hash</span>
          <span className="pollar-tx-result-hash">{submitResult.hash}</span>
        </div>
      )}

      <div className="pollar-tx-status" data-kind={phase === 'error' ? 'ERROR' : phase === 'success' ? 'SUCCESS' : 'LOADING'}>
        {isLoading && (
          <svg className="pollar-tx-spinner" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle
              cx="7"
              cy="7"
              r="5.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="22 10"
            />
          </svg>
        )}
        {phase === 'error' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="7" fill="currentColor" />
            <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
        {phase === 'success' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="7" fill="currentColor" />
            <path d="M3.5 7l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {phase === 'ready' && (
        <button className="pollar-tx-sign-btn" onClick={onSignAndSend}>
          Sign &amp; Send
        </button>
      )}
      {phase === 'error' && (
        <button className="pollar-tx-sign-btn" onClick={onRetry}>
          Retry
        </button>
      )}
      {phase === 'success' && (
        <button className="pollar-tx-sign-btn" onClick={onClose}>
          Done
        </button>
      )}

      <PollarModalFooter />
    </div>
  );
}
