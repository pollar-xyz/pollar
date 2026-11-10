import type { CosignRequest, CosignVerification } from '@pollar/core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { PollarOverlay } from '../commons';
import { COSIGN_COPY } from './cosign-copy';
import { CosignModalTemplate } from './CosignModalUI';
import { explorerTxUrl } from '../explorer';

/** How long an outcome that needs nothing from the user stays up before the modal closes. */
const CLOSE_AFTER_SECONDS = 3;
/** A sent transaction stays up longer, so its details can be opened. */
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
 * against Turnkey before enabling Approve.
 */
export function CosignModal({ nextStep = null, onClose }: CosignModalProps) {
  const { getClient, styles, cosign, copyText, network, openRecoveryModal } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const { pending, lastResolved } = cosign;
  const language = useModalLanguage();
  const copy = COSIGN_COPY[language];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verification, setVerification] = useState<CosignVerification | null>(null);
  const [busy, setBusy] = useState<'approving' | 'rejecting' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = pending.find((r) => r.id === selectedId) ?? pending[0] ?? null;

  // A request left unsigned holds up the app's flow, so closing over one asks first: the X and
  // Android's back button get there, a tap on the backdrop does nothing. With nothing waiting, they just close.
  const [askedToClose, setAskedToClose] = useState(false);
  const confirmingClose = askedToClose && pending.length > 0;
  const requestClose = () => (pending.length > 0 ? setAskedToClose(true) : onClose());

  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void getClient()
      .cosign.pending()
      .catch(() => undefined)
      .finally(() => setLoaded(true));
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
    const timer = setInterval(
      () =>
        void getClient()
          .cosign.pending()
          .catch(() => undefined),
      NEXT_REQUEST_EVERY_MS,
    );
    return () => clearInterval(timer);
  }, [awaitingNext, getClient]);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
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

  // Every request resolved while the prompt is open: a flow's earlier steps stay listed as signed.
  // One resolved before it opened belongs to another flow and is left out.
  const [history, setHistory] = useState<CosignRequest[]>([]);
  const resolvedBeforeOpen = useRef(lastResolved?.id);
  useEffect(() => {
    if (!lastResolved || lastResolved.id === resolvedBeforeOpen.current) return;
    setHistory((list) => [...list.filter((r) => r.id !== lastResolved.id), lastResolved]);
  }, [lastResolved]);

  // The quorum as this device read it from Turnkey, once per open; a bad
  // reading fails every verification so nothing is approved on it.
  const [quorumFailure, setQuorumFailure] = useState<string | null>(null);
  // Another install of the same user holds its own key: until it is added,
  // every vote it stamps is refused, so it is told how to add itself.
  const [deviceNotLinked, setDeviceNotLinked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getClient()
      .cosign.inspectQuorum()
      .then((q) => {
        if (cancelled || q.ok) return;
        if (q.code === 'DEVICE_NOT_ENROLLED') setDeviceNotLinked(true);
        else setQuorumFailure(q.reason);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getClient]);

  // Keyed by id: every refresh of the pending list hands back new objects for
  // the same requests, and re-running on those would cancel the check in flight.
  const currentRef = useRef(current);
  currentRef.current = current;
  const currentId = current?.id ?? null;
  useEffect(() => {
    const request = currentRef.current;
    if (!request) return;
    setVerification(null);
    setError(null);
    let cancelled = false;
    getClient()
      .cosign.verify(request)
      .then((v) => {
        if (!cancelled) setVerification(v);
      })
      .catch((err: unknown) => {
        if (!cancelled) setVerification({ ok: false, reason: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [currentId, getClient]);

  const run = useCallback(
    async (kind: 'approving' | 'rejecting', request: CosignRequest) => {
      setBusy(kind);
      setError(null);
      try {
        if (kind === 'approving') await getClient().cosign.approve(request);
        else await getClient().cosign.reject(request);
      } catch (err) {
        setError(err instanceof Error ? err.message : copy.genericError);
      } finally {
        setBusy(null);
      }
    },
    [getClient, copy],
  );

  return (
    <PollarOverlay onCancel={requestClose} dismissOnBackdrop={false}>
      <CosignModalTemplate
        theme={theme}
        accentColor={accentColor}
        pending={pending}
        current={current}
        verification={current ? (quorumFailure ? { ok: false, reason: quorumFailure } : verification) : null}
        busy={busy}
        error={error}
        deviceNotLinked={deviceNotLinked}
        onLinkDevice={() => {
          onClose();
          openRecoveryModal();
        }}
        {...(lastResolved ? { lastResolved } : {})}
        closesIn={closesIn}
        nextStep={awaitingNext ? nextStep : null}
        language={language}
        network={network}
        copyText={copyText}
        history={history}
        explorerUrlOf={(r) => (r.submit?.hash ? explorerTxUrl(r.network, r.submit.hash, network ?? 'mainnet') : null)}
        onSelect={(r) => setSelectedId(r.id)}
        onApprove={(r) => void run('approving', r)}
        onReject={(r) => void run('rejecting', r)}
        onClose={requestClose}
        confirmingClose={confirmingClose}
        onKeepOpen={() => setAskedToClose(false)}
        onCloseAnyway={onClose}
      />
    </PollarOverlay>
  );
}
