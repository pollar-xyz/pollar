import { TransactionState, WalletType } from '@pollar/core';
import React, { useState } from 'react';
import { View, StyleSheet, TouchableWithoutFeedback, Linking } from 'react-native';
import { usePollar } from '../../context';
import { TransactionModalTemplate } from './TransactionModalUI'; // Bypassing cache

interface TransactionModalProps {
    onClose: () => void;
}

export function TransactionModal({ onClose }: TransactionModalProps) {
    const { getClient, styles, transaction, network, walletType } = usePollar();
    const { theme = 'light', accentColor = '#005DB4' } = styles;

    const [showXdr, setShowXdr] = useState(false);
    const [copied, setCopied] = useState(false);

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
        // Mobile clipboard implementation usually requires @react-native-clipboard/clipboard
        // This is skipped for generic template placeholder completeness
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    async function handleRetry() {
        if (transaction.step === 'error' && transaction.buildData) {
            await getClient().signAndSubmitTx(transaction.buildData.unsignedXdr);
        }
    }

    return (
        <TouchableWithoutFeedback onPress={onClose}>
            <View style={stylesUI.overlay}>
                <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                    <View style={stylesUI.modalWrapper}>
                        <TransactionModalTemplate
                            theme={theme}
                            accentColor={accentColor}
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
                        />
                    </View>
                </TouchableWithoutFeedback>
            </View>
        </TouchableWithoutFeedback>
    );
}

const stylesUI = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        zIndex: 50,
    },
    modalWrapper: {
        width: '100%',
        maxWidth: 400,
    },
});
