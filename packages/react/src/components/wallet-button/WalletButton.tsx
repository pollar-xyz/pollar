'use client';

import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { WalletButtonTemplate } from './WalletButtonTemplate';
import './WalletButton.css';

export function WalletButton() {
  const {
    getClient,
    wallet,
    styles,
    openLoginModal,
    openTxHistoryModal,
    openWalletBalanceModal,
    openSendModal,
    openReceiveModal,
    openSessionsModal,
    openKycModal,
    openRampModal,
    openDistributionRulesModal,
    tx: transaction,
  } = usePollar();
  const walletAddress = wallet?.address ?? '';
  // External-wallet signing-adapter id (freighter/albedo) drives the wallet logo;
  // null for custodial/smart, which fall back to the Pollar logo.
  const walletType = wallet?.custody === 'external' ? wallet.provider : null;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  async function handleCopy() {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      copyTimerRef.current = null;
      setCopied(false);
    }, 1500);
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

  function handleSessions() {
    setOpen(false);
    openSessionsModal();
  }

  function handleKyc() {
    setOpen(false);
    openKycModal();
  }

  function handleRamp() {
    setOpen(false);
    openRampModal();
  }

  function handleDistributionRules() {
    setOpen(false);
    openDistributionRulesModal();
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
      onSessions={handleSessions}
      onKyc={handleKyc}
      onRamp={handleRamp}
      onDistributionRules={handleDistributionRules}
      onLogout={handleLogout}
      onLogin={openLoginModal}
    />
  );
}
