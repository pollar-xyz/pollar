'use client';

import { usePollar } from '../../context';
import './TransactionModal.css';
import { TransactionModalTemplate } from './TransactionModalTemplate';

interface TransactionModalProps {
  onClose: () => void;
}

export function TransactionModal({ onClose }: TransactionModalProps) {
  const { getClient, styles, transaction } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  async function handleSignAndSend() {
    if (transaction.step === 'built') {
      await getClient().signAndSubmitTx(transaction.buildData.unsignedXdr);
    }
  }

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <TransactionModalTemplate
        theme={theme}
        accentColor={accentColor}
        transaction={transaction}
        onClose={onClose}
        onSignAndSend={handleSignAndSend}
      />
    </div>
  );
}