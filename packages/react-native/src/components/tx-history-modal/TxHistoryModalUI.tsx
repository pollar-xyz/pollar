import { useInheritedLanguage } from '../../language-context';
import { PollarLanguage, TxHistoryState, WalletChain } from '@pollar/core';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Linking } from 'react-native';
import { ModalStatusBanner, PollarModalFooter, PollarOverlay } from '../commons';
import { TX_HISTORY_COPY } from './tx-history-copy';

export interface TxHistoryModalTemplateProps {
  theme: string;
  accentColor: string;
  txHistory: TxHistoryState;
  onClose: () => void;
  onRefresh: () => void;
  /** Language of the modal. Defaults to the user's device; the modal passes the resolved one. */
  language?: PollarLanguage | undefined;
  /** The networks to pick from; the picker shows when there is more than one. */
  chains?: WalletChain[] | undefined;
  chain?: WalletChain | null | undefined;
  onChainChange?: ((chain: WalletChain) => void) | undefined;
}

/** The explorer page of a transaction on its own chain; testnet is Solana devnet and Polygon Amoy. */
function explorerTxUrl(chain: WalletChain | undefined, hash: string, network: string): string {
  const testnet = network === 'testnet';
  if (chain === 'SOLANA') return `https://explorer.solana.com/tx/${hash}${testnet ? '?cluster=devnet' : ''}`;
  if (chain === 'POLYGON') return `https://${testnet ? 'amoy.' : ''}polygonscan.com/tx/${hash}`;
  return `https://stellar.expert/explorer/${testnet ? 'testnet' : 'public'}/tx/${hash}`;
}

export function TxHistoryModalTemplate({
  theme,
  accentColor,
  txHistory,
  onClose,
  onRefresh,
  language: languageProp,
  chains = [],
  chain = null,
  onChainChange,
}: TxHistoryModalTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = TX_HISTORY_COPY[language];
  const statusMessages: Record<TxHistoryState['step'], string> = {
    idle: '',
    loading: copy.loadingHistory,
    loaded: '',
    error: copy.loadFailed,
  };
  const isDark = theme === 'dark';

  const colors = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    itemBg: isDark ? '#262626' : '#f9fafb',
    successText: isDark ? '#4ade80' : '#16a34a',
  };

  const isError = txHistory.step === 'error';
  const isLoading = txHistory.step === 'loading';
  const isLoaded = txHistory.step === 'loaded';

  const transactions = txHistory.step === 'loaded' ? txHistory.data.records : [];

  return (
    <PollarOverlay onCancel={onClose}>
      <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} disabled={isLoading}>
            <Text style={{ color: colors.muted }}>🔄</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>

        {chains.length > 1 && (
          <View style={styles.chainRow} accessibilityLabel={copy.network}>
            {chains.map((c) => (
              <TouchableOpacity
                key={c}
                accessibilityRole="radio"
                accessibilityState={{ checked: c === chain }}
                style={[styles.chainChip, { borderColor: c === chain ? accentColor : colors.border }]}
                onPress={() => onChainChange?.(c)}
              >
                <Text style={{ color: colors.text }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isLoaded && transactions.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>{copy.emptyFound}</Text>
          </View>
        )}

        {isLoaded && transactions.length > 0 && (
          <FlatList
            data={transactions}
            keyExtractor={(item) => item.hash}
            style={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.txRow, { backgroundColor: colors.itemBg, borderColor: colors.border }]}
                onPress={() => Linking.openURL(explorerTxUrl(item.chain ?? chain ?? undefined, item.hash, item.network))}
              >
                <View style={styles.txRowLeft}>
                  <Text style={[styles.txType, { color: colors.text }]}>
                    {item.operation ? (copy.operations[item.operation] ?? item.operation) : copy.transaction}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                </View>
                <View style={styles.txRowRight}>
                  <Text
                    style={[
                      styles.txStatus,
                      {
                        color:
                          item.status === 'SUCCESS' ? colors.successText : item.status === 'PENDING' ? '#f59e0b' : '#ef4444',
                      },
                    ]}
                  >
                    {item.status === 'SUCCESS'
                      ? copy.status.SUCCESS
                      : item.status === 'PENDING'
                        ? copy.status.PENDING
                        : copy.status.FAILED}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {isLoading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={accentColor} />
          </View>
        )}

        <ModalStatusBanner
          message={statusMessages[txHistory.step] || ''}
          status={isError ? 'ERROR' : isLoading ? 'LOADING' : 'NONE'}
          onRetry={isError ? onRefresh : undefined}
        />

        <PollarModalFooter />
      </View>
    </PollarOverlay>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginRight: 12,
  },
  refreshBtn: {
    padding: 6,
  },
  iconButton: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeBtn: {
    top: 16,
    right: 16,
  },
  chainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chainChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    maxHeight: 300,
    marginBottom: 16,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  txRowLeft: {},
  txType: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  txRowRight: {
    alignItems: 'flex-end',
  },
  txStatus: {
    fontSize: 13,
    fontWeight: '700',
  },
});
