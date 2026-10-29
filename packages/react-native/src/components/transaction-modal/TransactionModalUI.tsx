import { useInheritedLanguage } from '../../language-context';
import { PollarLanguage, TransactionState, WalletId, WalletType } from '@pollar/core';
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { LOGO_ALBEDO, LOGO_FREIGHTER, LOGO_POLLAR_MARK_ON_DARK, LOGO_POLLAR_MARK_ON_LIGHT } from '../../constants';
import { ModalStatusBanner, PollarModalFooter, PollarOverlay } from '../commons';
import { TxReview } from '../tx-review/TxReview';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { reviewFromBuild, type TxReviewData } from '../tx-review/tx-review-model';
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
}

const SENDING_STEPS = new Set<TransactionState['step']>([
  'signing',
  'signed',
  'submitting',
  'signing-submitting',
  'submitted',
  'awaiting_cosign',
]);

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
}: TransactionModalTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = TRANSACTION_COPY[language];
  const isDark = theme === 'dark';

  const colors = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    errorBg: isDark ? '#2a1515' : '#fef2f2',
    errorText: isDark ? '#f87171' : '#dc2626',
  };

  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const hash = transaction.step === 'success' ? transaction.hash : null;
  const errorDetails = transaction.step === 'error' ? (transaction.details ?? null) : null;

  const isBuilt = transaction.step === 'built';
  const isSigning = SENDING_STEPS.has(transaction.step);
  const isSuccess = transaction.step === 'success';
  const isError = transaction.step === 'error';
  const showDetails = isBuilt || isSigning || isSuccess;
  const hashInfo = hash ? { value: hash, explorerUrl } : undefined;
  // A compound flow can finish without the build it ran: the hash still has a place in the details.
  const review: TxReviewData | null = buildData
    ? reviewFromBuild(buildData, TX_REVIEW_COPY[language], copy.title, hashInfo)
    : hashInfo
      ? { title: copy.title, kind: 'other', rows: [], hash: hashInfo }
      : null;
  const reviewBlock = showDetails && review && (
    <ScrollView style={styles.contentWrap} nestedScrollEnabled>
      {buildData && <Text style={[styles.reviewTitle, { color: colors.text }]}>{review.title}</Text>}
      <TxReview
        data={review}
        theme={theme}
        accentColor={accentColor}
        open={showXdr}
        onToggle={onToggleXdr}
        copyText={copyText}
        language={language}
      />
    </ScrollView>
  );

  return (
    <PollarOverlay onCancel={onClose}>
      <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
        </View>

        <TouchableOpacity style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>

        {!isSuccess && reviewBlock}

        {isError && errorDetails && (
          <View style={[styles.errorBox, { backgroundColor: colors.errorBg }]}>
            <Text style={{ color: colors.errorText, fontWeight: '600', marginBottom: 4 }}>{copy.errorDetails}</Text>
            <Text style={{ color: colors.errorText, fontSize: 12 }}>{errorDetails}</Text>
          </View>
        )}

        {isBuilt && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={onSignAndSend}>
            <Text style={styles.primaryBtnText}>{copy.signAndSend}</Text>
          </TouchableOpacity>
        )}

        {(isSigning || isSuccess || isError) && (
          <View style={styles.walletSpinnerBox}>
            <View style={styles.walletIconContainer}>
              <Image
                source={{
                  uri:
                    walletType === WalletType.FREIGHTER
                      ? LOGO_FREIGHTER
                      : walletType === WalletType.ALBEDO
                        ? LOGO_ALBEDO
                        : isDark
                          ? LOGO_POLLAR_MARK_ON_DARK
                          : LOGO_POLLAR_MARK_ON_LIGHT,
                }}
                style={styles.walletImage}
              />
            </View>

            {isSigning && transaction.step !== 'awaiting_cosign' && (
              <Text style={[styles.spinnerText, { color: colors.text }]}>
                {walletType === WalletType.FREIGHTER
                  ? copy.waitingFreighter
                  : walletType === WalletType.ALBEDO
                    ? copy.waitingAlbedo
                    : copy.signingAndSending}
              </Text>
            )}

            {isError && onRetry && buildData && (
              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={onRetry}>
                <Text style={[styles.secondaryBtnText, { color: colors.muted }]}>{copy.tryAgain}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <ModalStatusBanner
          message={copy.status[transaction.step] || ''}
          status={
            isError
              ? 'ERROR'
              : isSigning || transaction.step === 'building' || transaction.step === 'building-signing-submitting'
                ? 'LOADING'
                : isSuccess
                  ? 'SUCCESS'
                  : 'NONE'
          }
        />

        {isSuccess && reviewBlock}

        {isSuccess && (
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
    marginBottom: 20,
    marginTop: 10,
  },
  title: {
    fontSize: 22,
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
  reviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },

  errorBox: {
    padding: 12,
    borderRadius: 8,
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
  secondaryBtn: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 16,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  walletSpinnerBox: {
    alignItems: 'center',
    marginVertical: 20,
  },
  walletIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#005DB4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletImage: {
    width: 32,
    height: 32,
  },
  spinnerText: {
    fontSize: 16,
  },
});
