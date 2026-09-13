import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { ModalStatusBanner, PollarModalFooter } from '../commons';

export type KycStep = 'idle' | 'in-progress' | 'approved';

export interface KycModalTemplateProps {
    theme?: string | undefined;
    accentColor?: string | undefined;
    country?: string | undefined;
    level?: 'basic' | 'intermediate' | 'enhanced' | undefined;
    onClose: () => void;
    onApproved?: (() => void) | undefined;
}

export function KycModalTemplate({
    theme = 'light',
    accentColor = '#005DB4',
    country,
    level = 'basic',
    onClose,
    onApproved,
}: KycModalTemplateProps) {
    const isDark = theme === 'dark';
    const [step, setStep] = useState<KycStep>('idle');

    const colors = {
        bg: isDark ? '#1a1a1a' : '#ffffff',
        border: isDark ? '#374151' : '#e5e7eb',
        text: isDark ? '#ffffff' : '#111827',
        muted: isDark ? '#9ca3af' : '#6b7280',
        itemBg: isDark ? '#262626' : '#f9fafb',
        successText: isDark ? '#4ade80' : '#16a34a',
    };

    const simulateKyc = () => {
        setStep('in-progress');
        setTimeout(() => {
            setStep('approved');
            if (onApproved) onApproved();
        }, 2000);
    };

    return (
        <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>Identity Verification</Text>
            </View>

            <TouchableOpacity style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
                <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>

            <View style={styles.body}>
                <Text style={[styles.description, { color: colors.muted }]}>
                    Please verify your identity to access {level} features. {country ? `Region: ${country}` : ''}
                </Text>

                {step === 'idle' && (
                    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={simulateKyc}>
                        <Text style={styles.primaryBtnText}>Start Verification</Text>
                    </TouchableOpacity>
                )}

                {step === 'in-progress' && (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={accentColor} />
                        <Text style={{ color: colors.text, marginTop: 12 }}>Verifying your identity...</Text>
                    </View>
                )}

                {step === 'approved' && (
                    <View style={styles.successBox}>
                        <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
                        <Text style={[styles.successText, { color: colors.successText }]}>Verification Complete</Text>
                        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor, marginTop: 16 }]} onPress={onClose}>
                            <Text style={styles.primaryBtnText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <ModalStatusBanner
                message={step === 'in-progress' ? 'Processing…' : step === 'approved' ? 'Success' : ''}
                status={step === 'in-progress' ? 'LOADING' : step === 'approved' ? 'SUCCESS' : 'NONE'}
            />

            <PollarModalFooter />
        </View>
    );
}

export function KycModal({ onClose, country, level, onApproved }: { onClose: () => void, country?: string, level?: 'basic' | 'intermediate' | 'enhanced', onApproved?: () => void }) {
    return (
        <View style={styles.overlay}>
            <View style={styles.modalWrapper}>
                <KycModalTemplate
                    onClose={onClose}
                    country={country}
                    level={level}
                    onApproved={onApproved}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
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
        marginBottom: 16,
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
    body: {
        marginVertical: 12,
    },
    description: {
        fontSize: 14,
        marginBottom: 20,
        lineHeight: 20,
    },
    primaryBtn: {
        width: '100%',
        height: 44,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    primaryBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    loadingBox: {
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    successBox: {
        paddingtop: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    successText: {
        fontSize: 18,
        fontWeight: '600',
    },
});
