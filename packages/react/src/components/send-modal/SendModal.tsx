'use client';

import { WalletBalanceRecord } from '@pollar/core';
import { useEffect, useState } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import '../transaction-modal/TransactionModal.css';
import './SendModal.css';
import { SendModalTemplate } from './SendModalTemplate';

interface SendModalProps {
  onClose: () => void;
}

function assetParam(record: WalletBalanceRecord) {
  if (record.type === 'native') return { type: 'native' as const };
  if (record.type === 'credit_alphanum4') {
    return { type: 'credit_alphanum4' as const, code: record.code, issuer: record.issuer! };
  }
  return { type: 'credit_alphanum12' as const, code: record.code, issuer: record.issuer! };
}

export function SendModal({ onClose }: SendModalProps) {
  const { walletBalance, refreshBalance, buildTx, signAndSubmitTx, tx: transaction, walletType, network, styles } =
    usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const [step, setStep] = useState<'form' | 'tx'>('form');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<WalletBalanceRecord | null>(null);
  const [showXdr, setShowXdr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    void refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balanceData = walletBalance.step === 'loaded' ? walletBalance.data : null;
  const allAssets = balanceData?.balances ?? [];
  const sortedAssets = [
    ...allAssets.filter((b) => b.enabledInApp),
    ...allAssets.filter((b) => !b.enabledInApp && parseFloat(b.balance) > 0),
  ];

  const hash = transaction.step === 'success' ? transaction.hash : null;
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const explorerNetwork = buildData?.summary.network?.toLowerCase().includes('testnet')
    ? 'testnet'
    : buildData
      ? 'public'
      : network === 'testnet'
        ? 'testnet'
        : 'public';
  const explorerUrl = hash ? `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}` : null;

  const isInProgress = transaction.step === 'building' || transaction.step === 'signing';
  const showBack =
    step === 'tx' && (transaction.step === 'error' || transaction.step === 'success') && !isInProgress;

  const txTitle =
    transaction.step === 'signing'
      ? 'Sending…'
      : transaction.step === 'success'
        ? 'Sent!'
        : transaction.step === 'error'
          ? 'Send failed'
          : 'Confirm Send';

  async function handleSubmit() {
    setFormError('');
    if (!selectedAsset) {
      setFormError('Select an asset');
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setFormError('Enter a valid amount');
      return;
    }
    if (parsed > parseFloat(selectedAsset.available)) {
      setFormError('Insufficient balance');
      return;
    }
    if (!destination.trim()) {
      setFormError('Enter a destination address');
      return;
    }

    setStep('tx');
    await buildTx('payment', { destination: destination.trim(), amount, asset: assetParam(selectedAsset) });
  }

  function handleSignAndSend() {
    if (transaction.step === 'built') {
      void signAndSubmitTx(transaction.buildData.unsignedXdr);
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
      await signAndSubmitTx(transaction.buildData.unsignedXdr);
    }
  }

  function handleBack() {
    setStep('form');
    setShowXdr(false);
    setCopied(false);
  }

  return (
    <div className="pollar-overlay" onClick={!isInProgress ? onClose : undefined}>
      <SendModalTemplate
        theme={theme}
        accentColor={accentColor}
        step={step}
        txTitle={txTitle}
        assets={sortedAssets}
        selectedAsset={selectedAsset}
        amount={amount}
        destination={destination}
        formError={formError}
        isLoadingBalance={walletBalance.step === 'loading'}
        transaction={transaction}
        showXdr={showXdr}
        copied={copied}
        explorerUrl={explorerUrl}
        walletType={walletType}
        showBack={showBack}
        isInProgress={isInProgress}
        onClose={onClose}
        onBack={handleBack}
        onSelectAsset={setSelectedAsset}
        onAmountChange={setAmount}
        onDestinationChange={setDestination}
        onSubmit={() => void handleSubmit()}
        onSignAndSend={handleSignAndSend}
        onToggleXdr={() => setShowXdr((v) => !v)}
        onCopyHash={handleCopyHash}
        onRetry={() => void handleRetry()}
        onDone={onClose}
      />
    </div>
  );
}