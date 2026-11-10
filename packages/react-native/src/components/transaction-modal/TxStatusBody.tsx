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
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CONFIRM_COPY } from '../confirm-modal/confirm-copy';
import { confirmationReview } from '../confirm-modal/confirmation-review';
import { OutcomeIcon, TitleMark } from '../cosign-modal/CosignModalUI';
import { TxReview } from '../tx-review/TxReview';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { headlineAsset, reviewFromBuild, type TxReviewData } from '../tx-review/tx-review-model';
import { TRANSACTION_COPY } from './transaction-copy';

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

export interface TxStatusBodyProps {
  transaction: TransactionState;
  theme: string;
  accentColor: string;
  explorerUrl: string | null;
  walletType?: WalletId | null | undefined;
  /** The signature waiting for the user's yes, answered here instead of a prompt over the view. */
  confirmation?: PendingConfirmation | null | undefined;
  /** The operation as the caller knows it (an Earn deposit names its opportunity), drawn instead of the build's summary. */
  review?: TxReviewData | null | undefined;
  /** What the success says instead of the generic "sent" line. */
  successMessage?: string | undefined;
  /** Shows the action's title with its logo above the review; a modal that titles itself leaves it off. */
  showTitle?: boolean;
  showXdr?: boolean | undefined;
  onToggleXdr?: (() => void) | undefined;
  onSignAndSend?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
  network?: StellarNetwork | undefined;
  copyText?: ((text: string) => Promise<void>) | undefined;
  language?: PollarLanguage | undefined;
}

/** The review a transaction draws: the caller's, else the build's, else the confirmation's. */
export function txStatusReview(
  transaction: TransactionState,
  language: PollarLanguage,
  explorerUrl: string | null,
  confirmation?: PendingConfirmation | null,
  reviewProp?: TxReviewData | null,
  network?: StellarNetwork,
): TxReviewData | null {
  const copy = TRANSACTION_COPY[language];
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const hash = transaction.step === 'success' ? transaction.hash : null;
  const hashInfo = hash ? { value: hash, explorerUrl } : undefined;
  const sponsored = 'sponsored' in transaction ? transaction.sponsored : undefined;
  // A compound flow can finish without the build it ran: the hash still has a place in the details.
  return reviewProp
    ? { ...reviewProp, ...(hashInfo && { hash: hashInfo }), ...(sponsored !== undefined && { fee: { sponsored } }) }
    : buildData
      ? reviewFromBuild(buildData, TX_REVIEW_COPY[language], copy.title, hashInfo, sponsored)
      : confirmation
        ? confirmationReview(confirmation, language, network)
        : hashInfo
          ? {
              title: copy.title,
              kind: 'other',
              rows: [],
              hash: hashInfo,
              ...(sponsored !== undefined && { fee: { sponsored } }),
            }
          : null;
}

/**
 * A transaction from the user's yes to its outcome in one view: the review stays,
 * and a strip under it says where the transaction stands. The hash and every
 * address live in the details.
 */
export function TxStatusBody({
  transaction,
  theme,
  accentColor,
  explorerUrl,
  walletType,
  confirmation = null,
  review: reviewProp,
  successMessage,
  showTitle = false,
  showXdr,
  onToggleXdr,
  onSignAndSend,
  onRetry,
  network,
  copyText,
  language: languageProp,
}: TxStatusBodyProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = TRANSACTION_COPY[language];
  const confirmCopy = CONFIRM_COPY[language];
  const isDark = theme === 'dark';
  const colors = {
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    errorBg: isDark ? '#2a1515' : '#fef2f2',
    errorText: isDark ? '#f87171' : '#dc2626',
    okText: isDark ? '#4ade80' : '#15803d',
  };
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const errorDetails =
    transaction.step === 'error' ? transactionErrorMessage(transaction.code, transaction.details, language) : null;
  const isBuilt = transaction.step === 'built';
  const isInFlight = IN_FLIGHT_STEPS.has(transaction.step);
  const isSuccess = transaction.step === 'success';
  const isError = transaction.step === 'error';
  const asking = !!confirmation && !isSuccess && !isError;
  const review = txStatusReview(transaction, language, explorerUrl, confirmation, reviewProp, network);
  const waitingOn =
    walletType === WalletType.FREIGHTER ? copy.waitingFreighter : walletType === WalletType.ALBEDO ? copy.waitingAlbedo : null;
  const tone = isError ? colors.errorText : colors.okText;
  const chain = review?.from?.chain ?? review?.to?.chain;

  return (
    <View style={styles.root}>
      {showTitle && review && (
        <View style={styles.heading}>
          <TitleMark chain={chain} asset={headlineAsset(review)} theme={theme} accentColor={accentColor} />
          <Text style={[styles.title, { color: colors.text }]}>{review.title}</Text>
        </View>
      )}

      {review && (
        <TxReview
          data={review}
          theme={theme}
          accentColor={accentColor}
          {...(showXdr !== undefined ? { open: showXdr } : {})}
          {...(onToggleXdr ? { onToggle: onToggleXdr } : {})}
          copyText={copyText}
          language={language}
          {...(asking
            ? {
                detailsIntro: { title: confirmCopy.whyTitle, body: confirmCopy.whyBody },
                detailsAction: { label: confirmCopy.cancelAction, onPress: confirmation!.reject },
              }
            : {})}
        />
      )}

      {asking ? (
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={confirmation!.confirm}>
          <Text style={styles.primaryBtnText}>
            {review?.kind === 'activate_wallet' ? confirmCopy.activateWallet : confirmCopy.confirm}
          </Text>
        </TouchableOpacity>
      ) : isBuilt && onSignAndSend ? (
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
            accessibilityLiveRegion="polite"
          >
            <View style={styles.outcomeMain}>
              {isInFlight ? <ActivityIndicator size="small" color={accentColor} /> : <OutcomeIcon ok={!isError} color={tone} />}
              <Text style={{ color: isInFlight ? colors.text : tone, fontWeight: '600', flexShrink: 1 }}>
                {isSuccess && successMessage ? successMessage : copy.status[transaction.step]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontSize: 17, fontWeight: '700' },
  outcome: { gap: 6, borderWidth: 1, borderRadius: 10, padding: 12 },
  outcomeMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtn: { width: '100%', height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
});
