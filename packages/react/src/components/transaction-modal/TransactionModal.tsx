'use client';

import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import '../shared.css';
import './TransactionModal.css';
import { TransactionModalTemplate } from './TransactionModalTemplate';
import { modalChrome } from '../modal-theme';
import { PollarOverlay } from '../PollarOverlay';
import { useInlineConfirmation } from '../../useInlineConfirmation';

interface TransactionModalProps {
  onClose: () => void;
}

export function TransactionModal({ onClose }: TransactionModalProps) {
  const { getClient, styles, tx: transaction, network, wallet } = usePollar();
  // External-wallet signing-adapter id (freighter/albedo) drives the wallet logo;
  // null for embedded/smart, which fall back to the Pollar logo.
  const walletType = wallet?.custody === 'external' ? wallet.provider : null;
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const language = useModalLanguage();

  // The signature's yes is asked here, under the review, not in a prompt over the modal.
  const confirmation = useInlineConfirmation(true);
  const [showXdr, setShowXdr] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

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

  function handleSignAndSend() {
    if (transaction.step === 'built') {
      void getClient().signAndSubmitTx(transaction.buildData.unsignedXdr);
    }
  }

  function handleCopyHash() {
    if (!hash) return;
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopied(false);
      }, 2000);
    });
  }

  async function handleRetry() {
    if (transaction.step === 'error' && transaction.buildData) {
      await getClient().signAndSubmitTx(transaction.buildData.unsignedXdr);
    }
  }

  return (
    <PollarOverlay style={overlayStyle}>
      <TransactionModalTemplate
        theme={theme}
        accentColor={accentColor}
        styleOverrides={styleOverrides}
        confirmation={confirmation}
        network={network}
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
        language={language}
      />
    </PollarOverlay>
  );
}
