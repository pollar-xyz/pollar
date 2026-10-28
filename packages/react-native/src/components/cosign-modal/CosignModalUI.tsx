import { useInheritedLanguage } from '../../language-context';
import { type CosignRequest, type CosignVerification, fromBaseUnits, type PollarLanguage } from '@pollar/core';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PollarModalFooter } from '../commons';
import { COSIGN_COPY } from './cosign-copy';

type CosignCopy = (typeof COSIGN_COPY)[PollarLanguage];

export interface CosignModalTemplateProps {
  theme: string;
  accentColor: string;
  pending: CosignRequest[];
  current: CosignRequest | null;
  verification: CosignVerification | null;
  busy: 'approving' | 'rejecting' | null;
  error: string | null;
  lastResolved?: CosignRequest;
  /** Seconds until the modal closes on its own, while what it shows needs nothing from the user. */
  closesIn?: number | null;
  /** The approval coming next in the same flow, shown while the modal waits for it. */
  nextStep?: string | null;
  /** The transaction hash was just copied. */
  copied?: boolean;
  /** Language of the modal's text; the device's when not given. */
  language?: PollarLanguage | undefined;
  onCopyHash: (hash: string) => void;
  onSelect: (request: CosignRequest) => void;
  onApprove: (request: CosignRequest) => void;
  onReject: (request: CosignRequest) => void;
  onClose: () => void;
}

function labelOf(request: CosignRequest, copy: CosignCopy): string {
  const op = request.operation ?? '';
  return copy.operations[op] ?? (op ? op.replace(/_/g, ' ') : copy.transaction);
}

function crop(value: string): string {
  return value.length > 16 ? `${value.slice(0, 6)}...${value.slice(-6)}` : value;
}

