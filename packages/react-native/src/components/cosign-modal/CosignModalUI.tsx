import { useInheritedLanguage } from '../../language-context';
import { type CosignRequest, type CosignVerification, type PollarLanguage, type StellarNetwork } from '@pollar/core';
import React, { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CHAIN_LOGOS } from '../../constants';
import { PollarModalFooter } from '../commons';
import { TxFeeBadge, TxReview } from '../tx-review/TxReview';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { reviewFromRequest } from '../tx-review/tx-review-model';
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
  /** This device is not one of the wallet's devices: it cannot vote, only reject, until it is added. */
  deviceNotLinked?: boolean;
  /** Opens where this device gets added; the button shows only with it. */
  onLinkDevice?: () => void;
  lastResolved?: CosignRequest;
  /** Seconds until the modal closes on its own, while what it shows needs nothing from the user. */
  closesIn?: number | null;
  /** The approval coming next in the same flow, shown while the modal waits for it. */
  nextStep?: string | null;
  /** The transaction hash was just copied. */
  copied?: boolean;
  /** Language of the modal's text; the device's when not given. */
  language?: PollarLanguage | undefined;
  /** The app's network, shown next to the chain in the details. */
  network?: StellarNetwork | undefined;
  /** Puts a value on the clipboard, for the copy buttons in the details. */
  copyText?: ((text: string) => Promise<void>) | undefined;
  onCopyHash: (hash: string) => void;
  onSelect: (request: CosignRequest) => void;
  onApprove: (request: CosignRequest) => void;
  onReject: (request: CosignRequest) => void;
  /** The user asked to close (the X): the container closes or asks first. */
  onClose: () => void;
  /** Closing was asked while a request waits: the modal asks before leaving it unsigned. */
  confirmingClose?: boolean;
  onKeepOpen?: () => void;
  onCloseAnyway?: () => void;
}

