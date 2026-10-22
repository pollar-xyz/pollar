import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { RampQuote, RampQuoteRejection } from '@pollar/core';
import { rampLegTitle, rampResolutionText } from '@pollar/core';

interface RouteDisplayProps {
  quote: RampQuote;
  /** The first quote: the most received (or least sent) for the amount. */
  best?: boolean;
  disabled?: boolean;
  onSelect: (quote: RampQuote) => void;
}

const assetOf = (node: RampQuote['legs'][number]['to']) => (node.kind === 'fiat' ? node.currency : node.code);

export function RouteDisplay({ quote, best = false, disabled = false, onSelect }: RouteDisplayProps) {
  const first = quote.legs[0];
  const last = quote.legs[quote.legs.length - 1];
  return (
    <TouchableOpacity
      style={[styles.card, best && styles.recommended, disabled && { opacity: 0.5 }]}
      disabled={disabled}
      onPress={() => onSelect(quote)}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <Text style={styles.provider}>
          {first && last
            ? `${quote.amountIn} ${assetOf(first.from)} → ${quote.amountOut} ${assetOf(last.to)}`
            : quote.amountOut}
        </Text>
        <Text style={styles.meta}>{quote.legs.map((leg) => rampLegTitle(leg)).join(' · ')}</Text>
      </View>
      {best && (
        <View style={styles.right}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Best rate</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

/** A route that was planned and dropped, and what the user can do about it. */
export function RejectedRouteDisplay({ rejection }: { rejection: RampQuoteRejection }) {
  return (
    <View style={[styles.card, { opacity: 0.6 }]}>
      <View style={styles.left}>
        <Text style={styles.provider}>{rejection.legs.map((leg) => rampLegTitle(leg)).join(' · ')}</Text>
        <Text style={styles.meta}>{rampResolutionText(rejection.failure)}</Text>
      </View>
    </View>
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
    gap: 4,
  },
  right: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  provider: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  meta: {
    fontSize: 12,
    color: '#6b7280',
  },
  badge: {
    backgroundColor: '#005DB4',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
});
