'use client';

import { TransactionState } from '@pollar/core';
import React, { useState } from 'react';
import { ModalStatusBanner, PollarModalFooter } from '../commons';

export interface TransactionModalTemplateProps {
  theme: string;
  accentColor: string;
  transaction: TransactionState;
  onClose: () => void;
  onSignAndSend: () => void;
}

export function TransactionModalTemplate({
  theme,
  accentColor,
  transaction,
  onClose,
  onSignAndSend,
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

  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const hash = transaction.step === 'success' ? transaction.hash : null;
  const errorDetails = transaction.step === 'error' ? (transaction.details ?? null) : null;

  const isBuilt = transaction.step === 'built';
  const isSigning = transaction.step === 'signing';
  const isSuccess = transaction.step === 'success';
  const isError = transaction.step === 'error';
  const showDetails = buildData !== null && (isBuilt || isSigning || isSuccess);

  const explorerNetwork = buildData?.summary.network?.toLowerCase().includes('testnet') ? 'testnet' : 'public';
  const explorerUrl = hash ? `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}` : null;

  function handleCopyHash() {
    if (!hash) return;
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const statusMessage: Record<TransactionState['step'], string> = {
    idle: '',
    building: 'Building transaction…',
    built: 'Ready to sign and send',
    signing: 'Signing and sending transaction…',
    success: 'Transaction sent successfully',
    error: 'Transaction failed',
  };

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

      {showDetails && buildData && (
        <>
          <div className="pollar-tx-summary">
            <p className="pollar-tx-summary-title">Details</p>
            <ul className="pollar-tx-summary-lines">
              {buildData.summary.lines.map((line, i) => (
                <li key={i} className="pollar-tx-summary-line">
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="pollar-tx-meta">
            <div className="pollar-tx-meta-item">
              <span className="pollar-tx-meta-label">Network</span>
              <span className="pollar-tx-meta-value">{buildData.summary.network}</span>
            </div>
            <div className="pollar-tx-meta-item">
              <span className="pollar-tx-meta-label">Fee</span>
              <span className="pollar-tx-meta-value">{buildData.summary.fee}</span>
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
            {showXdr && <pre className="pollar-tx-xdr-content">{buildData.unsignedXdr}</pre>}
          </div>
        </>
      )}

      {isSuccess && hash && (
        <div className="pollar-tx-result">
          <span className="pollar-tx-result-label">Transaction hash</span>
          <span className="pollar-tx-result-hash">{hash}</span>
          <div className="pollar-tx-result-actions">
            <button className="pollar-tx-result-btn" onClick={handleCopyHash}>
              {copied ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <circle cx="7" cy="7" r="7" fill="currentColor" />
                    <path d="M3.5 7l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 9H2a1 1 0 01-1-1V2a1 1 0 011-1h6a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Copy hash
                </>
              )}
            </button>
            {explorerUrl && (
              <a className="pollar-tx-result-btn" href={explorerUrl} target="_blank" rel="noopener noreferrer">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                  <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M8 1h4m0 0v4m0-4L6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                View on Explorer
              </a>
            )}
          </div>
        </div>
      )}

      {isError && errorDetails && (
        <div className="pollar-tx-error-details">
          <p className="pollar-tx-error-details-label">Error details</p>
          <pre className="pollar-tx-error-details-content">{errorDetails}</pre>
        </div>
      )}

      {isBuilt && (
        <button className="pollar-tx-sign-btn" onClick={onSignAndSend}>
          Sign &amp; Send
        </button>
      )}
      {isSigning && (
        <button className="pollar-tx-sign-btn" disabled>
          Signing &amp; sending…
        </button>
      )}
      {isSuccess && (
        <button className="pollar-tx-sign-btn" onClick={onClose}>
          Done
        </button>
      )}

      <ModalStatusBanner message={statusMessage[transaction.step]} status={isError ? 'ERROR' : isSigning || transaction.step === 'building' ? 'LOADING' : isSuccess ? 'SUCCESS' : 'NONE'} />

      <PollarModalFooter />
    </div>
  );
}