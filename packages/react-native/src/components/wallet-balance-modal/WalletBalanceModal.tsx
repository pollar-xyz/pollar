import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { usePollar } from '../../context';
import { WalletBalanceModalTemplate } from './WalletBalanceModalUI'; // Bypassing cache

export interface WalletBalanceModalProps {
    onClose: () => void;
}

export function WalletBalanceModal({ onClose }: WalletBalanceModalProps) {
    const { styles, walletBalance, refreshBalance, config } = usePollar();
    const { theme = 'light', accentColor = '#005DB4' } = styles;

    useEffect(() => {
        refreshBalance();
        const interval = setInterval(() => {
            refreshBalance();
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    return (
        <TouchableWithoutFeedback onPress={onClose}>
            <View style={stylesUI.overlay}>
                <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                    <View style={stylesUI.modalWrapper}>
                        <WalletBalanceModalTemplate
                            theme={theme}
                            accentColor={accentColor}
                            walletBalance={walletBalance}
                            appName={config.application?.name ?? 'Pollar'}
                            onClose={onClose}
                            onRefresh={() => refreshBalance()}
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
