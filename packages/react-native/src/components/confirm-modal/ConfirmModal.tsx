import type { PendingConfirmation } from '@pollar/core';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { CONFIRM_COPY } from './confirm-copy';

type Copy = (typeof CONFIRM_COPY)['en'];
import { PollarModalFooter, PollarOverlay } from '../commons';

interface ConfirmModalProps {
  confirmation: PendingConfirmation;
}

function labelOf(confirmation: PendingConfirmation, copy: Copy): string {
  const op = confirmation.operation ?? '';
  return copy.operations[op] ?? (op ? op.replace(/_/g, ' ') : copy.transaction);
}

function crop(value: string): string {
  return value.length > 16 ? `${value.slice(0, 6)}...${value.slice(-6)}` : value;
}

function detailRows(confirmation: PendingConfirmation, copy: Copy): Array<[string, string]> {
  const details = confirmation.details ?? {};
  const rows: Array<[string, string]> = [];
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    rows.push([label, /^[GC][A-Z2-7]{55}$/.test(text) ? crop(text) : text]);
  };
  push(copy.rows.destination, details.destination);
  push(copy.rows.amount, details.amount);
  push(copy.rows.asset, details.asset ?? details.assetCode ?? details.mint);
  push(copy.rows.network, confirmation.network);
  return rows;
}

/**
 * The prompt a signing call waits on under `confirmation: 'prompt'`, the same
 * for every custody: the wallet signs only after the user confirms here.
 * Dismissing it declines.
 */
export function ConfirmModal({ confirmation }: ConfirmModalProps) {
  const { getClient, styles } = usePollar();
  const copy = CONFIRM_COPY[useModalLanguage()];
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
  };

  // A session that ends while the prompt is open declines it: the call must
  // not stay suspended on a user who is no longer there.
  const rejectRef = useRef(confirmation.reject);
  rejectRef.current = confirmation.reject;
  useEffect(() => {
    return getClient().onAuthStateChange((authState) => {
      if (authState.step === 'idle') rejectRef.current();
    });
  }, [getClient]);

  return (
    <PollarOverlay onCancel={confirmation.reject}>
      <View style={[localStyles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <View style={localStyles.header}>
          <Text style={[localStyles.title, { color: colors.text }]}>{copy.title}</Text>
          <TouchableOpacity onPress={confirmation.reject} accessibilityLabel="Close">
            <Text style={{ color: colors.muted, fontSize: 18 }}>x</Text>
          </TouchableOpacity>
        </View>

        <View style={[localStyles.detail, { borderColor: colors.border }]}>
          <Text style={[localStyles.detailTitle, { color: colors.text }]}>{labelOf(confirmation, copy)}</Text>
          <Text style={{ color: colors.muted }}>{copy.intro}</Text>
          {detailRows(confirmation, copy).map(([k, v]) => (
            <View key={k} style={localStyles.row}>
              <Text style={{ color: colors.muted }}>{k}</Text>
              <Text style={{ color: colors.text, flexShrink: 1, textAlign: 'right' }}>{v}</Text>
            </View>
          ))}

          <View style={localStyles.actions}>
            <TouchableOpacity onPress={confirmation.reject} style={[localStyles.btn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{copy.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmation.confirm}
              style={[localStyles.btn, { backgroundColor: accentColor, borderColor: accentColor }]}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>{copy.confirm}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <PollarModalFooter />
      </View>
    </PollarOverlay>
  );
}

const localStyles = StyleSheet.create({
  card: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '600' },
  detail: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  detailTitle: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
});
