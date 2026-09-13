import { TransactionState, WalletType } from '@pollar/core';
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking, Image } from 'react-native';
import { LOGO_ALBEDO, LOGO_FREIGHTER, LOGO_POLLAR } from '../../constants';
import { ModalStatusBanner, PollarModalFooter, PollarOverlay } from '../commons';

export interface TransactionModalTemplateProps {
    theme: string;
    accentColor: string;
    transaction: TransactionState;
    showXdr: boolean;
    copied: boolean;
    explorerUrl: string | null;
    walletType?: WalletType | null;
    onClose: () => void;
    onSignAndSend: () => void;
    onToggleXdr: () => void;
    onCopyHash: () => void;
    onRetry?: () => void;
}

const STATUS_MESSAGES: Record<TransactionState['step'], string> = {
    idle: '',
    building: 'Building transaction…',
    built: 'Ready to sign and send',
    signing: 'Signing and sending transaction…',
    success: 'Transaction sent successfully',
    error: 'Transaction failed',
};

export function TransactionModalTemplate({
    theme,
    accentColor,
    transaction,
    showXdr,
    copied,
    explorerUrl,
    walletType,
    onClose,
    onSignAndSend,
    onToggleXdr,
    onCopyHash,
    onRetry,
}: TransactionModalTemplateProps) {
    const isDark = theme === 'dark';

    const colors = {
        bg: isDark ? '#1a1a1a' : '#ffffff',
        border: isDark ? '#374151' : '#e5e7eb',
        text: isDark ? '#ffffff' : '#111827',
        muted: isDark ? '#9ca3af' : '#6b7280',
        inputBg: isDark ? '#374151' : '#f9fafb',
        errorBg: isDark ? '#2a1515' : '#fef2f2',
        errorText: isDark ? '#f87171' : '#dc2626',
    };

    const buildData = 'buildData' in transaction ? transaction.buildData : null;
    const hash = transaction.step === 'success' ? transaction.hash : null;
    const errorDetails = transaction.step === 'error' ? (transaction.details ?? null) : null;

    const isBuilt = transaction.step === 'built';
    const isSigning = transaction.step === 'signing';
    const isSuccess = transaction.step === 'success';
    const isError = transaction.step === 'error';
    const showDetails = buildData !== null && (isBuilt || isSigning || isSuccess);

    return (
        <PollarOverlay onCancel={onClose}>
            <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <View style={styles.header}>
                    <Text style={[styles.title, { color: colors.text }]}>Transaction</Text>
                </View>

                <TouchableOpacity style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
                    <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>

                {showDetails && buildData && (
                    <ScrollView style={styles.contentWrap}>
                        <View style={styles.summaryBox}>
                            <Text style={[styles.summaryTitle, { color: colors.muted }]}>Details</Text>
                            {buildData.summary.lines.map((line, i) => (
                                <Text key={i} style={[styles.summaryLine, { color: colors.text }]}>• {line}</Text>
                            ))}
                        </View>

                        <View style={styles.metaBox}>
                            <View style={styles.metaRow}>
                                <Text style={{ color: colors.muted }}>Network</Text>
                                <Text style={{ color: colors.text, fontWeight: '600' }}>{buildData.summary.network}</Text>
                            </View>
                            <View style={styles.metaRow}>
                                <Text style={{ color: colors.muted }}>Fee</Text>
                                <Text style={{ color: colors.text, fontWeight: '600' }}>{buildData.summary.fee}</Text>
                            </View>
                        </View>

                        <View style={styles.xdrBox}>
                            <TouchableOpacity onPress={onToggleXdr} style={styles.xdrToggleBtn}>
                                <Text style={{ color: colors.muted }}>Raw transaction (XDR) {showXdr ? '▼' : '▶'}</Text>
                            </TouchableOpacity>
                            {showXdr && (
                                <View style={[styles.xdrContentContainer, { backgroundColor: colors.inputBg }]}>
                                    <Text style={{ color: colors.text, fontSize: 12 }}>{buildData.unsignedXdr}</Text>
                                </View>
                            )}
                        </View>
                    </ScrollView>
                )}

                {isError && errorDetails && (
                    <View style={[styles.errorBox, { backgroundColor: colors.errorBg }]}>
                        <Text style={{ color: colors.errorText, fontWeight: '600', marginBottom: 4 }}>Error details</Text>
                        <Text style={{ color: colors.errorText, fontSize: 12 }}>{errorDetails}</Text>
                    </View>
                )}

                {isBuilt && (
                    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={onSignAndSend}>
                        <Text style={styles.primaryBtnText}>Sign & Send</Text>
                    </TouchableOpacity>
                )}

                {(isSigning || isSuccess || isError) && (
                    <View style={styles.walletSpinnerBox}>
                        <View style={styles.walletIconContainer}>
                            <Image
                                source={{
                                    uri: walletType === WalletType.FREIGHTER
                                        ? LOGO_FREIGHTER
                                        : walletType === WalletType.ALBEDO
                                            ? LOGO_ALBEDO
                                            : LOGO_POLLAR
                                }}
                                style={styles.walletImage}
                            />
                        </View>

                        {isSigning && (
                            <Text style={[styles.spinnerText, { color: colors.text }]}>
                                {walletType === WalletType.FREIGHTER
                                    ? 'Waiting for Freighter…'
                                    : walletType === WalletType.ALBEDO
                                        ? 'Waiting for Albedo…'
                                        : 'Signing and sending…'}
                            </Text>
                        )}

                        {isError && onRetry && buildData && (
                            <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={onRetry}>
                                <Text style={[styles.secondaryBtnText, { color: colors.muted }]}>Try again</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {isSuccess && hash && (
                    <View style={styles.resultBox}>
                        <Text style={[styles.resultLabel, { color: colors.muted }]}>Transaction hash</Text>
                        <Text style={[styles.resultHash, { color: colors.text }]} numberOfLines={1} ellipsizeMode="middle">{hash}</Text>
                        <View style={styles.resultActions}>
                            <TouchableOpacity style={[styles.resultBtn, { borderColor: colors.border }]} onPress={onCopyHash}>
                                <Text style={[styles.resultBtnText, { color: colors.text }]}>{copied ? '✅ Copied!' : '📋 Copy hash'}</Text>
                            </TouchableOpacity>
                            {explorerUrl && (
                                <TouchableOpacity style={[styles.resultBtn, { borderColor: colors.border }]} onPress={() => Linking.openURL(explorerUrl)}>
                                    <Text style={[styles.resultBtnText, { color: colors.text }]}>🌐 View on Explorer</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {isSuccess && (
                    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={onClose}>
                        <Text style={styles.primaryBtnText}>Done</Text>
                    </TouchableOpacity>
                )}

                <ModalStatusBanner
                    message={STATUS_MESSAGES[transaction.step] || ''}
                    status={isError ? 'ERROR' : isSigning || transaction.step === 'building' ? 'LOADING' : isSuccess ? 'SUCCESS' : 'NONE'}
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
        marginBottom: 20,
        marginTop: 10,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
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
    contentWrap: {
        maxHeight: 200,
        marginBottom: 16,
    },
    summaryBox: {
        marginBottom: 12,
    },
    summaryTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    summaryLine: {
        fontSize: 14,
        marginBottom: 4,
    },
    metaBox: {
        marginVertical: 12,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    xdrBox: {
        marginTop: 10,
    },
    xdrToggleBtn: {
        paddingVertical: 8,
    },
    xdrContentContainer: {
        padding: 10,
        borderRadius: 6,
        marginTop: 8,
    },
    errorBox: {
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    primaryBtn: {
        width: '100%',
        height: 44,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
    },
    primaryBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    secondaryBtn: {
        height: 44,
        borderWidth: 1,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginTop: 16,
    },
    secondaryBtnText: {
        fontSize: 14,
        fontWeight: '600',
    },
    walletSpinnerBox: {
        alignItems: 'center',
        marginVertical: 20,
    },
    walletIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 2,
        borderColor: '#005DB4',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    walletImage: {
        width: 32,
        height: 32,
    },
    spinnerText: {
        fontSize: 16,
    },
    resultBox: {
        alignItems: 'center',
        marginTop: 12,
        marginBottom: 16,
    },
    resultLabel: {
        fontSize: 12,
        marginBottom: 4,
    },
    resultHash: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 12,
    },
    resultActions: {
        flexDirection: 'row',
        gap: 8,
    },
    resultBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderRadius: 6,
    },
    resultBtnText: {
        fontSize: 12,
        fontWeight: '500',
    },
});
