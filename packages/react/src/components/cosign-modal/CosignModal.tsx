'use client';

import { type CosignRequest, type CosignVerification, isPollarApiError, transactionErrorMessage } from '@pollar/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { explorerTxUrl } from '../commons';
import { useCosign } from '../../useCosign';
import '../shared.css';
import './CosignModal.css';
import { CosignModalTemplate } from './CosignModalTemplate';
import { modalChrome } from '../modal-theme';

/** How long an outcome that needs nothing from the user stays up before the modal closes. */
const CLOSE_AFTER_SECONDS = 3;
/** A sent transaction stays up longer, so its hash can be read, copied or opened. */
const CLOSE_AFTER_SENT_SECONDS = 5;
/** How often the prompt looks for the next request while a flow says one is coming. */
const NEXT_REQUEST_EVERY_MS = 2_000;

interface CosignModalProps {
  /** The approval a flow asks for next (`setCosignNextStep`); the prompt waits for it instead of closing. */
  nextStep?: string | null;
  onClose: () => void;
}

/**
 * The approval prompt of a Turnkey co-signed wallet. Verifies each request
 * against Turnkey before enabling Approve, so the user only ever confirms a
 * transaction the device checked itself.
 */
export function CosignModal({ nextStep = null, onClose }: CosignModalProps) {
  const { getClient, styles, network } = usePollar();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const { pending, lastResolved, loaded, refresh, approve, reject, verify, inspectQuorum } = useCosign();
  const language = useModalLanguage();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verification, setVerification] = useState<CosignVerification | null>(null);
  const [busy, setBusy] = useState<'approving' | 'rejecting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The request whose approval just failed. Approving it again cannot succeed
  // until something changes (a balance, a fresh request), so Approve stays off.
  const [approveFailedFor, setApproveFailedFor] = useState<string | null>(null);
  // The quorum as this device read it from Turnkey, once per open. Approving
  // anything on a sub-organization that is not the promised 2-of-2 would be a
  // vote on a wallet someone else can also control, so a bad reading fails
  // every verification below.
  const [quorumFailure, setQuorumFailure] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    inspectQuorum()
      .then((q) => {
        if (!cancelled && !q.ok) setQuorumFailure(q.reason);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [inspectQuorum]);

  const current = pending.find((r) => r.id === selectedId) ?? pending[0] ?? null;

  // Verify whenever the shown request changes; a stale result must never
  // enable Approve for a different request. Keyed by id: every refresh of the
  // pending list hands back new objects for the same requests, and re-running
  // on those would cancel the check in flight.
  const currentRef = useRef(current);
  currentRef.current = current;
  const currentId = current?.id ?? null;
  useEffect(() => {
    const request = currentRef.current;
    if (!request) return;
    setVerification(null);
    setError(null);
    setApproveFailedFor(null);
    let cancelled = false;
    verify(request)
      .then((v) => {
        if (!cancelled) setVerification(v);
      })
      .catch((err: unknown) => {
        if (!cancelled) setVerification({ ok: false, reason: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [currentId, verify]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    return getClient().onAuthStateChange((authState) => {
      if (authState.step === 'idle') onCloseRef.current();
    });
  }, [getClient]);

  // Nothing left to vote on and nothing to read (no transaction, no signature), or a sent transaction:
  // count down and close. A signed XDR the app still has to send stays up until closed.
  const silent =
    pending.length === 0 &&
    (lastResolved ? lastResolved.status === 'APPROVED' && !lastResolved.submit?.hash && !lastResolved.signedXdr : loaded);
  const sent = pending.length === 0 && lastResolved?.status === 'APPROVED' && !!lastResolved.submit?.hash;
  // A flow with another approval coming keeps the prompt up and shows that request when it arrives.
  const awaitingNext = sent && !!nextStep;
  const closeAfter = awaitingNext ? null : sent ? CLOSE_AFTER_SENT_SECONDS : silent ? CLOSE_AFTER_SECONDS : null;
  useEffect(() => {
    if (!awaitingNext) return;
    const timer = setInterval(() => void refresh().catch(() => undefined), NEXT_REQUEST_EVERY_MS);
    return () => clearInterval(timer);
  }, [awaitingNext, refresh]);
  const [closesIn, setClosesIn] = useState<number | null>(null);
  useEffect(() => {
    if (closeAfter === null) {
      setClosesIn(null);
      return;
    }
    let left = closeAfter;
    setClosesIn(left);
    const timer = setInterval(() => {
      left -= 1;
      if (left > 0) setClosesIn(left);
      else {
        clearInterval(timer);
        onCloseRef.current();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [closeAfter, lastResolved?.id]);

  const run = useCallback(
    async (kind: 'approving' | 'rejecting', request: CosignRequest, action: (r: CosignRequest) => Promise<CosignRequest>) => {
      setBusy(kind);
      setError(null);
      try {
        await action(request);
      } catch (err) {
        setError(
          transactionErrorMessage(isPollarApiError(err) ? err.code : null, err instanceof Error ? err.message : null, language),
        );
        if (kind === 'approving') setApproveFailedFor(request.id);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={onClose}>
      <CosignModalTemplate
        theme={theme}
        accentColor={accentColor}
        styleOverrides={styleOverrides}
        pending={pending}
        current={current}
        verification={current ? (quorumFailure ? { ok: false, reason: quorumFailure } : verification) : null}
        busy={busy}
        error={error}
        approveBlocked={!!current && approveFailedFor === current.id}
        {...(lastResolved ? { lastResolved } : {})}
        closesIn={closesIn}
        nextStep={awaitingNext ? nextStep : null}
        language={language}
        explorerUrl={lastResolved?.submit?.hash ? explorerTxUrl(lastResolved.network, lastResolved.submit.hash, network) : null}
        onSelect={(r) => setSelectedId(r.id)}
        onApprove={(r) => void run('approving', r, approve)}
        onReject={(r) => void run('rejecting', r, reject)}
        onClose={onClose}
      />
    </div>
  );
}
