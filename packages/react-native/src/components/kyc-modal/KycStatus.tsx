import { useInheritedLanguage } from '../../language-context';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { KycStatus as KycStatusValue, PollarLanguage } from '@pollar/core';
import { KYC_COPY } from './kyc-copy';

interface KycStatusProps {
  status: KycStatusValue;
  /** Replaces the status label, keeping its color. */
  label?: string | undefined;
  /** Language of the status label. Defaults to the user's device. */
  language?: PollarLanguage | undefined;
}

const STATUS_CONFIG: Record<KycStatusValue, { color: string; dot: boolean }> = {
  none: { color: '#6b7280', dot: false },
  pending: { color: '#f59e0b', dot: true },
  approved: { color: '#10b981', dot: false },
  rejected: { color: '#ef4444', dot: false },
  expired: { color: '#6b7280', dot: false },
};

export function KycStatus({ status, label, language: languageProp }: KycStatusProps) {
  const language = useInheritedLanguage(languageProp);
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.none;
  const statusText = KYC_COPY[language].status;
  return (
    <View style={[styles.badge, { borderColor: config.color }]}>
      {config.dot && <View style={[styles.dot, { backgroundColor: config.color }]} />}
      <Text style={[styles.label, { color: config.color }]}>{label ?? statusText[status] ?? statusText.none}</Text>
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
