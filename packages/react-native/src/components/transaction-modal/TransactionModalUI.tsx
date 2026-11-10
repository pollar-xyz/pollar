import { useInheritedLanguage } from '../../language-context';
import {
  type PendingConfirmation,
  PollarLanguage,
  type StellarNetwork,
  TransactionState,
  transactionErrorMessage,
  WalletId,
  WalletType,
} from '@pollar/core';
import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { PollarModalFooter, PollarOverlay } from '../commons';
import { CONFIRM_COPY } from '../confirm-modal/confirm-copy';
import { confirmationReview } from '../confirm-modal/confirmation-review';
import { OutcomeIcon, TitleMark } from '../cosign-modal/CosignModalUI';
import { TxReview } from '../tx-review/TxReview';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { headlineAsset, reviewFromBuild, type TxReviewData } from '../tx-review/tx-review-model';
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

const IN_FLIGHT_STEPS = new Set<TransactionState['step']>([
  'building',
  'signing',
  'signed',
  'submitting',
  'signing-submitting',
  'submitted',
  'building-signing-submitting',
  'awaiting_cosign',
]);

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
  const confirmCopy = CONFIRM_COPY[language];
  const isDark = theme === 'dark';

  const colors = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    errorBg: isDark ? '#2a1515' : '#fef2f2',
    errorText: isDark ? '#f87171' : '#dc2626',
    okText: isDark ? '#4ade80' : '#15803d',
  };

  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const hash = transaction.step === 'success' ? transaction.hash : null;
  const errorDetails =
    transaction.step === 'error' ? transactionErrorMessage(transaction.code, transaction.details, language) : null;

  const isBuilt = transaction.step === 'built';
  const isInFlight = IN_FLIGHT_STEPS.has(transaction.step);
  const isSuccess = transaction.step === 'success';
  const isError = transaction.step === 'error';
  const asking = !!confirmation && !isSuccess && !isError;
  const hashInfo = hash ? { value: hash, explorerUrl } : undefined;
  const sponsored = 'sponsored' in transaction ? transaction.sponsored : undefined;
  // A compound flow can finish without the build it ran: the hash still has a place in the details.
  const review: TxReviewData | null = buildData
    ? reviewFromBuild(buildData, TX_REVIEW_COPY[language], copy.title, hashInfo, sponsored)
    : confirmation
      ? confirmationReview(confirmation, language, network)
      : hashInfo
        ? { title: copy.title, kind: 'other', rows: [], hash: hashInfo, ...(sponsored !== undefined && { fee: { sponsored } }) }
        : null;
  const waitingOn =
    walletType === WalletType.FREIGHTER ? copy.waitingFreighter : walletType === WalletType.ALBEDO ? copy.waitingAlbedo : null;
  const tone = isError ? colors.errorText : colors.okText;
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

        {review && (
          <ScrollView style={styles.contentWrap} nestedScrollEnabled>
            <TxReview
              data={review}
              theme={theme}
              accentColor={accentColor}
              open={showXdr}
              onToggle={onToggleXdr}
              copyText={copyText}
              language={language}
              {...(asking
                ? {
                    detailsIntro: { title: confirmCopy.whyTitle, body: confirmCopy.whyBody },
                    detailsAction: { label: confirmCopy.cancelAction, onPress: confirmation!.reject },
                  }
                : {})}
            />
          </ScrollView>
        )}

        {asking ? (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={confirmation!.confirm}>
            <Text style={styles.primaryBtnText}>
              {review?.kind === 'activate_wallet' ? confirmCopy.activateWallet : confirmCopy.confirm}
            </Text>
          </TouchableOpacity>
        ) : isBuilt ? (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={onSignAndSend}>
            <Text style={styles.primaryBtnText}>{copy.signAndSend}</Text>
          </TouchableOpacity>
        ) : (
          (isInFlight || isSuccess || isError) && (
            <View
              style={[
                styles.outcome,
                { borderColor: isInFlight ? colors.border : tone, backgroundColor: isError ? colors.errorBg : 'transparent' },
              ]}
            >
              <View style={styles.outcomeMain}>
                {isInFlight ? (
                  <ActivityIndicator size="small" color={accentColor} />
                ) : (
                  <OutcomeIcon ok={!isError} color={tone} />
                )}
                <Text style={{ color: isInFlight ? colors.text : tone, fontWeight: '600', flexShrink: 1 }}>
                  {copy.status[transaction.step]}
                </Text>
              </View>
              {isInFlight && waitingOn && transaction.step !== 'awaiting_cosign' && (
                <Text style={{ color: colors.muted, fontSize: 13 }}>{waitingOn}</Text>
              )}
              {isError && errorDetails && <Text style={{ color: colors.muted, fontSize: 13 }}>{errorDetails}</Text>}
            </View>
          )
        )}

        {isError && onRetry && buildData && (
          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={onRetry}>
            <Text style={[styles.secondaryBtnText, { color: colors.muted }]}>{copy.tryAgain}</Text>
          </TouchableOpacity>
        )}

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    marginTop: 10,
    // Clear of the close button in the corner.
    paddingRight: 40,
  },
  outcome: {
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  outcomeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  secondaryBtn: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 10,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
