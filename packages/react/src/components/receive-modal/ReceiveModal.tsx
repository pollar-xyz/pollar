'use client';

import { WalletChain } from '@pollar/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { addressForChain, chainsOf } from '../ChainSelect';
import '../shared.css';
import './ReceiveModal.css';
import { ReceiveModalTemplate } from './ReceiveModalTemplate';

interface ReceiveModalProps {
  onClose: () => void;
}

export function ReceiveModal({ onClose }: ReceiveModalProps) {
  const { wallets, styles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chains = useMemo(() => chainsOf(wallets), [wallets]);
  const [selectedChain, setSelectedChain] = useState<WalletChain | null>(null);
  // Default to the first network the user holds a wallet on. Runs as an effect
  // because `wallets` is empty on the first render of a cold-start session.
  useEffect(() => {
    if (selectedChain === null && chains.length > 0) setSelectedChain(chains[0]!);
  }, [chains, selectedChain]);

  const walletAddress = addressForChain(wallets, selectedChain);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  function handleCopy() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true);
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopied(false);
      }, 2000);
    });
  }

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <ReceiveModalTemplate
        theme={theme}
        accentColor={accentColor}
        walletAddress={walletAddress}
        chains={chains}
        selectedChain={selectedChain}
        // The tick belongs to the address that was copied, so switching
        // networks clears it rather than vouching for the new address.
        onSelectChain={(chain) => {
          setCopied(false);
          setSelectedChain(chain);
        }}
        copied={copied}
        onCopy={handleCopy}
        onClose={onClose}
      />
    </div>
  );
}
