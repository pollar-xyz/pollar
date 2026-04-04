import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { RampQuote } from '@pollar/core';

interface RouteDisplayProps {
    quote: RampQuote;
    onSelect: (quote: RampQuote) => void;
}

const RAIL_LABELS: Record<string, string> = {
    SPEI: 'SPEI (Mexico)',
    PIX: 'PIX (Brazil)',
    PSE: 'PSE (Colombia)',
    ACH: 'ACH (US)',
};

export function RouteDisplay({ quote, onSelect }: RouteDisplayProps) {
    return (
        <TouchableOpacity
            style={[styles.card, quote.recommended && styles.recommended]}
            onPress={() => onSelect(quote)}
            activeOpacity={0.7}
        >
            <View style={styles.left}>
                <Text style={styles.provider}>{quote.provider}</Text>
                <Text style={styles.meta}>
                    {RAIL_LABELS[quote.rail] ?? quote.rail} · {quote.protocol} · {quote.estimatedTime}
                </Text>
            </View>
            <View style={styles.right}>
                <Text style={styles.fee}>{quote.fee}% fee</Text>
                {quote.recommended && (
                    <View style={styles.badgeContainer}>
                        <Text style={styles.badgeText}>Best rate</Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        backgroundColor: '#ffffff',
        marginBottom: 8,
    },
    recommended: {
        borderColor: '#005DB4',
        backgroundColor: '#f0f7ff',
    },
    left: {
        flex: 1,
        marginRight: 12,
    },
    provider: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    meta: {
        fontSize: 12,
        color: '#6b7280',
    },
    right: {
        alignItems: 'flex-end',
    },
    fee: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
    },
    badgeContainer: {
        marginTop: 4,
        backgroundColor: '#005DB4',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 9999,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#ffffff',
    },
});
