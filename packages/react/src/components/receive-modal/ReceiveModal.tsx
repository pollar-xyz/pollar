'use client';

import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import './ReceiveModal.css';
import { ReceiveModalTemplate } from './ReceiveModalTemplate';

interface ReceiveModalProps {
  onClose: () => void;
}

export function ReceiveModal({ onClose }: ReceiveModalProps) {
  const { wallet, styles } = usePollar();
  const walletAddress = wallet?.address ?? '';
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        copied={copied}
        onCopy={handleCopy}
        onClose={onClose}
      />
    </div>
  );
}
