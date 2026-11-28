import type { PendingConfirmation } from '@pollar/core';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { CONFIRM_COPY } from './confirm-copy';

import { PollarModalFooter, PollarOverlay } from '../commons';
import { TitleMark } from '../cosign-modal/CosignModalUI';
import { TxReview } from '../tx-review/TxReview';
import { headlineAsset } from '../tx-review/tx-review-model';
import { confirmationReview } from './confirmation-review';

interface ConfirmModalProps {
  confirmation: PendingConfirmation;
}

/**
 * The prompt a signing call waits on under `confirmation: 'prompt'`, the same
 * for every custody: the wallet signs only after the user confirms here.
 * Closing it declines, so the X and Android's back button ask first and a tap
 * on the backdrop does nothing.
 */
export function ConfirmModal({ confirmation }: ConfirmModalProps) {
  const { getClient, styles, network, copyText } = usePollar();
  const language = useModalLanguage();
  const copy = CONFIRM_COPY[language];
  const review = confirmationReview(confirmation, language, network);
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

  const [confirmingClose, setConfirmingClose] = useState(false);

  return (
    <PollarOverlay onCancel={() => setConfirmingClose(true)} dismissOnBackdrop={false}>
      <View style={[localStyles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <View style={localStyles.header}>
          <View style={localStyles.heading}>
            {!confirmingClose && (
              <TitleMark chain={confirmation.network} asset={headlineAsset(review)} theme={theme} accentColor={accentColor} />
            )}
            <Text style={[localStyles.title, { color: colors.text }]}>{confirmingClose ? copy.closeTitle : review.title}</Text>
          </View>
          {!confirmingClose && (
            <TouchableOpacity onPress={() => setConfirmingClose(true)} accessibilityLabel={copy.close} hitSlop={8}>
              <Text style={{ color: colors.muted, fontSize: 18 }}>x</Text>
            </TouchableOpacity>
          )}
        </View>

        {confirmingClose ? (
          <View style={localStyles.detail}>
            <Text style={{ color: colors.muted }}>{copy.closeBody}</Text>
            <TouchableOpacity
              onPress={() => setConfirmingClose(false)}
              style={[localStyles.btn, { backgroundColor: accentColor, borderColor: accentColor }]}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>{copy.backToSign}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmation.reject} style={localStyles.textBtn} hitSlop={8}>
              <Text style={{ color: colors.muted }}>{copy.closeAndCancel}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={localStyles.detail}>
            <TxReview
              data={review}
              theme={theme}
              accentColor={accentColor}
              copyText={copyText}
              language={language}
              detailsIntro={{ title: copy.whyTitle, body: copy.whyBody }}
              detailsAction={{ label: copy.cancelAction, onPress: confirmation.reject }}
            />
            <TouchableOpacity
              onPress={confirmation.confirm}
              style={[localStyles.btn, { backgroundColor: accentColor, borderColor: accentColor }]}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>
                {review.kind === 'activate_wallet' ? copy.activateWallet : copy.confirm}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <PollarModalFooter />
      </View>
    </PollarOverlay>
  );
}

const localStyles = StyleSheet.create({
  card: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  title: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  detail: { gap: 8 },
  btn: { alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  textBtn: { alignSelf: 'center', paddingVertical: 4 },
});
