'use client';

import { useInheritedLanguage } from '../../language-context';
import { PollarLanguage, TransactionState, transactionErrorMessage, WalletId, WalletType } from '@pollar/core';
import { LOGO_ALBEDO, LOGO_FREIGHTER, LOGO_POLLAR_MARK_ON_DARK, LOGO_POLLAR_MARK_ON_LIGHT } from '../../constants';
import { ModalStatusBanner } from '../commons';
import { TRANSACTION_COPY } from './transaction-copy';

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
  /** Language of the status text. Defaults to the user's device; the modals pass the resolved one. */
  language?: PollarLanguage | undefined;
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
  language: languageProp,
}: TxStatusViewProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = TRANSACTION_COPY[language];
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const hash = transaction.step === 'success' ? transaction.hash : null;
  const errorDetails =
    transaction.step === 'error' ? transactionErrorMessage(transaction.code, transaction.details, language) : null;

  const isBuilt = transaction.step === 'built';
  const isInFlight = IN_FLIGHT_STEPS.has(transaction.step);
  const isSuccess = transaction.step === 'success';
  const isError = transaction.step === 'error';
  const showDetails = buildData !== null && SHOW_DETAILS_STEPS.has(transaction.step);

  const walletImg =
    walletType === WalletType.FREIGHTER ? LOGO_FREIGHTER : walletType === WalletType.ALBEDO ? LOGO_ALBEDO : null;

  const walletAlt = walletType === WalletType.FREIGHTER ? 'Freighter' : walletType === WalletType.ALBEDO ? 'Albedo' : 'Pollar';
  const statusBanner = (
    <ModalStatusBanner
      message={copy.status[transaction.step]}
      status={isError ? 'ERROR' : isInFlight ? 'LOADING' : isSuccess ? 'SUCCESS' : 'NONE'}
    />
  );
  const showSpinner = isInFlight || isSuccess || isError;

  return (
    <>
      {showDetails && buildData && (
        <>
          <div className="pollar-tx-summary">
            <p className="pollar-tx-summary-title">{copy.details}</p>
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
              <span className="pollar-tx-meta-label">{copy.network}</span>
              <span className="pollar-tx-meta-value">{buildData.summary.network}</span>
            </div>
            <div className="pollar-tx-meta-item">
              <span className="pollar-tx-meta-label">{copy.fee}</span>
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
              {copy.rawXdr}
            </button>
            {showXdr && <pre className="pollar-tx-xdr-content">{buildData.unsignedXdr}</pre>}
          </div>
        </>
      )}

      {isError && errorDetails && (
        <div className="pollar-tx-error-details">
          <p className="pollar-tx-error-details-label">{copy.errorDetails}</p>
          <pre className="pollar-tx-error-details-content">{errorDetails}</pre>
        </div>
      )}

      {isBuilt && (
        <button className="pollar-btn-primary pollar-tx-sign-btn" onClick={onSignAndSend}>
          {copy.signAndSend}
        </button>
      )}

      {showSpinner && (
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
              {walletImg ? (
                <img src={walletImg} alt={walletAlt} className="pollar-tx-wallet-img" />
              ) : (
                <>
                  <img src={LOGO_POLLAR_MARK_ON_LIGHT} alt={walletAlt} className="pollar-tx-wallet-img pollar-logo-on-light" />
                  <img src={LOGO_POLLAR_MARK_ON_DARK} alt={walletAlt} className="pollar-tx-wallet-img pollar-logo-on-dark" />
                </>
              )}
            </div>
          </div>

          {statusBanner}

          {isInFlight && (
            <p className="pollar-tx-spinner-label">
              {walletType === WalletType.FREIGHTER
                ? copy.waitingFreighter
                : walletType === WalletType.ALBEDO
                  ? copy.waitingAlbedo
                  : copy.signingAndSending}
            </p>
          )}

          {isError && onRetry && 'buildData' in transaction && transaction.buildData && (
            <button className="pollar-btn-secondary pollar-tx-retry-btn" onClick={onRetry}>
              {copy.tryAgain}
            </button>
          )}
        </div>
      )}

      {isSuccess && hash && (
        <div className="pollar-tx-result">
          <span className="pollar-tx-result-label">{copy.txHash}</span>
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
                  {copy.copied}
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
                  {copy.copyHash}
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
                {copy.viewOnExplorer}
              </a>
            )}
          </div>
        </div>
      )}

      {isSuccess && (
        <button className="pollar-btn-primary pollar-tx-sign-btn" onClick={onDone}>
          {copy.done}
        </button>
      )}

      {!showSpinner && statusBanner}
    </>
  );
}
