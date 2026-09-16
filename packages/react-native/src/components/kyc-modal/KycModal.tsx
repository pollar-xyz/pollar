import React from 'react';
import { View, Text, Pressable } from 'react-native';

// Retained for source compatibility; the native preview never reaches approved.
export type KycStep = 'idle' | 'in-progress' | 'approved';
export interface KycModalTemplateProps {
  theme?: string | undefined;
  accentColor?: string | undefined;
  country?: string | undefined;
  level?: 'basic' | 'intermediate' | 'enhanced' | undefined;
  onClose: () => void;
  /** Reserved for a real verification integration. Never called by this preview. */
  onApproved?: (() => void) | undefined;
}
export function KycModalTemplate({ theme, country, level = 'basic', onClose }: KycModalTemplateProps) {
  return (
    <View style={{ padding: 24, gap: 16, backgroundColor: theme === 'dark' ? '#101827' : '#fff' }}>
      <Text accessibilityRole="header" style={{ color: theme === 'dark' ? '#fff' : '#101827', fontSize: 20 }}>
        Identity verification · Preview
      </Text>
      <Text style={{ color: theme === 'dark' ? '#fff' : '#101827' }}>
        Native identity verification is not connected. No documents are collected and no approval is issued. Level: {level}.{' '}
        {country ? 'Region: ' + country : ''}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close KYC preview" onPress={onClose} style={{ padding: 16 }}>
        <Text style={{ color: '#1763df' }}>Close preview</Text>
      </Pressable>
    </View>
  );
}
export function KycModal(props: KycModalTemplateProps) {
  return <KycModalTemplate {...props} />;
}
