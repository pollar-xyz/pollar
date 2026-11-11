import type { PendingConfirmation, PollarLanguage, StellarNetwork } from '@pollar/core';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TxReview } from '../tx-review/TxReview';
import { CONFIRM_COPY } from './confirm-copy';
import { confirmationReview } from './confirmation-review';

/**
 * A signature's yes asked inside the modal that started it: the review of what
 * is signed, Confirm under it, and the reason and the way out in its details.
 */
export function InlineConfirm({
  confirmation,
  language,
  theme,
  accentColor,
  network,
  copyText,
}: {
  confirmation: PendingConfirmation;
  language: PollarLanguage;
  theme: string;
  accentColor: string;
  network?: StellarNetwork | undefined;
  copyText?: ((text: string) => Promise<void>) | undefined;
}) {
  const copy = CONFIRM_COPY[language];
  const review = confirmationReview(confirmation, language, network);
  const text = theme === 'dark' ? '#ffffff' : '#111827';
  return (
    <View style={[styles.box, { borderColor: accentColor }]}>
      <Text style={[styles.title, { color: text }]}>{review.title}</Text>
      <TxReview
        key={confirmation.id}
        data={review}
        theme={theme}
        accentColor={accentColor}
        copyText={copyText}
        language={language}
        detailsIntro={{ title: copy.whyTitle, body: copy.whyBody }}
        detailsAction={{ label: copy.cancelAction, onPress: confirmation.reject }}
      />
      <TouchableOpacity
        style={[styles.button, { backgroundColor: accentColor }]}
        onPress={confirmation.confirm}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{review.kind === 'activate_wallet' ? copy.activateWallet : copy.confirm}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, padding: 12, borderWidth: 1, borderRadius: 10 },
  title: { fontSize: 15, fontWeight: '600' },
  button: { alignItems: 'center', paddingVertical: 11, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
