'use client';

import type { PendingConfirmation, PollarLanguage, StellarNetwork } from '@pollar/core';
import { TxReview } from '../tx-review/TxReview';
import { CONFIRM_COPY } from './confirm-copy';
import { confirmationReview } from './confirmation-review';

/**
 * A signature's yes asked inside the modal that started it: the review of what
 * is signed, Confirm under it, and the reason and the way out in its details.
 */
export function InlineConfirm({
  confirmation,
  language,
  network,
}: {
  confirmation: PendingConfirmation;
  language: PollarLanguage;
  network?: StellarNetwork | undefined;
}) {
  const copy = CONFIRM_COPY[language];
  const review = confirmationReview(confirmation, language, network);
  return (
    <div className="pollar-inline-confirm">
      <p className="pollar-inline-confirm-title">{review.title}</p>
      <TxReview
        key={confirmation.id}
        data={review}
        language={language}
        detailsIntro={{ title: copy.whyTitle, body: copy.whyBody }}
        detailsAction={{ label: copy.cancelAction, onClick: confirmation.reject }}
      />
      <button type="button" className="pollar-btn-primary pollar-tx-sign-btn" onClick={confirmation.confirm}>
        {review.kind === 'activate_wallet' ? copy.activateWallet : copy.confirm}
      </button>
    </div>
  );
}