/** The chain's logo next to the title, so the user sees where the action happens. */
export function ChainMark({ chain, size = 22 }: { chain: string | undefined; size?: number }) {
  const uri = chain ? CHAIN_LOGOS[chain as keyof typeof CHAIN_LOGOS] : undefined;
  return uri ? (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  ) : null;
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

export function CosignModalTemplate({
  theme,
  accentColor,
  pending,
  current,
  verification,
  busy,
  error,
  deviceNotLinked = false,
  onLinkDevice,
  lastResolved,
  closesIn = null,
  nextStep = null,
  copied = false,
  language: languageProp,
  network,
  copyText,
  onCopyHash,
  onSelect,
  onApprove,
  onReject,
  onClose,
  confirmingClose = false,
  onKeepOpen,
  onCloseAnyway,
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
  const verified = verification?.ok === true && !deviceNotLinked;
  const canVote = !!current && verified && !busy;
  // Keyed by request id, so the explanation folds back when another request is shown.
  const [verifiedOpenFor, setVerifiedOpenFor] = useState<string | null>(null);
  const verifiedOpen = !!current && verifiedOpenFor === current.id;
  const reviewOf = (request: CosignRequest) =>
    reviewFromRequest(
      {
        chain: request.network,
        network,
        operation: request.operation,
        summary: request.summary,
        details: request.details,
        signWith: request.account ?? request.signWith,
        raw: request.unsignedPayload,
        fallbackTitle: labelOf(request, copy),
        extraRows: [{ label: copy.expiresIn, value: expiresIn(request, copy) }],
        appPaysFee: request.appPaysFee,
      },
      TX_REVIEW_COPY[language],
    );
  const review = current ? reviewOf(current) : null;
  const grouped = pending.length > 1;
  // One request: the header is the action itself. Several: how many wait, and each names itself below.
  const shown = grouped ? null : (current ?? (pending.length === 0 ? lastResolved : undefined) ?? null);
  const shownReview = shown ? (shown === current ? review : reviewOf(shown)) : null;
  const heading = confirmingClose
    ? copy.closeTitle
    : grouped
      ? copy.manyPending(pending.length)
      : (shownReview?.title ?? copy.title);

  const chip =
    current && !confirmingClose ? (
      <>
        {!verification && !deviceNotLinked && (
          <View style={[styles.chip, { borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={accentColor} />
            <Text style={{ color: colors.muted, fontSize: 12 }}>{copy.checking}</Text>
          </View>
        )}
        {verified && (
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
      </>
    ) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.heading}>
          {!confirmingClose && <ChainMark chain={shown?.network} />}
          <Text style={[styles.title, { color: colors.text }]}>{heading}</Text>
        </View>
        <View style={styles.headerActions}>
          {!grouped && chip}
          {!confirmingClose && (
            <TouchableOpacity onPress={onClose} accessibilityLabel={copy.close} hitSlop={8}>
              <Text style={{ color: colors.muted, fontSize: 18 }}>x</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {confirmingClose ? (
        <View style={styles.leave}>
          <Text style={{ color: colors.muted }}>{copy.closeBody}</Text>
          <TouchableOpacity
            onPress={onKeepOpen}
            style={[styles.btn, { backgroundColor: accentColor, borderColor: accentColor }]}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>{copy.backToSign}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCloseAnyway} style={styles.textBtn} hitSlop={8}>
            <Text style={{ color: colors.muted }}>{copy.closeAnyway}</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
              {lastResolved?.submit?.sponsored !== undefined && (
                <TxFeeBadge
                  sponsored={lastResolved.submit.sponsored}
                  theme={theme}
                  accentColor={accentColor}
                  language={language}
                />
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

          {grouped &&
            pending.map((r) => (
              <TouchableOpacity
                key={r.id}
                onPress={() => onSelect(r)}
                style={[styles.item, { borderColor: current?.id === r.id ? accentColor : colors.border }]}
              >
                <View style={[styles.heading, { flexShrink: 1 }]}>
                  <ChainMark chain={r.network} size={18} />
                  <Text style={{ color: colors.text, flexShrink: 1 }}>{reviewOf(r).title}</Text>
                </View>
                <Text style={{ color: colors.muted }}>{expiresIn(r, copy)}</Text>
              </TouchableOpacity>
            ))}

          {current && review && (
            <View style={[styles.detail, grouped && [styles.detailGrouped, { borderColor: colors.border }]]}>
              {grouped && (
                <View style={styles.detailHead}>
                  <Text style={[styles.detailTitle, { color: colors.text, flexShrink: 1 }]}>{review.title}</Text>
                  {chip}
                </View>
              )}
              {review.lead ? <Text style={{ color: colors.muted }}>{review.lead}</Text> : null}
              <TxReview
                key={current.id}
                data={review}
                theme={theme}
                accentColor={accentColor}
                copyText={copyText}
                language={language}
                detailsIntro={{ title: copy.whyTitle, body: copy.whyBody }}
                detailsAction={{
                  label: busy === 'rejecting' ? copy.rejecting : copy.rejectRequest,
                  onPress: () => onReject(current),
                  disabled: !!busy,
                }}
              />

              {verified && verifiedOpen && (
                <View style={[styles.verify, { borderColor: colors.okText }]}>
                  <Text style={{ color: colors.okText, flexShrink: 1 }}>{copy.checkedExact}</Text>
                </View>
              )}
              {/* A failed check stays spelled out: it is the only place the user learns why Approve is off. */}
              {deviceNotLinked ? (
                <View style={[styles.verify, { backgroundColor: colors.errorBg, borderColor: colors.errorText }]}>
                  <Text style={{ color: colors.errorText, flexShrink: 1 }}>{copy.deviceNotLinked}</Text>
                  {onLinkDevice && (
                    <TouchableOpacity onPress={onLinkDevice} accessibilityRole="button" style={{ marginTop: 6 }}>
                      <Text style={{ color: colors.errorText, fontWeight: '600', textDecorationLine: 'underline' }}>
                        {copy.linkDevice}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                verification &&
                !verification.ok && (
                  <View style={[styles.verify, { backgroundColor: colors.errorBg, borderColor: colors.errorText }]}>
                    <Text style={{ color: colors.errorText, flexShrink: 1 }}>
                      {copy.notVerified} {verification.reason}
                    </Text>
                  </View>
                )
              )}

              {error ? (
                <View style={[styles.verify, { backgroundColor: colors.errorBg, borderColor: colors.errorText }]}>
                  <Text style={{ color: colors.errorText }}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                disabled={!canVote}
                onPress={() => onApprove(current)}
                style={[styles.btn, { backgroundColor: accentColor, borderColor: accentColor, opacity: canVote ? 1 : 0.55 }]}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>
                  {busy === 'approving'
                    ? copy.approving
                    : review.kind === 'activate_wallet'
                      ? copy.activateWallet
                      : copy.approve}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
      <PollarModalFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  leave: { gap: 12, paddingBottom: 4 },
  textBtn: { alignSelf: 'center', paddingVertical: 4 },
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
  detail: { gap: 8 },
  detailGrouped: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 6 },
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
  verify: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  btn: { alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, marginTop: 4 },
});
