'use client';

import { EnabledAssetRecord, WalletChain } from '@pollar/core';
import { useCallback, useEffect, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { useChains } from '../../useChains';
import { addressForChain } from '../ChainSelect';
import '../shared.css';
import './EnabledAssetsModal.css';
import { CustomTrustlineModalTemplate, EnabledAssetsModalTemplate } from './EnabledAssetsModalTemplate';
import { modalChrome } from '../modal-theme';
import { ENABLED_ASSETS_COPY } from './enabled-assets-copy';
import { PollarOverlay } from '../PollarOverlay';
import { useInlineConfirmation } from '../../useInlineConfirmation';
import { type AssetOutcome } from './EnabledAssetsModalTemplate';

interface EnabledAssetsModalProps {
  onClose: () => void;
}

function assetKey(record: { code: string; issuer?: string }): string {
  return record.code + (record.issuer ?? '');
}

export function EnabledAssetsModal({ onClose }: EnabledAssetsModalProps) {
  const { enabledAssets, refreshAssets, setTrustline, wallets, styles } = usePollar();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const language = useModalLanguage();
  const updateFailed = ENABLED_ASSETS_COPY[language].updateFailed;

  const { chains } = useChains();
  const [selectedChain, setSelectedChain] = useState<WalletChain | null>(null);
  // Default to the app's first configured network. Runs as an effect because
  // `wallets` is empty on the first render of a cold-start session.
  useEffect(() => {
    if (selectedChain === null && chains.length > 0) setSelectedChain(chains[0]!);
  }, [chains, selectedChain]);

  const walletAddress = addressForChain(wallets, selectedChain);

  const [view, setView] = useState<'list' | 'custom'>('list');
  // Key of the in-flight asset (`code+issuer`), or 'custom' for the custom form.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // The last trustline change from this modal: its outcome strip, in place of a bare error line.
  const [outcome, setOutcome] = useState<AssetOutcome | null>(null);
  // The change's signature is confirmed here, not in a prompt over the modal.
  const confirmation = useInlineConfirmation(busyKey !== null);

  useEffect(() => {
    void refreshAssets();
  }, [refreshAssets]);

  const runAction = useCallback(
    async (
      key: string,
      asset: { code: string; issuer: string },
      opts: { limit?: string; skipSponsorship?: boolean },
    ): Promise<boolean> => {
      const removing = opts.limit === '0';
      setBusyKey(key);
      setOutcome({ code: asset.code, removing, state: 'busy' });
      const res = await setTrustline(asset, opts);
      if (res.status === 'error') {
        setOutcome({ code: asset.code, removing, state: 'failed', note: res.details || updateFailed });
        setBusyKey(null);
        return false;
      }
      await refreshAssets();
      setOutcome({ code: asset.code, removing, state: 'done' });
      setBusyKey(null);
      return true;
    },
    [setTrustline, refreshAssets, updateFailed],
  );

  const handleToggle = useCallback(
    (record: EnabledAssetRecord) => {
      const removing = record.trustlineEstablished;
      // Sponsorship is derived automatically from the app config now - no flag.
      void runAction(
        assetKey(record),
        { code: record.code, issuer: record.issuer ?? '' },
        { ...(removing ? { limit: '0' } : {}) },
      );
    },
    [runAction],
  );

  const handleCustomSubmit = useCallback(
    async (input: { code: string; issuer: string; limit?: string }) => {
      // Custom (non-configured) assets are never app-sponsored - the user pays.
      const ok = await runAction(
        'custom',
        { code: input.code, issuer: input.issuer },
        { ...(input.limit ? { limit: input.limit } : {}), skipSponsorship: true },
      );
      if (ok) setView('list');
    },
    [runAction],
  );

  return (
    <PollarOverlay style={overlayStyle} onClick={busyKey ? undefined : onClose}>
      {view === 'list' ? (
        <EnabledAssetsModalTemplate
          theme={theme}
          accentColor={accentColor}
          styleOverrides={styleOverrides}
          enabledAssets={enabledAssets}
          walletAddress={walletAddress}
          chains={chains}
          selectedChain={selectedChain}
          onSelectChain={setSelectedChain}
          busyKey={busyKey}
          outcome={outcome}
          confirmation={confirmation}
          onRefresh={() => refreshAssets()}
          onClose={onClose}
          onToggleTrustline={handleToggle}
          onAddCustom={() => {
            setOutcome(null);
            setView('custom');
          }}
          language={language}
        />
      ) : (
        <CustomTrustlineModalTemplate
          theme={theme}
          accentColor={accentColor}
          styleOverrides={styleOverrides}
          busy={busyKey === 'custom'}
          outcome={outcome}
          confirmation={confirmation}
          onBack={() => {
            setOutcome(null);
            setView('list');
          }}
          onClose={onClose}
          onSubmit={handleCustomSubmit}
          language={language}
        />
      )}
    </PollarOverlay>
  );
}
