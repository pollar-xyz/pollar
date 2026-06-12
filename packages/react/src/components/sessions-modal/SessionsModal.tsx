'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import './SessionsModal.css';
import { SessionsModalTemplate } from './SessionsModalTemplate';

interface SessionsModalProps {
  onClose: () => void;
}

export function SessionsModal({ onClose }: SessionsModalProps) {
  const { getClient, styles, sessions } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  // Only the per-action button spinners are local UI state. The list itself
  // (idle/loading/loaded/error) lives in the client's observable `sessions`
  // store, read straight from the provider — so this component is a pure
  // reader and there's no `await`-then-`setState` to guard against unmount.
  const [revokingFamilyId, setRevokingFamilyId] = useState<string | null>(null);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);

  const load = useCallback(() => {
    void getClient().fetchSessions();
  }, [getClient]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-close on logout (logoutEverywhere from this modal, or eventual
  // 401-on-current-family-revoke). The provider clears session state when
  // the user becomes unauthenticated; mirror that here so the modal
  // tears down instead of showing stale data.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    return getClient().onAuthStateChange((authState) => {
      if (authState.step === 'idle') onCloseRef.current();
    });
  }, [getClient]);

  const handleRevoke = useCallback(
    async (familyId: string) => {
      setRevokingFamilyId(familyId);
      try {
        await getClient().revokeSession(familyId);
      } catch {
        // Swallow — the refresh below resyncs the list with server truth, so a
        // failed revoke simply leaves the (still-active) row in place.
      } finally {
        setRevokingFamilyId(null);
        // Refresh from the server so the row disappears from the list.
        load();
      }
    },
    [getClient, load],
  );

  const handleLogoutEverywhere = useCallback(async () => {
    setSigningOutEverywhere(true);
    try {
      await getClient().logoutEverywhere();
      // After logout-everywhere the auth state flips to 'idle' — the
      // provider closes the parent overlay automatically. Belt-and-braces:
      // call onClose so the modal also tears down even if the consumer
      // wired it up outside the provider.
      onClose();
    } catch {
      setSigningOutEverywhere(false);
    }
  }, [getClient, onClose]);

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <SessionsModalTemplate
        theme={theme}
        accentColor={accentColor}
        state={sessions}
        revokingFamilyId={revokingFamilyId}
        signingOutEverywhere={signingOutEverywhere}
        onRefresh={() => load()}
        onRevoke={(familyId) => void handleRevoke(familyId)}
        onLogoutEverywhere={() => void handleLogoutEverywhere()}
        onClose={onClose}
      />
    </div>
  );
}
