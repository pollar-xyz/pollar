import React from 'react';
import { Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { FeaturePanel, type FeatureName } from './FeaturePanel';
import { ActionButton } from './native-ui';
import { useSurfaceColors } from './layout';

export interface FeatureModalProps {
  onClose: () => void;
  visible?: boolean;
}
/** Shared native modal chrome used by both provider openers and standalone components. */
export function FeatureModal({ feature, visible = true, onClose }: FeatureModalProps & { feature: FeatureName | null }) {
  const c = useSurfaceColors();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 16 }}>
              <ActionButton title="Close" onPress={onClose} />
              {visible && feature && <FeaturePanel key={feature} feature={feature} />}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
// Web SDK counterparts: native layout, the same core operations, no DOM or Expo dependency.
export function SendModal(props: FeatureModalProps) {
  return <FeatureModal {...props} feature="send" />;
}
export function ReceiveModal(props: FeatureModalProps) {
  return <FeatureModal {...props} feature="receive" />;
}
export function EnabledAssetsModal(props: FeatureModalProps) {
  return <FeatureModal {...props} feature="assets" />;
}
export function SessionsModal(props: FeatureModalProps) {
  return <FeatureModal {...props} feature="sessions" />;
}
export function SwapModal(props: FeatureModalProps) {
  return <FeatureModal {...props} feature="swap" />;
}
export function EarnModal(props: FeatureModalProps) {
  return <FeatureModal {...props} feature="earn" />;
}
export function DistributionRulesModal(props: FeatureModalProps) {
  return <FeatureModal {...props} feature="distribution" />;
}
