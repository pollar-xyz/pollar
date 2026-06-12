'use client';

import { useEffect } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import './EnabledAssetsModal.css';
import { EnabledAssetsModalTemplate } from './EnabledAssetsModalTemplate';

interface EnabledAssetsModalProps {
  onClose: () => void;
}

export function EnabledAssetsModal({ onClose }: EnabledAssetsModalProps) {
  const { enabledAssets, refreshAssets, walletAddress, styles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  useEffect(() => {
    void refreshAssets();
  }, [refreshAssets]);

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <EnabledAssetsModalTemplate
        theme={theme}
        accentColor={accentColor}
        enabledAssets={enabledAssets}
        walletAddress={walletAddress}
        onRefresh={() => refreshAssets()}
        onClose={onClose}
      />
    </div>
  );
}