function expiresIn(request: CosignRequest, copy: CosignCopy): string {
  const ms = new Date(request.expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return copy.expired;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** A base-unit amount with the `decimals` and `symbol` written next to it, as the user reads it; null when either is missing. */
function readableAmount(details: Record<string, unknown>): { amount: string; symbol: string } | null {
  const { amount, decimals, symbol } = details;
  if (typeof amount !== 'string' || typeof decimals !== 'number' || typeof symbol !== 'string') return null;
  try {
    return { amount: fromBaseUnits(amount, decimals), symbol };
  } catch {
    return null;
  }
}

function detailRows(request: CosignRequest, copy: CosignCopy): Array<[string, string]> {
  const details = (request.details ?? {}) as Record<string, unknown>;
  const rows: Array<[string, string]> = [];
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    const text = String(value);
    rows.push([label, /^[GC][A-Z2-7]{55}$/.test(text) ? crop(text) : text]);
  };
  push(copy.rows.destination, details.destination);
  const readable = readableAmount(details);
  push(copy.rows.amount, readable ? `${readable.amount} ${readable.symbol}` : details.amount);
  push(copy.rows.asset, details.asset ?? details.assetCode ?? readable?.symbol);
  push(copy.rows.network, request.network);
  rows.push([copy.expiresIn, expiresIn(request, copy)]);
  return rows;
}

export function CosignModalTemplate({
  theme,
  accentColor,
  pending,
  current,
  verification,
  busy,
  error,
  lastResolved,
  closesIn = null,
  nextStep = null,
  copied = false,
  language: languageProp,
  onCopyHash,
  onSelect,
  onApprove,
  onReject,
  onClose,
}: CosignModalTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = COSIGN_COPY[language];
  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    errorBg: isDark ? '#2a1515' : '#fef2f2',
    errorText: isDark ? '#f87171' : '#b91c1c',
    okText: isDark ? '#4ade80' : '#15803d',
  };
  const canVote = !!current && verification?.ok === true && !busy;
  // Keyed by request id, so the explanation folds back when another request is shown.
  const [verifiedOpenFor, setVerifiedOpenFor] = useState<string | null>(null);
  const verifiedOpen = !!current && verifiedOpenFor === current.id;

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
        <TouchableOpacity onPress={onClose} accessibilityLabel={copy.close}>
          <Text style={{ color: colors.muted, fontSize: 18 }}>x</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ maxHeight: 460 }}>
        {pending.length === 0 && (
          <View style={styles.empty}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {lastResolved ? (copy.status[lastResolved.status] ?? lastResolved.status.toLowerCase()) : copy.nothingWaiting}
            </Text>
            {lastResolved?.submit?.hash && (
              <View style={styles.hashRow}>
                <Text style={{ color: colors.muted }}>
                  {copy.sentTransaction} {crop(lastResolved.submit.hash)}
                </Text>
                <TouchableOpacity
                  onPress={() => onCopyHash(lastResolved.submit!.hash)}
                  accessibilityLabel={copied ? copy.copied : copy.copyHash}
                >
                  <Text style={{ color: accentColor, fontWeight: '600' }}>{copied ? copy.copied : copy.copy}</Text>
                </TouchableOpacity>
              </View>
            )}
            {nextStep && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={accentColor} />
                <Text style={{ color: colors.text, fontSize: 13 }}>{copy.next(nextStep)}</Text>
              </View>
            )}
            {closesIn !== null && <Text style={{ color: colors.muted, fontSize: 12 }}>{copy.closingIn(closesIn)}</Text>}
          </View>
        )}

        {pending.length > 1 &&
          pending.map((r) => (
            <TouchableOpacity
              key={r.id}
              onPress={() => onSelect(r)}
              style={[styles.item, { borderColor: current?.id === r.id ? accentColor : colors.border }]}
            >
              <Text style={{ color: colors.text }}>{labelOf(r, copy)}</Text>
              <Text style={{ color: colors.muted }}>{expiresIn(r, copy)}</Text>
            </TouchableOpacity>
          ))}

        {current && (
          <View style={[styles.detail, { borderColor: colors.border }]}>
            <View style={styles.detailHead}>
              <Text style={[styles.detailTitle, { color: colors.text, flexShrink: 1 }]}>{labelOf(current, copy)}</Text>
              {!verification && (
                <View style={[styles.chip, { borderColor: colors.border }]}>
                  <ActivityIndicator size="small" color={accentColor} />
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{copy.checking}</Text>
                </View>
              )}
              {verification?.ok && (
                <TouchableOpacity
                  onPress={() => setVerifiedOpenFor(verifiedOpen ? null : current.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: verifiedOpen }}
                  style={[styles.chip, { borderColor: colors.okText }]}
                >
                  <View style={[styles.okDot, { backgroundColor: colors.okText }]}>
                    <View style={styles.okMark} />
                  </View>
                  <Text style={{ color: colors.okText, fontSize: 12, fontWeight: '600' }}>{copy.verified}</Text>
                </TouchableOpacity>
              )}
            </View>
            {current.summary ? <Text style={{ color: colors.muted }}>{current.summary}</Text> : null}
            {detailRows(current, copy).map(([k, v]) => (
              <View key={k} style={styles.row}>
                <Text style={{ color: colors.muted }}>{k}</Text>
                <Text style={{ color: colors.text, flexShrink: 1, textAlign: 'right' }}>{v}</Text>
              </View>
            ))}

            {verification?.ok && verifiedOpen && (
              <View style={[styles.verify, { borderColor: colors.okText }]}>
                <Text style={{ color: colors.okText, flexShrink: 1 }}>{copy.checkedAgainstTurnkey}</Text>
              </View>
            )}
            {/* A failed check stays spelled out: it is the only place the user learns why Approve is off. */}
            {verification && !verification.ok && (
              <View style={[styles.verify, { backgroundColor: colors.errorBg, borderColor: colors.errorText }]}>
                <Text style={{ color: colors.errorText, flexShrink: 1 }}>
                  {copy.notVerified} {verification.reason}
                </Text>
              </View>
            )}

            {error ? (
              <View style={[styles.verify, { backgroundColor: colors.errorBg, borderColor: colors.errorText }]}>
                <Text style={{ color: colors.errorText }}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                disabled={!!busy}
                onPress={() => onReject(current)}
                style={[styles.btn, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {busy === 'rejecting' ? copy.rejecting : copy.reject}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!canVote}
                onPress={() => onApprove(current)}
                style={[styles.btn, { backgroundColor: accentColor, borderColor: accentColor, opacity: canVote ? 1 : 0.55 }]}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>{busy === 'approving' ? copy.approving : copy.approve}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
      <PollarModalFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '600' },
  empty: { paddingVertical: 24, alignItems: 'center', gap: 6 },
  hashRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 6,
  },
  detail: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  detailTitle: { fontSize: 16, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderRadius: 999,
  },
  okDot: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  okMark: {
    width: 4,
    height: 7,
    marginTop: -2,
    borderColor: '#fff',
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    transform: [{ rotate: '45deg' }],
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  verify: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
});
