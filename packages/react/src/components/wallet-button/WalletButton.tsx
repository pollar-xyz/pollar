'use client';

import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useChains } from '../../useChains';
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
  // The address shown (and copied) is the one on the app's FIRST configured
  // chain, not `wallet.address` — that field is the Stellar wallet by definition
  // in core, so this button used to say "Stellar" to an app whose users live on
  // Polygon. Falls back to it while `/config` loads and for a legacy session that
  // enumerates no wallets.
  const { primaryAddress } = useChains();
  const walletAddress = primaryAddress || (wallet?.address ?? '');
  // External-wallet signing-adapter id (freighter/albedo) drives the wallet logo;
  // null for custodial/smart, which fall back to the Pollar logo.
  const walletType = wallet?.custody === 'external' ? wallet.provider : null;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInProgress = transaction.step === 'building' || transaction.step === 'signing';
  // Offer on-chain account creation only for an EXTERNAL wallet Stellar doesn't
  // have yet, under IMMEDIATE funding. `existsOnStellar === false` (not just
  // falsy) so an unknown/legacy session doesn't wrongly show it. `created` hides
  // it optimistically after a successful create (the session's existsOnStellar
  // only refreshes on the next login/resume).
  const canCreateAccount =
    !created && wallet?.custody === 'external' && wallet.existsOnStellar === false && wallet.fundingMode === 'IMMEDIATE';

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

  async function handleCreateAccount() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await getClient().createAccount();
      if (res.status === 'success' || res.status === 'pending') {
        setCreated(true);
        setOpen(false);
        await getClient().refreshBalance();
      }
      // On error, keep the item so the user can retry (createAccount surfaces the
      // reason in res.details; the send/receive modals also report failures).
    } finally {
      setCreating(false);
    }
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
      showCreateAccount={canCreateAccount}
      creatingAccount={creating}
      onToggleOpen={() => setOpen((v) => !v)}
      onCreateAccount={handleCreateAccount}
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
