import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, ActivityIndicator } from 'react-native';
import { ModalStatusBanner, PollarModalFooter } from '../commons';

export type RampStep = 'idle' | 'in-progress' | 'completed';

export interface RampWidgetTemplateProps {
    theme?: string;
    accentColor?: string;
    onClose: () => void;
}

export function RampWidgetTemplate({ theme = 'light', accentColor = '#005DB4', onClose }: RampWidgetTemplateProps) {
    const isDark = theme === 'dark';
    const [step, setStep] = useState<RampStep>('idle');
    const [amount, setAmount] = useState('');

    const colors = {
        bg: isDark ? '#1a1a1a' : '#ffffff',
        border: isDark ? '#374151' : '#e5e7eb',
        text: isDark ? '#ffffff' : '#111827',
        muted: isDark ? '#9ca3af' : '#6b7280',
        inputBg: isDark ? '#374151' : '#f9fafb',
    };

    const handleDeposit = () => {
        if (!amount) return;
        setStep('in-progress');
        setTimeout(() => {
            setStep('completed');
        }, 2500);
    };

    return (
        <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>Add Funds</Text>
            </View>

            <TouchableOpacity style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
                <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>

            <View style={styles.body}>
                {step === 'idle' && (
                    <>
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                                placeholder="25.00"
                                placeholderTextColor={colors.muted}
                                keyboardType="numeric"
                                value={amount}
                                onChangeText={setAmount}
                            />
                        </View>
                        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor, opacity: amount ? 1 : 0.5 }]} disabled={!amount} onPress={handleDeposit}>
                            <Text style={styles.primaryBtnText}>Deposit</Text>
                        </TouchableOpacity>
                    </>
                )}

                {step === 'in-progress' && (
                    <View style={styles.statusBox}>
                        <ActivityIndicator size="large" color={accentColor} />
                        <Text style={{ color: colors.text, marginTop: 16, fontSize: 16 }}>Processing Payment...</Text>
                    </View>
                )}

                {step === 'completed' && (
                    <View style={styles.statusBox}>
                        <Text style={{ fontSize: 40, marginBottom: 12 }}>🏁</Text>
                        <Text style={[styles.title, { color: colors.text }]}>Funds Added</Text>
                        <Text style={{ color: colors.muted, marginTop: 8 }}>Your transaction was successful.</Text>
                        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor, marginTop: 24 }]} onPress={onClose}>
                            <Text style={styles.primaryBtnText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <PollarModalFooter />
        </View>
    );
}

export function RampWidget({ onClose }: { onClose: () => void }) {
    return (
        <View style={styles.overlay}>
            <View style={styles.modalWrapper}>
                <RampWidgetTemplate onClose={onClose} />
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
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    input: {
        height: 48,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 16,
        fontSize: 18,
    },
    primaryBtn: {
        width: '100%',
        height: 48,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    primaryBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    statusBox: {
        paddingVertical: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
