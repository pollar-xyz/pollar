'use client';

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

  async function handleSignAndSend() {
    if (transaction.step === 'built') {
      await getClient().signAndSubmitTx(transaction.buildData.unsignedXdr);
    }
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
        network={network}
        walletType={walletType}
        onClose={onClose}
        onSignAndSend={handleSignAndSend}
        onRetry={handleRetry}
      />
    </div>
  );
}