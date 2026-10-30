import type { PollarLanguage } from '@pollar/core';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { CHAIN_LOGOS, TOKEN_LOGOS } from '../../constants';
import { useInheritedLanguage } from '../../language-context';
import { COMMONS_COPY } from '../commons-copy';
import { TX_REVIEW_COPY, type TxReviewCopy } from './tx-review-copy';
import { shortAddress, type TxParty, type TxReviewData } from './tx-review-model';

export interface TxReviewProps {
  data: TxReviewData;
  theme: string;
  accentColor: string;
  /** Whether the details are unfolded; the review keeps its own state when not given. */
  open?: boolean;
  onToggle?: () => void;
  /** Puts a value on the clipboard; the details show no copy buttons without it. */
  copyText?: ((text: string) => Promise<void>) | undefined;
  language?: PollarLanguage | undefined;
}

type Colors = ReturnType<typeof reviewColors>;

function reviewColors(theme: string, accentColor: string) {
  const isDark = theme === 'dark';
  return {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    inputBg: isDark ? '#374151' : '#f9fafb',
    okText: isDark ? '#4ade80' : '#15803d',
    accent: accentColor,
  };
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function CopyButton({
  value,
  copyText,
  language,
  colors,
}: {
  value: string;
  copyText: (text: string) => Promise<void>;
  language: PollarLanguage;
  colors: Colors;
}) {
  const copy = COMMONS_COPY[language];
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? copy.copied : copy.copy}
      hitSlop={8}
      onPress={() =>
        void copyText(value)
          .then(() => {
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => undefined)
      }
    >
      <Text style={[styles.copyLabel, { color: colors.accent }]}>{copied ? copy.copied : copy.copy}</Text>
    </Pressable>
  );
}

function ChainBadge({ chain, copy, colors }: { chain: TxParty['chain']; copy: TxReviewCopy; colors: Colors }) {
  if (!chain) return null;
  return (
    <Image
      source={{ uri: CHAIN_LOGOS[chain] }}
      accessibilityLabel={copy.chains[chain]}
      style={[styles.chain, { borderColor: colors.inputBg, backgroundColor: colors.bg }]}
    />
  );
}

