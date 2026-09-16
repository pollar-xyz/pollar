import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { usePollar } from '../../context';
import { WalletButtonTemplate } from './WalletButtonUI'; // Bypassing cache

export function WalletButton() {
  const { logout, copyText, walletAddress, styles, openLoginModal, openTxHistoryModal, openWalletBalanceModal } = usePollar();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    setOpen(false);
    setCopied(false);
    clearTimeout(timer.current);
  }, [walletAddress]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const isDark = theme === 'dark';
  const dropdownBg = isDark ? '#18181b' : '#fff';
  const dropdownBorder = isDark ? '#3f3f46' : '#e4e4e7';
  const itemColor = isDark ? '#fafafa' : '#18181b';

  async function handleCopy() {
    if (!walletAddress) return;
    try {
      await copyText(walletAddress);
      if (!mounted.current) return;
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      if (mounted.current) Alert.alert('Copy failed', String(error));
    }
  }

  function handleLogout() {
    setOpen(false);
    void logout().catch((error: unknown) => Alert.alert('Logout failed', String(error)));
  }

  function handleWalletBalance() {
    setOpen(false);
    openWalletBalanceModal();
  }

  function handleTxHistory() {
    setOpen(false);
    openTxHistoryModal();
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
      onToggleOpen={() => setOpen((v) => !v)}
      onClose={() => setOpen(false)}
      onCopy={handleCopy}
      onWalletBalance={handleWalletBalance}
      onTxHistory={handleTxHistory}
      onLogout={handleLogout}
      onLogin={openLoginModal}
    />
  );
}
