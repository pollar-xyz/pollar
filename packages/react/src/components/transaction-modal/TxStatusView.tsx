'use client';

import { TransactionState, WalletId, WalletType } from '@pollar/core';
import { LOGO_ALBEDO, LOGO_FREIGHTER, LOGO_POLLAR } from '../../constants';
import { ModalStatusBanner } from '../commons';

const STATUS_MESSAGES: Record<TransactionState['step'], string> = {
  idle: '',
  building: 'Building transaction…',
  built: 'Ready to sign and send',
  signing: 'Signing transaction…',
  signed: 'Signed — ready to submit',
  submitting: 'Submitting transaction…',
  submitted: 'Submitted — waiting for confirmation…',
  'signing-submitting': 'Signing and submitting transaction…',
  'building-signing-submitting': 'Processing transaction…',
  success: 'Transaction sent successfully',
  error: 'Transaction failed',
};

/** Step values that represent in-flight work (spinner / non-cancellable UI). */
const IN_FLIGHT_STEPS = new Set<TransactionState['step']>([
  'building',
  'signing',
  'submitting',
  'submitted',
  'signing-submitting',
  'building-signing-submitting',
]);

/** Step values that should show the transaction details panel. */
const SHOW_DETAILS_STEPS = new Set<TransactionState['step']>([
  'built',
  'signing',
  'signed',
  'submitting',
  'submitted',
  'signing-submitting',
  'success',
]);

export interface TxStatusViewProps {
  transaction: TransactionState;
  showXdr: boolean;
  copied: boolean;
  explorerUrl: string | null;
  walletType?: WalletId | null | undefined;
  onSignAndSend: () => void;
  onToggleXdr: () => void;
  onCopyHash: () => void;
  onRetry?: (() => void) | undefined;
  onDone: () => void;
}

export function TxStatusView({
  transaction,
  showXdr,
  copied,
  explorerUrl,
  walletType,
  onSignAndSend,
  onToggleXdr,
  onCopyHash,
  onRetry,
  onDone,
}: TxStatusViewProps) {
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const hash = transaction.step === 'success' ? transaction.hash : null;
  const errorDetails = transaction.step === 'error' ? (transaction.details ?? null) : null;

  const isBuilt = transaction.step === 'built';
  const isInFlight = IN_FLIGHT_STEPS.has(transaction.step);
  const isSuccess = transaction.step === 'success';
  const isError = transaction.step === 'error';
  const showDetails = buildData !== null && SHOW_DETAILS_STEPS.has(transaction.step);

  const walletImg =
    walletType === WalletType.FREIGHTER ? LOGO_FREIGHTER : walletType === WalletType.ALBEDO ? LOGO_ALBEDO : LOGO_POLLAR;

  const walletAlt = walletType === WalletType.FREIGHTER ? 'Freighter' : walletType === WalletType.ALBEDO ? 'Albedo' : 'Pollar';

  return (
    <>
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

      {(isInFlight || isSuccess || isError) && (
        <div className="pollar-tx-wallet-spinner">
          <div className="pollar-tx-spinner-ring">
            <svg
              viewBox="0 0 88 88"
              width="88"
              height="88"
              className={`pollar-tx-spinner-svg${isInFlight ? ' pollar-tx-spinner-rotating' : ''}`}
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
                strokeDasharray={isInFlight ? '169.6 56.6' : '999 0'}
                transform="rotate(-90 44 44)"
                style={{ transition: isInFlight ? 'none' : 'stroke 400ms, stroke-dasharray 400ms' }}
              />
            </svg>
            <div className="pollar-tx-wallet-icon">
              <img src={walletImg} alt={walletAlt} className="pollar-tx-wallet-img" />
            </div>
          </div>

          {isInFlight && (
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
        <button className="pollar-btn-primary pollar-tx-sign-btn" onClick={onDone}>
          Done
        </button>
      )}

      <ModalStatusBanner
        message={STATUS_MESSAGES[transaction.step]}
        status={isError ? 'ERROR' : isInFlight ? 'LOADING' : isSuccess ? 'SUCCESS' : 'NONE'}
      />
    </>
  );
}