function AssetLogo({ asset, colors }: { asset: string; colors: Colors }) {
  const url = TOKEN_LOGOS[asset.toUpperCase()];
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        accessibilityLabel={asset}
        onError={() => setFailed(true)}
        style={[styles.logo, { backgroundColor: colors.bg }]}
      />
    );
  }
  return (
    <View style={[styles.logo, { backgroundColor: `${colors.accent}1F` }]}>
      <Text style={[styles.initial, { color: colors.accent }]}>{asset.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function Glyph({ kind, colors }: { kind: 'account' | 'contract'; colors: Colors }) {
  return (
    <View style={[styles.logo, styles.glyph, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
        {kind === 'account' ? (
          <>
            <Circle cx={10} cy={7} r={3.25} stroke={colors.muted} strokeWidth={1.6} />
            <Path
              d="M3.75 16.5c.9-3 3.3-4.5 6.25-4.5s5.35 1.5 6.25 4.5"
              stroke={colors.muted}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <Rect x={4.5} y={9} width={11} height={7.5} rx={1.75} stroke={colors.muted} strokeWidth={1.6} />
            <Path d="M7 9V6.75a3 3 0 0 1 6 0V9" stroke={colors.muted} strokeWidth={1.6} strokeLinecap="round" />
          </>
        )}
      </Svg>
    </View>
  );
}

function Node({
  party,
  showAmount,
  glyph,
  copy,
  colors,
}: {
  party: TxParty;
  showAmount: boolean;
  glyph: 'asset' | 'account' | 'contract';
  copy: TxReviewCopy;
  colors: Colors;
}) {
  const caption = party.self
    ? copy.yourWallet
    : (party.label ?? (party.address ? shortAddress(party.address) : party.chain ? copy.chains[party.chain] : ''));
  return (
    <View style={styles.node}>
      <View style={styles.avatar}>
        {glyph === 'asset' && party.asset ? (
          <AssetLogo key={party.asset} asset={party.asset} colors={colors} />
        ) : (
          <Glyph kind={glyph === 'contract' ? 'contract' : 'account'} colors={colors} />
        )}
        <ChainBadge chain={party.chain} copy={copy} colors={colors} />
      </View>
      {showAmount && party.amount ? (
        <Text style={[styles.amount, { color: colors.text }]}>
          {party.minimum ? <Text style={[styles.min, { color: colors.muted }]}>{copy.atLeast} </Text> : null}
          {party.amount} {party.asset}
        </Text>
      ) : null}
      <Text style={[styles.caption, { color: colors.muted }]} numberOfLines={1} ellipsizeMode="middle">
        {caption}
      </Text>
    </View>
  );
}

function Arrow({ colors }: { colors: Colors }) {
  return (
    <View style={styles.arrow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ flex: 1 }}>
        <Svg width="100%" height={12} viewBox="0 0 64 12" preserveAspectRatio="none" fill="none">
          <Path d="M1 6h60" stroke={colors.accent} strokeWidth={1.5} strokeLinecap="round" strokeDasharray="3 4" />
        </Svg>
      </View>
      <Svg width={10} height={12} viewBox="0 0 10 12" fill="none" style={{ marginLeft: -4 }}>
        <Path d="M2 1.5 7.5 6 2 10.5" stroke={colors.accent} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function FeeBadge({ sponsored, copy, colors }: { sponsored: boolean; copy: TxReviewCopy; colors: Colors }) {
  const color = sponsored ? colors.okText : colors.muted;
  return (
    <View style={styles.fee}>
      <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
        {sponsored ? (
          <>
            <Rect x={2} y={6} width={12} height={8} rx={1.5} stroke={color} strokeWidth={1.4} />
            <Path d="M1.5 4.25h13V6h-13zM8 4.25V14" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
            <Path
              d="M8 4.25C6.5 4.25 5 3.5 5 2.4 5 1.2 7 1.2 8 4.25Zm0 0c1.5 0 3-.75 3-1.85 0-1.2-2-1.2-3 1.85Z"
              stroke={color}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          </>
        ) : (
          <Path d="M8.5 1.5 3.5 9H8l-.5 5.5 5-7.5H8l.5-5.5Z" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
        )}
      </Svg>
      <Text style={[styles.feeText, { color }]}>{sponsored ? copy.feeSponsored : copy.feePaid}</Text>
    </View>
  );
}

/**
 * The transaction as a person reads it: who sends what to whom, drawn as a
 * flow, with the network fee as one badge. Addresses, chains, fees and the
 * raw transaction live behind "Show details".
 */
/** Who paid the network fee of a signed transaction, as one line with its icon. */
export function TxFeeBadge({
  sponsored,
  theme,
  accentColor,
  language: languageProp,
}: {
  sponsored: boolean;
  theme: string;
  accentColor: string;
  language?: PollarLanguage | undefined;
}) {
  const language = useInheritedLanguage(languageProp);
  return <FeeBadge sponsored={sponsored} copy={TX_REVIEW_COPY[language]} colors={reviewColors(theme, accentColor)} />;
}

export function TxReview({
  data,
  theme,
  accentColor,
  open: openProp,
  onToggle,
  copyText,
  language: languageProp,
}: TxReviewProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = TX_REVIEW_COPY[language];
  const colors = reviewColors(theme, accentColor);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const toggle = onToggle ?? (() => setOpenState((v) => !v));
  const { from, to, kind } = data;
  // The receiving end repeats the amount only when it differs from what leaves.
  const toShowsAmount = !!to?.amount && (to.amount !== from?.amount || to.asset !== from?.asset);
  const toGlyph = kind === 'approve' ? 'contract' : kind === 'bridge' || kind === 'swap' ? 'asset' : 'account';
  const copyButton = (value: string) =>
    copyText ? <CopyButton value={value} copyText={copyText} language={language} colors={colors} /> : null;

  return (
    <View style={styles.root}>
      {from && to && (
        <View style={[styles.flow, { backgroundColor: colors.inputBg }]}>
          <Node party={from} showAmount glyph={from.asset ? 'asset' : 'account'} copy={copy} colors={colors} />
          <Arrow colors={colors} />
          <Node party={to} showAmount={kind !== 'approve' && toShowsAmount} glyph={toGlyph} copy={copy} colors={colors} />
        </View>
      )}
      {kind === 'approve' && <Text style={[styles.note, { color: colors.muted }]}>{copy.approveNote}</Text>}

      <View style={styles.bar}>
        {data.fee?.sponsored !== undefined ? <FeeBadge sponsored={data.fee.sponsored} copy={copy} colors={colors} /> : <View />}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          onPress={toggle}
          style={styles.toggle}
        >
          <Text style={[styles.toggleText, { color: colors.accent }]}>{open ? copy.hideDetails : copy.showDetails}</Text>
          <Svg
            width={10}
            height={10}
            viewBox="0 0 12 12"
            fill="none"
            style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
          >
            <Path d="M2 4l4 4 4-4" stroke={colors.accent} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
      </View>

      {open && (
        <View style={[styles.details, { borderTopColor: colors.border }]}>
          {data.rows.map((row, i) => (
            <View key={`${row.label}-${i}`} style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.muted }]}>{row.label}</Text>
              <View style={styles.rowValue}>
                <Text selectable style={[styles.rowText, row.mono && styles.mono, { color: colors.text }]}>
                  {row.value}
                </Text>
                {row.copyValue ? copyButton(row.copyValue) : null}
              </View>
            </View>
          ))}
          {data.hash && (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.muted }]}>{copy.rows.txHash}</Text>
              <View style={styles.rowValue}>
                <Text selectable style={[styles.rowText, styles.mono, { color: colors.text }]}>
                  {data.hash.value}
                </Text>
                {copyButton(data.hash.value)}
              </View>
            </View>
          )}
          {data.hash?.explorerUrl ? (
            <Pressable
              accessibilityRole="link"
              hitSlop={8}
              onPress={() => void Linking.openURL(data.hash!.explorerUrl!).catch(() => undefined)}
              style={styles.link}
            >
              <Text style={[styles.toggleText, { color: colors.accent }]}>{copy.viewOnExplorer}</Text>
            </Pressable>
          ) : null}
          {data.raw ? (
            <View style={styles.raw}>
              <View style={styles.rawHead}>
                <Text style={[styles.rowText, { color: colors.muted }]}>{copy.rows.rawTx}</Text>
                {copyButton(data.raw)}
              </View>
              <ScrollView nestedScrollEnabled style={[styles.rawBox, { backgroundColor: colors.inputBg }]}>
                <Text selectable style={[styles.rawText, { color: colors.text }]}>
                  {data.raw}
                </Text>
              </ScrollView>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  flow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  node: { flex: 1, minWidth: 0, alignItems: 'center', gap: 5 },
  avatar: { width: 44, height: 44, marginBottom: 2 },
  logo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glyph: { borderWidth: 1 },
  initial: { fontSize: 18, fontWeight: '700' },
  chain: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  amount: { fontSize: 15, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] },
  min: { fontWeight: '400' },
  caption: { fontSize: 13, textAlign: 'center', maxWidth: '100%' },
  arrow: { flexDirection: 'row', alignItems: 'center', height: 44, minWidth: 40, maxWidth: 72, flexBasis: 56, flexShrink: 1 },
  note: { fontSize: 13, textAlign: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24 },
  fee: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  feeText: { fontSize: 13, flexShrink: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toggleText: { fontSize: 13, fontWeight: '500' },
  details: { gap: 10, paddingTop: 10, borderTopWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 13, minWidth: 88 },
  rowValue: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 6 },
  rowText: { fontSize: 13, flexShrink: 1, textAlign: 'right' },
  mono: { fontFamily: MONO, fontSize: 12 },
  copyLabel: { fontSize: 12, fontWeight: '600' },
  link: { alignSelf: 'flex-end' },
  raw: { gap: 5 },
  rawHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rawBox: { maxHeight: 120, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  rawText: { fontFamily: MONO, fontSize: 11 },
});
