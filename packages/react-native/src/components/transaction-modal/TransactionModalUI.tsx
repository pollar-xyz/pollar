import { useInheritedLanguage } from '../../language-context';
import { type PendingConfirmation, PollarLanguage, type StellarNetwork, TransactionState, WalletId } from '@pollar/core';
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { PollarModalFooter, PollarOverlay } from '../commons';
import { TitleMark } from '../cosign-modal/CosignModalUI';
import { headlineAsset } from '../tx-review/tx-review-model';
import { TxStatusBody, txStatusReview } from './TxStatusBody';
import { TRANSACTION_COPY } from './transaction-copy';

export interface TransactionModalTemplateProps {
  theme: string;
  accentColor: string;
  transaction: TransactionState;
  /** Whether the details (addresses, network, fee, raw transaction, hash) are unfolded. */
  showXdr: boolean;
  /** Unused: the hash copies from the details. */
  copied: boolean;
  explorerUrl: string | null;
  walletType?: WalletId | null;
  onClose: () => void;
  onSignAndSend: () => void;
  /** Folds and unfolds the details. */
  onToggleXdr: () => void;
  /** Unused: the hash copies from the details. */
  onCopyHash: () => void;
  /** Puts a value on the clipboard, for the copy buttons in the details. */
  copyText?: ((text: string) => Promise<void>) | undefined;
  onRetry?: () => void;
  /** Language of the modal. Defaults to the user's device; the modal passes the resolved one. */
  language?: PollarLanguage | undefined;
  /** The signature waiting for the user's yes, answered in this view instead of a prompt over it. */
  confirmation?: PendingConfirmation | null | undefined;
  /** The app's network, for the details of a confirmation. */
  network?: StellarNetwork | undefined;
}

/**
 * A transaction from the user's yes to its outcome in one view: the review stays,
 * and a strip under it says where the transaction stands. The hash and every
 * address live in the details.
 */
export function TransactionModalTemplate({
  theme,
  accentColor,
  transaction,
  showXdr,
  explorerUrl,
  walletType,
  onClose,
  onSignAndSend,
  onToggleXdr,
  copyText,
  onRetry,
  language: languageProp,
  confirmation = null,
  network,
}: TransactionModalTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = TRANSACTION_COPY[language];
  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
  };
  const review = txStatusReview(transaction, language, explorerUrl, confirmation, null, network);
  const chain = review?.from?.chain ?? review?.to?.chain;

  return (
    // A transaction on its way is closed from its X; a tap beside it does nothing.
    <PollarOverlay onCancel={onClose} dismissOnBackdrop={false}>
      <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <View style={styles.header}>
          {review && <TitleMark chain={chain} asset={headlineAsset(review)} theme={theme} accentColor={accentColor} />}
          <Text style={[styles.title, { color: colors.text }]}>{review?.title ?? copy.title}</Text>
        </View>

        <TouchableOpacity style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>

        <ScrollView style={styles.contentWrap} nestedScrollEnabled>
          <TxStatusBody
            transaction={transaction}
            theme={theme}
            accentColor={accentColor}
            explorerUrl={explorerUrl}
            walletType={walletType}
            confirmation={confirmation}
            showXdr={showXdr}
            onToggleXdr={onToggleXdr}
            onSignAndSend={onSignAndSend}
            {...(onRetry ? { onRetry } : {})}
            network={network}
            copyText={copyText}
            language={language}
          />
        </ScrollView>

        {transaction.step === 'success' && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={onClose}>
            <Text style={styles.primaryBtnText}>{copy.done}</Text>
          </TouchableOpacity>
        )}

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
    gap: 8,
    marginBottom: 16,
    marginTop: 10,
    // Clear of the close button in the corner.
    paddingRight: 40,
  },
  title: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '700',
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
  contentWrap: {
    maxHeight: 360,
    marginBottom: 16,
  },

  primaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
