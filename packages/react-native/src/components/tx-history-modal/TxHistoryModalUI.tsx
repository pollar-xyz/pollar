import { TxHistoryState } from '@pollar/core';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Linking } from 'react-native';
import { ModalStatusBanner, PollarModalFooter, PollarOverlay } from '../commons';

export interface TxHistoryModalTemplateProps {
    theme: string;
    accentColor: string;
    txHistory: TxHistoryState;
    onClose: () => void;
    onRefresh: () => void;
}

const STATUS_MESSAGES: Record<TxHistoryState['step'], string> = {
    idle: '',
    loading: 'Loading history…',
    loaded: '',
    error: 'Failed to load history',
};

export function TxHistoryModalTemplate({
    theme,
    accentColor,
    txHistory,
    onClose,
    onRefresh,
}: TxHistoryModalTemplateProps) {
    const isDark = theme === 'dark';

    const colors = {
        bg: isDark ? '#1a1a1a' : '#ffffff',
        border: isDark ? '#374151' : '#e5e7eb',
        text: isDark ? '#ffffff' : '#111827',
        muted: isDark ? '#9ca3af' : '#6b7280',
        itemBg: isDark ? '#262626' : '#f9fafb',
        successText: isDark ? '#4ade80' : '#16a34a',
    };

    const isError = txHistory.step === 'error';
    const isLoading = txHistory.step === 'loading';
    const isLoaded = txHistory.step === 'loaded';

    const transactions = txHistory.step === 'loaded' ? txHistory.data.records : [];

    return (
        <PollarOverlay onCancel={onClose}>
            <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <View style={styles.header}>
                    <Text style={[styles.title, { color: colors.text }]}>Transaction History</Text>
                    <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} disabled={isLoading}>
                        <Text style={{ color: colors.muted }}>🔄</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
                    <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>

                {isLoaded && transactions.length === 0 && (
                    <View style={styles.emptyBox}>
                        <Text style={{ color: colors.muted, textAlign: 'center' }}>No transactions found.</Text>
                    </View>
                )}

                {isLoaded && transactions.length > 0 && (
                    <FlatList
                        data={transactions}
                        keyExtractor={(item) => item.hash}
                        style={styles.list}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.txRow, { backgroundColor: colors.itemBg, borderColor: colors.border }]}
                                onPress={() => Linking.openURL(`https://stellar.expert/explorer/${item.network}/tx/${item.hash}`)}
                            >
                                <View style={styles.txRowLeft}>
                                    <Text style={[styles.txType, { color: colors.text }]}>{item.operation || 'Transaction'}</Text>
                                    <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                                </View>
                                <View style={styles.txRowRight}>
                                    <Text style={[styles.txStatus, { color: item.status === 'SUCCESS' ? colors.successText : (item.status === 'PENDING' ? '#f59e0b' : '#ef4444') }]}>
                                        {item.status === 'SUCCESS' ? 'Success' : item.status === 'PENDING' ? 'Pending' : 'Failed'}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                )}

                {isLoading && (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={accentColor} />
                    </View>
                )}

                <ModalStatusBanner
                    message={STATUS_MESSAGES[txHistory.step] || ''}
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
        maxHeight: 300,
        marginBottom: 16,
    },
    txRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    txRowLeft: {},
    txType: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 2,
        textTransform: 'capitalize',
    },
    txRowRight: {
        alignItems: 'flex-end',
    },
    txStatus: {
        fontSize: 13,
        fontWeight: '700',
    },
});
