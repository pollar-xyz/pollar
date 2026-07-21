'use client';

import { WalletChain } from '@pollar/core';
import { useEffect, useMemo, useState } from 'react';
import { usePollar } from '../../context';
import { addressForChain, chainsOf } from '../ChainSelect';
import '../shared.css';
import './WalletBalanceModal.css';
import { WalletBalanceModalTemplate } from './WalletBalanceModalTemplate';

interface WalletBalanceModalProps {
  onClose: () => void;
}

export function WalletBalanceModal({ onClose }: WalletBalanceModalProps) {
  const { walletBalance, refreshWalletBalance, wallets, network, styles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const chains = useMemo(() => chainsOf(wallets), [wallets]);
  const [selectedChain, setSelectedChain] = useState<WalletChain | null>(null);
  // Default to the first network the user holds a wallet on. Runs as an effect
  // because `wallets` is empty on the first render of a cold-start session.
  useEffect(() => {
    if (selectedChain === null && chains.length > 0) setSelectedChain(chains[0]!);
  }, [chains, selectedChain]);

  const walletAddress = addressForChain(wallets, selectedChain);

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
        chains={chains}
        selectedChain={selectedChain}
        network={network}
        onSelectChain={setSelectedChain}
        onRefresh={() => refreshWalletBalance()}
        onClose={onClose}
      />
    </div>
  );
}
