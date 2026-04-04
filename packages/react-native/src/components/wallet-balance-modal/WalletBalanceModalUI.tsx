import { WalletBalanceState } from '@pollar/core';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { ModalStatusBanner, PollarModalFooter, PollarOverlay } from '../commons';

export interface WalletBalanceModalTemplateProps {
    theme: string;
    accentColor: string;
    walletBalance: WalletBalanceState;
    appName: string;
    onClose: () => void;
    onRefresh: () => void;
}

const STATUS_MESSAGES: Record<WalletBalanceState['step'], string> = {
    idle: '',
    loading: 'Fetching balances…',
    loaded: '',
    error: 'Failed to load balances',
};

export function WalletBalanceModalTemplate({
    theme,
    accentColor,
    walletBalance,
    appName,
    onClose,
    onRefresh,
}: WalletBalanceModalTemplateProps) {
    const isDark = theme === 'dark';

    const colors = {
        bg: isDark ? '#1a1a1a' : '#ffffff',
        border: isDark ? '#374151' : '#e5e7eb',
        text: isDark ? '#ffffff' : '#111827',
        muted: isDark ? '#9ca3af' : '#6b7280',
        itemBg: isDark ? '#262626' : '#f9fafb',
    };

    const isError = walletBalance.step === 'error';
    const isLoading = walletBalance.step === 'loading';
    const isLoaded = walletBalance.step === 'loaded';

    const balances = walletBalance.step === 'loaded' ? walletBalance.data.balances : [];

    return (
        <PollarOverlay onCancel={onClose}>
            <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <View style={styles.header}>
                    <Text style={[styles.title, { color: colors.text }]}>Wallet Balance</Text>
                    <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} disabled={isLoading}>
                        <Text style={{ color: colors.muted }}>🔄</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
                    <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>

                {isLoaded && balances.length === 0 && (
                    <View style={styles.emptyBox}>
                        <Text style={{ color: colors.muted, textAlign: 'center' }}>No assets found in your wallet.</Text>
                    </View>
                )}

                {isLoaded && balances.length > 0 && (
                    <FlatList
                        data={balances}
                        keyExtractor={(item) => item.code}
                        style={styles.list}
                        renderItem={({ item }) => (
                            <View style={[styles.assetRow, { backgroundColor: colors.itemBg, borderColor: colors.border }]}>
                                <View>
                                    <Text style={[styles.assetCode, { color: colors.text }]}>{item.code}</Text>
                                    <Text style={{ color: colors.muted, fontSize: 12 }}>{item.issuer ? `Issuer: ${item.issuer.slice(0, 6)}...` : 'Native'}</Text>
                                </View>
                                <Text style={[styles.assetBalance, { color: colors.text }]}>{item.balance}</Text>
                            </View>
                        )}
                    />
                )}

                {isLoading && (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={accentColor} />
                    </View>
                )}

                <ModalStatusBanner
                    message={STATUS_MESSAGES[walletBalance.step]}
                    status={isError ? 'ERROR' : isLoading ? 'LOADING' : 'NONE'}
                    onRetry={isError ? onRefresh : undefined}
                />

                <PollarModalFooter />
            </View>
        </PollarOverlay>
    );
}

const styles = StyleSheet.create({
    card: {
        width: '100%',
        borderRadius: 16,
        borderWidth: 1,
        padding: 24,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 25,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        marginTop: 10,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginRight: 12,
    },
    refreshBtn: {
        padding: 6,
    },
    iconButton: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderRadius: 6,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    closeBtn: {
        top: 16,
        right: 16,
    },
    emptyBox: {
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingBox: {
        padding: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    list: {
        maxHeight: 250,
        marginBottom: 16,
    },
    assetRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    assetCode: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2,
    },
    assetBalance: {
        fontSize: 16,
        fontWeight: '600',
    },
});
