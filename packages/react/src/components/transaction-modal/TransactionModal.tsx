'use client';

import { StateTransactionCodes, TxBuildResponse, TxSignSendResponse } from '@pollar/core';
import { usePollar } from '../../context';
import './TransactionModal.css';
import { TransactionModalTemplate } from './TransactionModalTemplate';

interface TransactionModalProps {
  onClose: () => void;
}

const isTxBuildResponseContent = (data: unknown): data is TxBuildResponse['content'] => {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.unsignedXdr === 'string' &&
    typeof d.networkPassphrase === 'string' &&
    typeof d.estimatedFee === 'string' &&
    d.summary !== null &&
    typeof d.summary === 'object'
  );
};

const isTxSignSendResponseContent = (data: unknown): data is TxSignSendResponse['content'] => {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.hash === 'string' && (d.status === 'PENDING' || d.status === 'SUCCESS' || d.status === 'FAILED');
};

export function TransactionModal({ onClose }: TransactionModalProps) {
  const {
    getClient,
    styles,
    state: { transaction },
  } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  let buildResult: TxBuildResponse['content'] | null = null;
  const transactionStateCode = transaction.code as StateTransactionCodes;
  const content = (transaction.data as { content: unknown })?.content;
  if (isTxBuildResponseContent(content)) {
    buildResult = content;
  }
  let submitResult: TxSignSendResponse['content'] | null = null;
  if (isTxSignSendResponseContent(content)) {
    submitResult = content;
  }

  async function handleSignAndSend() {
    if (buildResult) {
      await getClient().submitTx(buildResult.unsignedXdr);
    }
  }

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <TransactionModalTemplate
        theme={theme}
        accentColor={accentColor}
        transactionStateCode={transactionStateCode}
        status={transaction.status}
        buildResult={buildResult}
        submitResult={submitResult}
        onClose={onClose}
        onSignAndSend={handleSignAndSend}
        onRetrySignAndSend={handleSignAndSend}
      />
    </div>
  );
}
