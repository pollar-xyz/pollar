'use client';

import { TransactionState, WalletType } from '@pollar/core';
import React from 'react';
import { LOGO_ALBEDO, LOGO_FREIGHTER, LOGO_POLLAR } from '../../constants';
import { ModalStatusBanner, PollarModalFooter } from '../commons';

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

const STATUS_MESSAGES: Record<TransactionState['step'], string> = {
  idle: '',
  building: 'Building transaction…',
  built: 'Ready to sign and send',
  signing: 'Signing and sending transaction…',
  success: 'Transaction sent successfully',
  error: 'Transaction failed',
};

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

  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const hash = transaction.step === 'success' ? transaction.hash : null;
  const errorDetails = transaction.step === 'error' ? (transaction.details ?? null) : null;

  const isBuilt = transaction.step === 'built';
  const isSigning = transaction.step === 'signing';
  const isSuccess = transaction.step === 'success';
  const isError = transaction.step === 'error';
  const showDetails = buildData !== null && (isBuilt || isSigning || isSuccess);

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
            <button className="pollar-tx-xdr-toggle" onClick={onToggleXdr}>
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

      {isError && errorDetails && (
        <div className="pollar-tx-error-details">
          <p className="pollar-tx-error-details-label">Error details</p>
          <pre className="pollar-tx-error-details-content">{errorDetails}</pre>
        </div>
      )}

      {isBuilt && (
        <button className="pollar-btn-primary pollar-tx-sign-btn" onClick={onSignAndSend}>
          Sign &amp; Send
        </button>
      )}

      {(isSigning || isSuccess || isError) && (
        <div className="pollar-tx-wallet-spinner">
          <div className="pollar-tx-spinner-ring">
            <svg
              viewBox="0 0 88 88"
              width="88"
              height="88"
              className={`pollar-tx-spinner-svg${isSigning ? ' pollar-tx-spinner-rotating' : ''}`}
              aria-hidden
            >
              <circle cx="44" cy="44" r="36" fill="none" stroke="var(--pollar-border)" strokeWidth="3" />
              <circle
                cx="44"
                cy="44"
                r="36"
                fill="none"
                stroke={
                  isSuccess ? 'var(--pollar-success-text)' : isError ? 'var(--pollar-error-text)' : 'var(--pollar-accent)'
                }
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={isSigning ? '169.6 56.6' : '999 0'}
                transform="rotate(-90 44 44)"
                style={{ transition: isSigning ? 'none' : 'stroke 400ms, stroke-dasharray 400ms' }}
              />
            </svg>
            <div className="pollar-tx-wallet-icon">
              <img
                src={
                  walletType === WalletType.FREIGHTER
                    ? LOGO_FREIGHTER
                    : walletType === WalletType.ALBEDO
                      ? LOGO_ALBEDO
                      : LOGO_POLLAR
                }
                alt={walletType === WalletType.FREIGHTER ? 'Freighter' : walletType === WalletType.ALBEDO ? 'Albedo' : 'Pollar'}
                className="pollar-tx-wallet-img"
              />
            </div>
          </div>

          {isSigning && (
            <p className="pollar-tx-spinner-label">
              {walletType === WalletType.FREIGHTER
                ? 'Waiting for Freighter…'
                : walletType === WalletType.ALBEDO
                  ? 'Waiting for Albedo…'
                  : 'Signing and sending…'}
            </p>
          )}

          {isError && onRetry && 'buildData' in transaction && transaction.buildData && (
            <button className="pollar-btn-secondary pollar-tx-retry-btn" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}

      {isSuccess && hash && (
        <div className="pollar-tx-result">
          <span className="pollar-tx-result-label">Transaction hash</span>
          <span className="pollar-tx-result-hash">{hash}</span>
          <div className="pollar-tx-result-actions">
            <button className="pollar-tx-result-btn" onClick={onCopyHash}>
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

      {isSuccess && (
        <button className="pollar-btn-primary pollar-tx-sign-btn" onClick={onClose}>
          Done
        </button>
      )}

      <ModalStatusBanner
        message={STATUS_MESSAGES[transaction.step]}
        status={isError ? 'ERROR' : isSigning || transaction.step === 'building' ? 'LOADING' : isSuccess ? 'SUCCESS' : 'NONE'}
      />

      <PollarModalFooter />
    </div>
  );
}
