import type { CosignCustody, CustodyMigrationState } from '@pollar/core';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PollarModalFooter } from '../commons';

export interface CustodyMigrationModalTemplateProps {
  theme: string;
  accentColor: string;
  state: CustodyMigrationState;
  busy: boolean;
  error: string | null;
  /** What still points at a wallet that cannot move yet (an open ramp order, a transaction in flight). */
  blockedReasons: string[] | null;
  onMove: (custody?: CosignCustody) => void;
  /** Only offered while a wallet is blocked: the move waits for what is pending. */
  onLater: () => void;
  onLogout: () => void;
}

const CHAIN_NAME: Record<string, string> = { STELLAR: 'Stellar', SOLANA: 'Solana', POLYGON: 'Polygon' };
const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const SELF_CUSTODY_RISKS =
  'In a self-custody wallet only your device can sign. If you lose this device and every recovery method, nobody can recover the wallet or its funds, not the app and not Pollar. Nobody can undo or freeze a transaction you sign.';

/**
 * The move of the wallets Pollar custodies to ones the user's device signs for.
 * It cannot be put off: the app's wallets live in Turnkey now, so the only ways
 * out are moving or logging out, unless something still pending holds a
 * wallet back.
 */
export function CustodyMigrationModalTemplate(p: CustodyMigrationModalTemplateProps) {
  const isDark = p.theme === 'dark';
  const colors = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    errorText: isDark ? '#f87171' : '#b91c1c',
    warnBg: isDark ? '#2a2212' : '#fffbeb',
    warnText: isDark ? '#fbbf24' : '#92400e',
  };
  const [pick, setPick] = useState<CosignCustody | null>(p.state.choice ? null : p.state.toCustody);
  const [risksAccepted, setRisksAccepted] = useState(false);
  const custody = p.state.choice ? pick : p.state.toCustody;
  const canMove = !!custody && (custody !== 'SELF_CUSTODY' || risksAccepted) && !p.busy;
  const moving = p.state.wallets.filter((w) => w.required);
  const changing = moving.filter((w) => w.addressChanges);
  const failed = moving.some((w) => w.status === 'FAILED');

  const option = (value: CosignCustody, label: string) => (
    <TouchableOpacity
      accessibilityRole="radio"
      accessibilityState={{ checked: pick === value }}
      accessibilityLabel={label}
      onPress={() => setPick(value)}
      style={[styles.option, { borderColor: pick === value ? p.accentColor : colors.border }]}
    >
      <Text style={{ color: colors.text }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Move your wallets to this device</Text>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.body}>
        <Text style={{ color: colors.muted }}>
          Until now Pollar held the keys of your wallets. This app now keeps wallets on its users&apos; devices, so they move
          here, with everything they hold.
        </Text>
        <Text style={[styles.section, { color: colors.text }]}>What moves</Text>
        {moving.map((w) => (
          <View key={w.chain} style={styles.item}>
            <Text style={{ color: colors.text, flexShrink: 1 }}>
              {CHAIN_NAME[w.chain] ?? w.chain} · {short(w.address)}
            </Text>
            <Text style={{ color: colors.muted }}>{w.addressChanges ? 'New address' : 'Same address'}</Text>
          </View>
        ))}
        {changing.length > 0 && (
          <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors.warnBg }]}>
            <Text style={{ color: colors.warnText }}>
              Your {changing.map((w) => CHAIN_NAME[w.chain] ?? w.chain).join(' and ')} address changes: every token and the
              balance go to a new address on this device. Stop sharing the old one; anything sent there later needs help from
              support to recover.
            </Text>
          </View>
        )}
        {p.state.choice && (
          <>
            <Text style={[styles.section, { color: colors.text }]}>Choose how your wallet signs</Text>
            {option(
              'COSIGNED',
              'Co-signed: you and the app approve every signature together, and the wallet can be recovered with help.',
            )}
            {option('SELF_CUSTODY', 'Self-custody: only your device signs. Nobody else can move or recover your funds.')}
          </>
        )}
        {custody === 'SELF_CUSTODY' && (
          <>
            <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors.warnBg }]}>
              <Text style={{ color: colors.warnText }}>{SELF_CUSTODY_RISKS}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityState={{ checked: risksAccepted }}
              onPress={() => setRisksAccepted((v) => !v)}
              style={styles.check}
            >
              <View
                style={[
                  styles.box,
                  { borderColor: colors.border },
                  risksAccepted ? { backgroundColor: p.accentColor, borderColor: p.accentColor } : null,
                ]}
              />
              <Text style={{ color: colors.text, flexShrink: 1 }}>I understand and accept these risks</Text>
            </TouchableOpacity>
          </>
        )}
        {failed && !p.error ? (
          <Text style={{ color: colors.errorText }}>
            The last attempt did not finish. What did not move is still where it was; try again.
          </Text>
        ) : null}
        {p.blockedReasons ? (
          <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors.warnBg }]}>
            <Text style={{ color: colors.warnText }}>
              A wallet cannot move while something still uses it: {p.blockedReasons.join(', ')}. Let it finish and try again.
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Move my wallets"
          accessibilityState={{ disabled: !canMove }}
          disabled={!canMove}
          onPress={() => custody && p.onMove(p.state.choice ? custody : undefined)}
          style={[styles.btn, { backgroundColor: p.accentColor, borderColor: p.accentColor, opacity: canMove ? 1 : 0.55 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>{p.busy ? 'Moving your wallets...' : 'Move my wallets'}</Text>
        </TouchableOpacity>
        {p.blockedReasons ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Continue for now"
            disabled={p.busy}
            onPress={p.onLater}
            style={[styles.btn, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.text, fontWeight: '600' }}>Continue for now</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Log out"
          disabled={p.busy}
          onPress={p.onLogout}
          style={[styles.btn, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.text, fontWeight: '600' }}>Log out</Text>
        </TouchableOpacity>
        {p.error ? (
          <Text accessibilityRole="alert" style={{ color: colors.errorText }}>
            {p.error}
          </Text>
        ) : null}
      </ScrollView>
      <PollarModalFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 16 },
  title: { fontSize: 17, fontWeight: '600', marginBottom: 12 },
  body: { gap: 10 },
  section: { fontSize: 15, fontWeight: '600' },
  option: { borderWidth: 1, borderRadius: 10, padding: 10 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  banner: { borderRadius: 10, padding: 10 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5 },
  btn: { alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
});
