import type { CosignRequest, CosignVerification } from '@pollar/core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { usePollar } from '../../context';
import { PollarOverlay } from '../commons';
import { CosignModalTemplate } from './CosignModalUI';

/** How long an outcome that needs nothing from the user stays up before the modal closes. */
const CLOSE_AFTER_SECONDS = 3;
/** A sent transaction stays up longer, so its hash can be read or copied. */
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
  const { getClient, styles, cosign, copyText } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const { pending, lastResolved } = cosign;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verification, setVerification] = useState<CosignVerification | null>(null);
  const [busy, setBusy] = useState<'approving' | 'rejecting' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = pending.find((r) => r.id === selectedId) ?? pending[0] ?? null;

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

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const copyHash = useCallback(
    (hash: string) => {
      copyText(hash)
        .then(() => {
          setCopied(true);
          clearTimeout(copiedTimer.current);
          copiedTimer.current = setTimeout(() => setCopied(false), 1500);
        })
        .catch((err: unknown) => Alert.alert('Copy failed', String(err)));
    },
    [copyText],
  );

  // The quorum as this device read it from Turnkey, once per open; a bad
  // reading fails every verification so nothing is approved on it.
  const [quorumFailure, setQuorumFailure] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getClient()
      .cosign.inspectQuorum()
      .then((q) => {
        if (!cancelled && !q.ok) setQuorumFailure(q.reason);
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
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setBusy(null);
      }
    },
    [getClient],
  );

  return (
    <PollarOverlay onCancel={onClose}>
      <CosignModalTemplate
        theme={theme}
        accentColor={accentColor}
        pending={pending}
        current={current}
        verification={current ? (quorumFailure ? { ok: false, reason: quorumFailure } : verification) : null}
        busy={busy}
        error={error}
        {...(lastResolved ? { lastResolved } : {})}
        closesIn={closesIn}
        nextStep={awaitingNext ? nextStep : null}
        copied={copied}
        onCopyHash={copyHash}
        onSelect={(r) => setSelectedId(r.id)}
        onApprove={(r) => void run('approving', r)}
        onReject={(r) => void run('rejecting', r)}
        onClose={onClose}
      />
    </PollarOverlay>
  );
}
