'use client';

import type { PendingConfirmation } from '@pollar/core';
import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { CONFIRM_COPY } from './confirm-copy';

import { PollarModalFooter } from '../commons';
import { buildModalCssVars, modalChrome } from '../modal-theme';
import { TxReview } from '../tx-review/TxReview';
import { headlineAsset } from '../tx-review/tx-review-model';
import '../shared.css';
import '../cosign-modal/CosignModal.css';
import { TitleMark } from '../signing-marks';
import { confirmationReview } from './confirmation-review';
import { PollarOverlay } from '../PollarOverlay';

interface ConfirmModalProps {
  confirmation: PendingConfirmation;
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
 * Closing it declines, so the X asks first and a click outside does nothing.
 * The provider shows it while the client has a confirmation pending, so it
 * needs no open state of its own.
 */
export function ConfirmModal({ confirmation }: ConfirmModalProps) {
  const { getClient, styles, network } = usePollar();
  const language = useModalLanguage();
  const copy = CONFIRM_COPY[language];
  const review = confirmationReview(confirmation, language, network);
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

  const [confirmingClose, setConfirmingClose] = useState(false);

  return (
    <PollarOverlay style={overlayStyle}>
      <div
        className="pollar-modal-card pollar-cosign-modal"
        data-theme={theme}
        style={cssVars}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pollar-modal-header">
          <h2 className="pollar-modal-title pollar-cosign-heading">
            {!confirmingClose && <TitleMark chain={confirmation.network} asset={headlineAsset(review)} />}
            <span>{confirmingClose ? copy.closeTitle : review.title}</span>
          </h2>
          {!confirmingClose && (
            <div className="pollar-modal-header-actions">
              <button
                type="button"
                className="pollar-modal-close"
                onClick={() => setConfirmingClose(true)}
                aria-label={copy.close}
                title={copy.close}
              >
                <CloseIcon />
              </button>
            </div>
          )}
        </div>

        {confirmingClose ? (
          <div className="pollar-cosign-leave">
            <p className="pollar-cosign-muted">{copy.closeBody}</p>
            <button
              type="button"
              className="pollar-cosign-btn pollar-cosign-btn-primary"
              onClick={() => setConfirmingClose(false)}
            >
              {copy.backToSign}
            </button>
            <button type="button" className="pollar-cosign-text-btn" onClick={confirmation.reject}>
              {copy.closeAndCancel}
            </button>
          </div>
        ) : (
          <div className="pollar-cosign-detail">
            <TxReview
              data={review}
              language={language}
              detailsIntro={{ title: copy.whyTitle, body: copy.whyBody }}
              detailsAction={{ label: copy.cancelAction, onClick: confirmation.reject }}
            />
            <button type="button" className="pollar-cosign-btn pollar-cosign-btn-primary" onClick={confirmation.confirm}>
              {review.kind === 'activate_wallet' ? copy.activateWallet : copy.confirm}
            </button>
          </div>
        )}

        <PollarModalFooter />
      </div>
    </PollarOverlay>
  );
}
