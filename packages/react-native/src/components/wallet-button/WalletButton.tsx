import { type CosignCustody, isPollarApiError } from '@pollar/core';
import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { WalletButtonTemplate } from './WalletButtonUI'; // Bypassing cache
import { WALLET_BUTTON_COPY } from './wallet-button-copy';

export function WalletButton() {
  const {
    logout,
    copyText,
    walletAddress,
    styles,
    openLoginModal,
    openTxHistoryModal,
    openWalletBalanceModal,
    recovery,
    recoveryLocked,
    openRecoveryModal,
    isAuthenticated,
    appConfig,
    createWallet,
  } = usePollar();
  const language = useModalLanguage();
  const copy = WALLET_BUTTON_COPY[language];
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [createWalletError, setCreateWalletError] = useState<string | null>(null);
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
      if (mounted.current) Alert.alert(copy.copyFailed, String(error));
    }
  }

  function handleLogout() {
    setOpen(false);
    void logout().catch((error: unknown) => Alert.alert(copy.logoutFailed, String(error)));
  }

  function handleWalletBalance() {
    setOpen(false);
    openWalletBalanceModal();
  }

  function handleTxHistory() {
    setOpen(false);
    openTxHistoryModal();
  }

  async function handleCreateWallet(custody?: CosignCustody) {
    if (creatingWallet) return;
    setCreatingWallet(true);
    setCreateWalletError(null);
    try {
      await createWallet(custody ? { custody } : undefined);
      if (mounted.current) setOpen(false);
    } catch (err) {
      if (mounted.current)
        setCreateWalletError(
          isPollarApiError(err) && err.code === 'SDK_WALLET_PROVISIONING_DISABLED'
            ? copy.provisioningDisabled
            : copy.createWalletFailed,
        );
    } finally {
      if (mounted.current) setCreatingWallet(false);
    }
  }

  function handleRecovery() {
    setOpen(false);
    openRecoveryModal();
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
      {...(recovery?.required ? { onRecovery: handleRecovery } : {})}
      recoveryLocked={recoveryLocked}
      onLogout={handleLogout}
      onLogin={openLoginModal}
      signedIn={isAuthenticated}
      creatingWallet={creatingWallet}
      createWalletError={createWalletError}
      custodyChoice={appConfig.application?.walletCustodyMode === 'USER_CHOICE'}
      {...(appConfig.application?.walletProvisioning === 'NONE' ? {} : { onCreateWallet: handleCreateWallet })}
      language={language}
    />
  );
}
