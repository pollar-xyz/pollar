'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import './SessionsModal.css';
import { SessionsModalTemplate, type SessionsState } from './SessionsModalTemplate';

interface SessionsModalProps {
  onClose: () => void;
}

export function SessionsModal({ onClose }: SessionsModalProps) {
  const { getClient, styles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const [state, setState] = useState<SessionsState>({ step: 'idle' });
  const [revokingFamilyId, setRevokingFamilyId] = useState<string | null>(null);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

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

  const load = useCallback(async () => {
    setState({ step: 'loading' });
    try {
      const sessions = await getClient().listSessions();
      if (!mountedRef.current) return;
      setState({ step: 'loaded', sessions });
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load sessions';
      setState({ step: 'error', message });
    }
  }, [getClient]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRevoke = useCallback(
    async (familyId: string) => {
      setRevokingFamilyId(familyId);
      try {
        await getClient().revokeSession(familyId);
        if (!mountedRef.current) return;
        // Refresh from the server so the row disappears from the list.
        await load();
      } catch {
        if (!mountedRef.current) return;
        setState((prev) =>
          prev.step === 'loaded' ? { step: 'error', message: 'Failed to revoke session' } : prev,
        );
      } finally {
        if (mountedRef.current) setRevokingFamilyId(null);
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
      if (!mountedRef.current) return;
      setSigningOutEverywhere(false);
    }
  }, [getClient, onClose]);

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <SessionsModalTemplate
        theme={theme}
        accentColor={accentColor}
        state={state}
        revokingFamilyId={revokingFamilyId}
        signingOutEverywhere={signingOutEverywhere}
        onRefresh={() => void load()}
        onRevoke={(familyId) => void handleRevoke(familyId)}
        onLogoutEverywhere={() => void handleLogoutEverywhere()}
        onClose={onClose}
      />
    </div>
  );
}
