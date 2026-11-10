'use client';

import { useInheritedLanguage } from '../../language-context';
import {
  type PendingConfirmation,
  PollarLanguage,
  type StellarNetwork,
  TransactionState,
  transactionErrorMessage,
  WalletId,
  WalletType,
} from '@pollar/core';
import type { ReactNode } from 'react';
import { CONFIRM_COPY } from '../confirm-modal/confirm-copy';
import { confirmationReview } from '../confirm-modal/confirmation-review';
import { OutcomeIcon, TitleMark } from '../signing-marks';
import { TxReview } from '../tx-review/TxReview';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { headlineAsset, reviewFromBuild, type TxDetailRow, type TxReviewData } from '../tx-review/tx-review-model';
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
  /**
   * The operation as the modal knows it (an Earn deposit names its opportunity),
   * drawn instead of the build's summary. The hash and who paid the fee still
   * come from the transaction.
   */
  review?: TxReviewData | null | undefined;
  /** What the success says instead of the generic "sent" line. */
  successMessage?: string | undefined;
  /** Shown under the review once the transaction succeeds, above Done. */
  successExtra?: ReactNode;
  /** The signature waiting for the user's yes, answered here instead of in a prompt over the modal. */
  confirmation?: PendingConfirmation | null | undefined;
  /** The app's network, for the details of a confirmation. */
  network?: StellarNetwork | undefined;
  /** Rows the modal adds to the details (where a cross-chain swap delivers). */
  extraRows?: TxDetailRow[] | undefined;
  /** A second line for the outcome strip, and whether it reports a failure (a cross-chain leg). */
  outcomeNote?: { text: string; failed?: boolean } | undefined;
}

const SPINNER = <span className="pollar-spinner pollar-spinner-sm" aria-hidden />;

/**
 * The review a transaction step draws: the confirmation waiting for a yes,
 * else the modal's own review, else the build's. Modals read it for their
 * title, so the header names the action the body shows.
 */
export function txStatusReview({
  transaction,
  review: reviewProp,
  explorerUrl,
  confirmation,
  network,
  extraRows,
  language,
}: Pick<TxStatusViewProps, 'transaction' | 'review' | 'explorerUrl' | 'confirmation' | 'network' | 'extraRows'> & {
  language: PollarLanguage;
}): TxReviewData | null {
  const copy = TRANSACTION_COPY[language];
  const reviewCopy = TX_REVIEW_COPY[language];
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const hash = transaction.step === 'success' ? transaction.hash : null;
  const hashInfo = hash ? { value: hash, explorerUrl } : undefined;
  const sponsored = 'sponsored' in transaction ? transaction.sponsored : undefined;
  // A compound flow can finish without the build it ran: the hash still has a place in the details.
  const review: TxReviewData | null = reviewProp
    ? {
        ...reviewProp,
        ...(hashInfo && { hash: hashInfo }),
        ...(sponsored !== undefined && { fee: { sponsored } }),
      }
    : buildData
      ? reviewFromBuild(buildData, reviewCopy, copy.title, hashInfo, sponsored)
      : confirmation
        ? confirmationReview(confirmation, language, network)
        : hashInfo
          ? {
              title: copy.title,
              kind: 'other',
              rows: [],
              hash: hashInfo,
              ...(sponsored !== undefined && { fee: { sponsored } }),
            }
          : null;
  return review && extraRows?.length ? { ...review, rows: [...review.rows, ...extraRows] } : review;
}

/** The title of a transaction step with its logo: the asset it moves on its chain, or the chain alone. */
export function TxStatusHeading({ review, fallback }: { review: TxReviewData | null; fallback: string }) {
  const chain = review?.from?.chain ?? review?.to?.chain;
  return (
    <h2 className="pollar-modal-title pollar-cosign-heading">
      {review && <TitleMark chain={chain} asset={headlineAsset(review)} />}
      <span>{review?.title ?? fallback}</span>
    </h2>
  );
}

/**
 * A transaction from the user's yes to its outcome in one view: the review stays,
 * and a strip under it says where the transaction stands. The hash and every
 * address live in the details.
 */
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
  review: reviewProp,
  successMessage,
  successExtra,
  confirmation,
  network,
  extraRows,
  outcomeNote,
}: TxStatusViewProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = TRANSACTION_COPY[language];
  const confirmCopy = CONFIRM_COPY[language];
  const errorDetails =
    transaction.step === 'error' ? transactionErrorMessage(transaction.code, transaction.details, language) : null;
  const isBuilt = transaction.step === 'built';
  const isInFlight = IN_FLIGHT_STEPS.has(transaction.step);
  const isSuccess = transaction.step === 'success';
  const isError = transaction.step === 'error';
  const asking = !!confirmation && !isSuccess && !isError;
  const review = txStatusReview({
    transaction,
    review: reviewProp,
    explorerUrl,
    confirmation,
    network,
    extraRows,
    language,
  });
  const waitingOn =
    walletType === WalletType.FREIGHTER ? copy.waitingFreighter : walletType === WalletType.ALBEDO ? copy.waitingAlbedo : null;
  const failed = isError || outcomeNote?.failed === true;

  return (
    <div className="pollar-tx-status-view">
      {review && (
        <div className="pollar-tx-review">
          <TxReview
            data={review}
            open={showXdr}
            onToggle={onToggleXdr}
            language={language}
            {...(asking
              ? {
                  detailsIntro: { title: confirmCopy.whyTitle, body: confirmCopy.whyBody },
                  detailsAction: { label: confirmCopy.cancelAction, onClick: confirmation!.reject },
                }
              : {})}
          />
        </div>
      )}

      {asking ? (
        <button className="pollar-btn-primary pollar-tx-sign-btn" onClick={confirmation!.confirm}>
          {review?.kind === 'activate_wallet' ? confirmCopy.activateWallet : confirmCopy.confirm}
        </button>
      ) : isBuilt ? (
        <button className="pollar-btn-primary pollar-tx-sign-btn" onClick={onSignAndSend}>
          {copy.signAndSend}
        </button>
      ) : (
        (isInFlight || isSuccess || isError) && (
          <div className={`pollar-outcome${failed ? ' pollar-outcome-bad' : ''}${isInFlight ? ' pollar-outcome-busy' : ''}`}>
            <p className="pollar-outcome-main">
              {isInFlight ? SPINNER : <OutcomeIcon ok={!failed} />}
              {isSuccess && successMessage ? successMessage : copy.status[transaction.step]}
            </p>
            {isInFlight && waitingOn && transaction.step !== 'awaiting_cosign' && (
              <p className="pollar-outcome-note">{waitingOn}</p>
            )}
            {isError && errorDetails && <p className="pollar-outcome-note">{errorDetails}</p>}
            {outcomeNote && (
              <p className="pollar-outcome-note">
                {!outcomeNote.failed && !isError && SPINNER}
                {outcomeNote.text}
              </p>
            )}
          </div>
        )
      )}

      {isError && onRetry && 'buildData' in transaction && transaction.buildData && (
        <button className="pollar-btn-secondary pollar-tx-retry-btn" onClick={onRetry}>
          {copy.tryAgain}
        </button>
      )}

      {isSuccess && successExtra}

      {isSuccess && (
        <button className="pollar-btn-primary pollar-tx-sign-btn" onClick={onDone}>
          {copy.done}
        </button>
      )}
    </div>
  );
}
