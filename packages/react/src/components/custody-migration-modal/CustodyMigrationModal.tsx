'use client';

import { type CosignCustody, type CustodyMigrationState, isPollarApiError, transactionErrorMessage } from '@pollar/core';
import { useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import '../shared.css';
import '../recovery-modal/RecoveryModal.css';
import { modalChrome } from '../modal-theme';
import { CustodyMigrationModalTemplate } from './CustodyMigrationModalTemplate';

interface CustodyMigrationModalProps {
  state: CustodyMigrationState;
  /** The wallets moved: the provider reads their state again and asks for a recovery method. */
  onMoved: () => void;
  /** A blocked wallet waits for what is pending; the provider stops asking until the next session. */
  onLater: () => void;
}

export function CustodyMigrationModal({ state, onMoved, onLater }: CustodyMigrationModalProps) {
  const { getClient, styles } = usePollar();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const language = useModalLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<string[] | null>(null);

  async function move(custody?: CosignCustody) {
    setBusy(true);
    setError(null);
    setBlockedReasons(null);
    try {
      await getClient().cosign.migrateWallets(custody);
      onMoved();
    } catch (err) {
      if (isPollarApiError(err) && err.code === 'SDK_CUSTODY_MIGRATION_BLOCKED') {
        const reasons = err.body.reasons;
        setBlockedReasons(Array.isArray(reasons) ? reasons.map(String) : []);
        return;
      }
      setError(
        transactionErrorMessage(isPollarApiError(err) ? err.code : null, err instanceof Error ? err.message : null, language),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pollar-overlay" style={overlayStyle}>
      <CustodyMigrationModalTemplate
        theme={theme}
        accentColor={accentColor}
        styleOverrides={styleOverrides}
        state={state}
        busy={busy}
        error={error}
        blockedReasons={blockedReasons}
        onMove={(custody) => void move(custody)}
        onLater={onLater}
        onLogout={() => void getClient().logout()}
        language={language}
      />
    </div>
  );
}
