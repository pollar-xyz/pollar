'use client';

import { StateTransactionCodes, TxBuildResponse } from '@pollar/core';
import { useState } from 'react';
import { usePollar } from '../../context';
import './TransactionModal.css';
import { TransactionModalTemplate } from './TransactionModalTemplate';

interface TransactionModalProps {
  onClose: () => void;
}

const isTxBuildResponse = (data: unknown): data is TxBuildResponse['content'] => {
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

export function TransactionModal({ onClose }: TransactionModalProps) {
  const {
    styles,
    state: { transaction },
  } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const [submitResult, setSubmitResult] = useState<{ hash: string; status: string } | null>(null);

  console.log({ transaction });

  async function handleSignAndSend() {}

  const isLoading = transaction.status === 'LOADING';
  let buildResult: TxBuildResponse['content'] | null = null;
  const stateCode = transaction.code as StateTransactionCodes;
  if (isTxBuildResponse(transaction.data)) {
    buildResult = transaction.data;
  }
  console.log({ transaction, buildResult });

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <TransactionModalTemplate
        theme={theme}
        accentColor={accentColor}
        stateCode={stateCode}
        buildResult={buildResult}
        submitResult={submitResult}
        isLoading={isLoading}
        onClose={onClose}
        onSignAndSend={handleSignAndSend}
        onRetry={() => {}}
      />
    </div>
  );
}
