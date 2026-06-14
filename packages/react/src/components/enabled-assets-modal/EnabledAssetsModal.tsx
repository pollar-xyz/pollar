'use client';

import { EnabledAssetRecord } from '@pollar/core';
import { useCallback, useEffect, useState } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import './EnabledAssetsModal.css';
import { CustomTrustlineModalTemplate, EnabledAssetsModalTemplate } from './EnabledAssetsModalTemplate';

interface EnabledAssetsModalProps {
  onClose: () => void;
}

function assetKey(record: { code: string; issuer?: string }): string {
  return record.code + (record.issuer ?? '');
}

export function EnabledAssetsModal({ onClose }: EnabledAssetsModalProps) {
  const { enabledAssets, refreshAssets, setTrustline, walletAddress, styles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const [view, setView] = useState<'list' | 'custom'>('list');
  // Key of the in-flight asset (`code+issuer`), or 'custom' for the custom form.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void refreshAssets();
  }, [refreshAssets]);

  const runAction = useCallback(
    async (
      key: string,
      asset: { code: string; issuer: string },
      opts: { limit?: string; sponsored?: boolean },
    ): Promise<boolean> => {
      setBusyKey(key);
      setActionError(null);
      const res = await setTrustline(asset, opts);
      if (res.status === 'error') {
        setActionError(res.details || 'Trustline update failed. Please try again.');
        setBusyKey(null);
        return false;
      }
      await refreshAssets();
      setBusyKey(null);
      return true;
    },
    [setTrustline, refreshAssets],
  );

  const handleToggle = useCallback(
    (record: EnabledAssetRecord) => {
      const removing = record.trustlineEstablished;
      void runAction(
        assetKey(record),
        { code: record.code, issuer: record.issuer ?? '' },
        { ...(removing ? { limit: '0' } : {}), sponsored: record.sponsored ?? false },
      );
    },
    [runAction],
  );

  const handleCustomSubmit = useCallback(
    async (input: { code: string; issuer: string; limit?: string }) => {
      // Custom (non-configured) assets are never app-sponsored — the user pays.
      const ok = await runAction(
        'custom',
        { code: input.code, issuer: input.issuer },
        { ...(input.limit ? { limit: input.limit } : {}), sponsored: false },
      );
      if (ok) setView('list');
    },
    [runAction],
  );

  return (
    <div className="pollar-overlay" onClick={onClose}>
      {view === 'list' ? (
        <EnabledAssetsModalTemplate
          theme={theme}
          accentColor={accentColor}
          enabledAssets={enabledAssets}
          walletAddress={walletAddress}
          busyKey={busyKey}
          actionError={actionError}
          onRefresh={() => refreshAssets()}
          onClose={onClose}
          onToggleTrustline={handleToggle}
          onAddCustom={() => {
            setActionError(null);
            setView('custom');
          }}
        />
      ) : (
        <CustomTrustlineModalTemplate
          theme={theme}
          accentColor={accentColor}
          busy={busyKey === 'custom'}
          actionError={actionError}
          onBack={() => {
            setActionError(null);
            setView('list');
          }}
          onClose={onClose}
          onSubmit={handleCustomSubmit}
        />
      )}
    </div>
  );
}
