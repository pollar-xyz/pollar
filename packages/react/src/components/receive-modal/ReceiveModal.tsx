'use client';

import { useState } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import './ReceiveModal.css';
import { ReceiveModalTemplate } from './ReceiveModalTemplate';

interface ReceiveModalProps {
  onClose: () => void;
}

export function ReceiveModal({ onClose }: ReceiveModalProps) {
  const { walletAddress, styles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
