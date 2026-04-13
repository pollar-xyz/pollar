'use client';

import { useEffect } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import './WalletBalanceModal.css';
import { WalletBalanceModalTemplate } from './WalletBalanceModalTemplate';

interface WalletBalanceModalProps {
  onClose: () => void;
}

export function WalletBalanceModal({ onClose }: WalletBalanceModalProps) {
  const { walletBalance, refreshWalletBalance, walletAddress, styles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  useEffect(() => {
    void refreshWalletBalance();
  }, [refreshWalletBalance]);

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <WalletBalanceModalTemplate
        theme={theme}
        accentColor={accentColor}
        walletBalance={walletBalance}
        walletAddress={walletAddress}
        onRefresh={() => refreshWalletBalance()}
        onClose={onClose}
      />
    </div>
  );
}