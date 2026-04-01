'use client';

import { useState } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import './TransactionModal.css';
import { TransactionModalTemplate } from './TransactionModalTemplate';

interface TransactionModalProps {
  onClose: () => void;
}

export function TransactionModal({ onClose }: TransactionModalProps) {
  const { getClient, styles, transaction, network, walletType } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const [showXdr, setShowXdr] = useState(false);
  const [copied, setCopied] = useState(false);

  const hash = transaction.step === 'success' ? transaction.hash : null;
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const explorerNetwork = buildData?.summary.network?.toLowerCase().includes('testnet') ? 'testnet' : 'public';
  const explorerUrl = hash ? `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}` : null;

  function handleSignAndSend() {
    if (transaction.step === 'built') {
      void getClient().signAndSubmitTx(transaction.buildData.unsignedXdr);
    }
  }

  function handleCopyHash() {
    if (!hash) return;
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleRetry() {
    if (transaction.step === 'error' && transaction.buildData) {
      await getClient().signAndSubmitTx(transaction.buildData.unsignedXdr);
    }
  }

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <TransactionModalTemplate
        theme={theme}
        accentColor={accentColor}
        transaction={transaction}
        showXdr={showXdr}
        copied={copied}
        explorerUrl={explorerUrl}
        walletType={walletType}
        onClose={onClose}
        onSignAndSend={handleSignAndSend}
        onToggleXdr={() => setShowXdr((v) => !v)}
        onCopyHash={handleCopyHash}
        onRetry={handleRetry}
      />
    </div>
  );
}
