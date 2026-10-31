'use client';

import type { PendingConfirmation } from '@pollar/core';
import { useEffect, useRef } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { CONFIRM_COPY } from './confirm-copy';

type Copy = (typeof CONFIRM_COPY)['en'];
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, modalChrome } from '../modal-theme';
import { TxReview } from '../tx-review/TxReview';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { reviewFromBuild, reviewFromRequest } from '../tx-review/tx-review-model';
import '../shared.css';
import '../cosign-modal/CosignModal.css';

interface ConfirmModalProps {
  confirmation: PendingConfirmation;
}

function labelOf(confirmation: PendingConfirmation, copy: Copy): string {
  const op = confirmation.operation ?? '';
  return copy.operations[op] ?? (op ? op.replace(/_/g, ' ') : copy.transaction);
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The prompt a signing call waits on under `confirmation: 'prompt'`, the same
 * for every custody: the wallet signs only after the user confirms here.
 * Closing it declines. The provider shows it while the client has a
 * confirmation pending, so it needs no open state of its own.
 */
export function ConfirmModal({ confirmation }: ConfirmModalProps) {
  const { getClient, styles, network } = usePollar();
  const language = useModalLanguage();
  const copy = CONFIRM_COPY[language];
  const reviewCopy = TX_REVIEW_COPY[language];
  const raw = confirmation.unsignedXdr ?? confirmation.authEntryXdr;
  const review = confirmation.buildData
    ? reviewFromBuild(confirmation.buildData, reviewCopy, labelOf(confirmation, copy))
    : reviewFromRequest(
        {
          chain: confirmation.network,
          network,
          operation: confirmation.operation,
          details: confirmation.details,
          raw,
          fallbackTitle: labelOf(confirmation, copy),
        },
        reviewCopy,
      );
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);

  // A session that ends while the prompt is open declines it: the call must
  // not stay suspended on a user who is no longer there.
  const rejectRef = useRef(confirmation.reject);
  rejectRef.current = confirmation.reject;
  useEffect(() => {
    return getClient().onAuthStateChange((authState) => {
      if (authState.step === 'idle') rejectRef.current();
    });
  }, [getClient]);

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={confirmation.reject}>
      <div
        className="pollar-modal-card pollar-cosign-modal"
        data-theme={theme}
        style={cssVars}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pollar-modal-header">
          <h2 className="pollar-modal-title">{copy.title}</h2>
          <div className="pollar-modal-header-actions">
            <button
              type="button"
              className="pollar-modal-close"
              onClick={confirmation.reject}
              aria-label={copy.close}
              title={copy.close}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="pollar-cosign-detail">
          <p className="pollar-cosign-detail-title">{review.title}</p>
          <p className="pollar-cosign-muted">{copy.intro}</p>
          <TxReview data={review} language={language} />

          <div className="pollar-cosign-actions">
            <button type="button" className="pollar-cosign-btn pollar-cosign-btn-secondary" onClick={confirmation.reject}>
              {copy.cancel}
            </button>
            <button type="button" className="pollar-cosign-btn pollar-cosign-btn-primary" onClick={confirmation.confirm}>
              {copy.confirm}
            </button>
          </div>
        </div>

        <PollarModalFooter />
      </div>
    </div>
  );
}
