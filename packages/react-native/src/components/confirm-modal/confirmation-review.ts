import type { PendingConfirmation, PollarLanguage, StellarNetwork } from '@pollar/core';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { reviewFromBuild, reviewFromRequest, type TxReviewData } from '../tx-review/tx-review-model';
import { CONFIRM_COPY } from './confirm-copy';

type Copy = (typeof CONFIRM_COPY)['en'];

function labelOf(confirmation: PendingConfirmation, copy: Copy): string {
  const op = confirmation.operation ?? '';
  return copy.operations[op] ?? (op ? op.replace(/_/g, ' ') : copy.transaction);
}

/** The review of what a confirmation asks to sign, wherever it is answered. */
export function confirmationReview(
  confirmation: PendingConfirmation,
  language: PollarLanguage,
  network?: StellarNetwork | undefined,
): TxReviewData {
  const copy = CONFIRM_COPY[language];
  const reviewCopy = TX_REVIEW_COPY[language];
  return confirmation.buildData
    ? reviewFromBuild(confirmation.buildData, reviewCopy, labelOf(confirmation, copy))
    : reviewFromRequest(
        {
          chain: confirmation.network,
          network,
          operation: confirmation.operation,
          details: confirmation.details,
          raw: confirmation.unsignedXdr ?? confirmation.authEntryXdr,
          fallbackTitle: labelOf(confirmation, copy),
        },
        reviewCopy,
      );
}
