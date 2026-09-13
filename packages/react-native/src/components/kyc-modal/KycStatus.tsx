import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { KycStatus as KycStatusValue } from '@pollar/core';

interface KycStatusProps {
    status: KycStatusValue;
}

const STATUS_CONFIG: Record<KycStatusValue, { label: string; color: string; dot: boolean }> = {
    none: { label: 'Not started', color: '#6b7280', dot: false },
    pending: { label: 'Pending review', color: '#f59e0b', dot: true },
    approved: { label: 'Verified', color: '#10b981', dot: false },
    rejected: { label: 'Rejected', color: '#ef4444', dot: false },
};

export function KycStatus({ status }: KycStatusProps) {
    const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.none;
    return (
        <View style={[styles.badge, { borderColor: config.color }]}>
            {config.dot && <View style={[styles.dot, { backgroundColor: config.color }]} />}
            <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 9999,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
    },
});
