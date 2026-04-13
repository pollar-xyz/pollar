'use client';

import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { WalletButtonTemplate } from './WalletButtonTemplate';
import './WalletButton.css';

export function WalletButton() {
  const {
    getClient,
    walletAddress,
    styles,
    openLoginModal,
    openTxHistoryModal,
    openWalletBalanceModal,
    openSendModal,
    openReceiveModal,
    tx: transaction,
    walletType,
  } = usePollar();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isInProgress = transaction.step === 'building' || transaction.step === 'signing';

  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const isDark = theme === 'dark';
  const dropdownBg = isDark ? '#18181b' : '#fff';
  const dropdownBorder = isDark ? '#3f3f46' : '#e4e4e7';
  const itemColor = isDark ? '#fafafa' : '#18181b';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleCopy() {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleLogout() {
    setOpen(false);
    getClient().logout();
  }

  function handleWalletBalance() {
    setOpen(false);
    openWalletBalanceModal();
  }

  function handleTxHistory() {
    setOpen(false);
    openTxHistoryModal();
  }

  function handleSend() {
    setOpen(false);
    openSendModal();
  }

  function handleReceive() {
    setOpen(false);
    openReceiveModal();
  }

  return (
    <WalletButtonTemplate
      walletAddress={walletAddress ?? null}
      accentColor={accentColor}
      open={open}
      copied={copied}
      dropdownBg={dropdownBg}
      dropdownBorder={dropdownBorder}
      itemColor={itemColor}
      wrapperRef={wrapperRef}
      isInProgress={isInProgress}
      walletType={walletType}
      onToggleOpen={() => setOpen((v) => !v)}
      onCopy={handleCopy}
      onWalletBalance={handleWalletBalance}
      onTxHistory={handleTxHistory}
      onSend={handleSend}
      onReceive={handleReceive}
      onLogout={handleLogout}
      onLogin={openLoginModal}
    />
  );
}