'use client';

import { useInheritedLanguage } from '../../language-context';
import { PollarLanguage, TransactionState, transactionErrorMessage, WalletId, WalletType } from '@pollar/core';
import { LOGO_ALBEDO, LOGO_FREIGHTER, LOGO_POLLAR_MARK_ON_DARK, LOGO_POLLAR_MARK_ON_LIGHT } from '../../constants';
import { ModalStatusBanner } from '../commons';
import { TxReview } from '../tx-review/TxReview';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { reviewFromBuild, type TxReviewData } from '../tx-review/tx-review-model';
import { TRANSACTION_COPY } from './transaction-copy';

/** Step values that represent in-flight work (spinner / non-cancellable UI). */
const IN_FLIGHT_STEPS = new Set<TransactionState['step']>([
  'building',
  'signing',
  'submitting',
  'submitted',
  'signing-submitting',
  'building-signing-submitting',
  'awaiting_cosign',
]);

/** Step values that should show the transaction details panel. */
const SHOW_DETAILS_STEPS = new Set<TransactionState['step']>([
  'built',
  'signing',
  'signed',
  'submitting',
  'submitted',
  'signing-submitting',
  'awaiting_cosign',
  'success',
]);

export interface TxStatusViewProps {
  transaction: TransactionState;
  /** Whether the details (addresses, network, fee, raw transaction, hash) are unfolded. */
  showXdr: boolean;
  /** Unused: the hash copies from the details. */
  copied: boolean;
  explorerUrl: string | null;
  walletType?: WalletId | null | undefined;
  onSignAndSend: () => void;
  /** Folds and unfolds the details. */
  onToggleXdr: () => void;
  /** Unused: the hash copies from the details. */
  onCopyHash: () => void;
  onRetry?: (() => void) | undefined;
  onDone: () => void;
  /** Language of the status text. Defaults to the user's device; the modals pass the resolved one. */
  language?: PollarLanguage | undefined;
}

export function TxStatusView({
  transaction,
  showXdr,
  explorerUrl,
  walletType,
  onSignAndSend,
  onToggleXdr,
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
  const showDetails = SHOW_DETAILS_STEPS.has(transaction.step);
  const reviewCopy = TX_REVIEW_COPY[language];
  const hashInfo = hash ? { value: hash, explorerUrl } : undefined;
  // A compound flow can finish without the build it ran: the hash still has a place in the details.
  const review: TxReviewData | null = buildData
    ? reviewFromBuild(buildData, reviewCopy, copy.title, hashInfo)
    : hashInfo
      ? { title: copy.title, kind: 'other', rows: [], hash: hashInfo }
      : null;

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
  const reviewBlock = showDetails && review && (
    <div className="pollar-tx-review">
      {buildData && <p className="pollar-tx-review-title">{review.title}</p>}
      <TxReview data={review} open={showXdr} onToggle={onToggleXdr} language={language} />
    </div>
  );

  return (
    <>
      {!isSuccess && reviewBlock}

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

          {isInFlight && transaction.step !== 'awaiting_cosign' && (
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

      {isSuccess && reviewBlock}

      {isSuccess && (
        <button className="pollar-btn-primary pollar-tx-sign-btn" onClick={onDone}>
          {copy.done}
        </button>
      )}

      {!showSpinner && statusBanner}
    </>
  );
}
