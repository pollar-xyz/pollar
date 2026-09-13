import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { usePollar } from '../../context';
import { WalletButtonTemplate } from './WalletButtonUI'; // Bypassing cache

export function WalletButton() {
    const { getClient, walletAddress, styles, openLoginModal, openTxHistoryModal, openWalletBalanceModal } = usePollar();
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const { theme = 'light', accentColor = '#005DB4' } = styles;
    const isDark = theme === 'dark';
    const dropdownBg = isDark ? '#18181b' : '#fff';
    const dropdownBorder = isDark ? '#3f3f46' : '#e4e4e7';
    const itemColor = isDark ? '#fafafa' : '#18181b';

    async function handleCopy() {
        if (!walletAddress) return;
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
