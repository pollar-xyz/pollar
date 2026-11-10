import { useInheritedLanguage } from '../language-context';
import type { PollarLanguage } from '@pollar/core';
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COMMONS_COPY } from './commons-copy';

// --- Shared amount field --------------------------------------------------------
// The native twin of the web AmountField: label on the left, "Available: X CODE" on
// the right, and Max + unit inside the input. The balance comes in as `available`
// (from `useWalletAvailable` for a wallet asset).
// -----------------------------------------------------------------------------

interface AmountFieldProps {
  theme?: string | undefined;
  accentColor?: string | undefined;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The suffix inside the input: an asset code or a fiat currency. */
  unit?: string | undefined;
  /**
   * What can be spent, in `unit`. Undefined hides the hint and Max (a fiat amount,
   * or a balance not read yet); null is a chain that could not be read.
   */
  available?: string | null | undefined;
  /** Replaces filling in the whole `available`, for a max that leaves a fee behind. */
  onMax?: (() => void) | undefined;
  placeholder?: string | undefined;
  language?: PollarLanguage | undefined;
}

// An unreadable chain shows a dash, never 0: a wallet that failed to load must not look empty.
function formatAvailable(available: string | null): string {
  if (available === null) return '—';
  const n = parseFloat(available);
  return isNaN(n) ? available : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

export function AmountField({
  theme = 'light',
  accentColor = '#005DB4',
  label,
  value,
  onChange,
  unit,
  available,
  onMax,
  placeholder = '0.00',
  language: languageProp,
}: AmountFieldProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = COMMONS_COPY[language];
  const isDark = theme === 'dark';
  const colors = {
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#374151' : '#e5e7eb',
    inputBg: isDark ? '#374151' : '#f9fafb',
  };
  const showBalance = available !== undefined;
  const canMax = showBalance && available !== null && parseFloat(available) > 0;

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
        {showBalance && (
          <Text style={[styles.hint, { color: colors.muted }]} numberOfLines={1}>
            {copy.available} {formatAvailable(available)} {unit ?? ''}
          </Text>
        )}
      </View>
      <View style={[styles.shell, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          value={value}
          onChangeText={onChange}
          accessibilityLabel={label}
        />
        {showBalance && (
          <TouchableOpacity
            style={[styles.max, { backgroundColor: `${accentColor}1A`, opacity: canMax ? 1 : 0.45 }]}
            disabled={!canMax}
            onPress={() => (onMax ? onMax() : available && onChange(available))}
            accessibilityLabel={copy.max}
          >
            <Text style={[styles.maxText, { color: accentColor }]}>{copy.max}</Text>
          </TouchableOpacity>
        )}
        {unit ? <Text style={[styles.unit, { color: colors.muted }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    flexShrink: 1,
    fontSize: 12,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 12,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 20,
    fontWeight: '500',
  },
  max: {
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 6,
    justifyContent: 'center',
  },
  maxText: {
    fontSize: 12,
    fontWeight: '700',
  },
  unit: {
    fontSize: 12,
    fontWeight: '700',
  },
});
