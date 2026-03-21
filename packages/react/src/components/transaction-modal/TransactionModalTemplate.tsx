'use client';

import { StateStatus, StateTransactionCodes, TxBuildResponse } from '@pollar/core';
import React, { useState } from 'react';
import { ModalStatusBanner, PollarModalFooter, TRANSACTION_CODE_MESSAGES } from '../commons';

export interface TransactionModalTemplateProps {
  theme: string;
  accentColor: string;
  transactionStateCode: StateTransactionCodes;
  status: StateStatus;
  buildResult: TxBuildResponse['content'] | null;
  submitResult: { hash: string; status: string } | null;
  onClose: () => void;
  onSignAndSend: () => void;
  onRetrySignAndSend: () => void;
}

export function TransactionModalTemplate({
  theme,
  accentColor,
  transactionStateCode,
  status,
  buildResult,
  submitResult,
  onClose,
  onSignAndSend,
  onRetrySignAndSend,
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
  const [copied, setCopied] = useState(false);

  function handleCopyHash() {
    if (!submitResult) return;
    navigator.clipboard.writeText(submitResult.hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const explorerNetwork = buildResult?.summary.network?.toLowerCase().includes('testnet') ? 'testnet' : 'public';
  const explorerUrl = submitResult ? `https://stellar.expert/explorer/${explorerNetwork}/tx/${submitResult.hash}` : null;

  const isError = transactionStateCode.includes('ERROR');
  const isSuccess = transactionStateCode.includes('SUCCESS');
  const isBuilt = buildResult && transactionStateCode === 'BUILD_TRANSACTION_SUCCESS';
  const isDone = submitResult && transactionStateCode === 'SIGN_SEND_TRANSACTION_START';

  return (
    <div className="pollar-tx-modal" data-theme={theme} style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-tx-header">
        <h2 className="pollar-tx-title">Transaction</h2>
        <button className="pollar-tx-close" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {isBuilt && (
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

      {submitResult && transactionStateCode === 'SIGN_SEND_TRANSACTION_SUCCESS' && (
        <div className="pollar-tx-result">
          <span className="pollar-tx-result-label">Transaction hash</span>
          <span className="pollar-tx-result-hash">{submitResult.hash}</span>
          <div className="pollar-tx-result-actions">
            <button className="pollar-tx-result-btn" onClick={handleCopyHash}>
              {copied ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <circle cx="7" cy="7" r="7" fill="currentColor" />
                    <path
                      d="M3.5 7l2.5 2.5 4.5-5"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <path
                      d="M3 9H2a1 1 0 01-1-1V2a1 1 0 011-1h6a1 1 0 011 1v1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  Copy hash
                </>
              )}
            </button>
            {explorerUrl && (
              <a className="pollar-tx-result-btn" href={explorerUrl} target="_blank" rel="noopener noreferrer">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                  <path
                    d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 1h4m0 0v4m0-4L6 7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                View on Explorer
              </a>
            )}
          </div>
        </div>
      )}

      {isBuilt && (
        <button className="pollar-tx-sign-btn" onClick={onSignAndSend}>
          Sign &amp; Send
        </button>
      )}
      {/*{isError && (*/}
      {/*  <button className="pollar-tx-sign-btn" onClick={onRetry}>*/}
      {/*    Retry*/}
      {/*  </button>*/}
      {/*)}*/}
      {isDone && (
        <button className="pollar-tx-sign-btn" onClick={onClose}>
          Done
        </button>
      )}

      <ModalStatusBanner
        message={TRANSACTION_CODE_MESSAGES[transactionStateCode] ?? ''}
        status={status}
      />

      <PollarModalFooter />
    </div>
  );
}
