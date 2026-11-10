import React from 'react';
import { Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  FeaturePanel,
  type EarnModalOptions,
  type FeatureInitial,
  type FeatureName,
  type ReceiveModalOptions,
  type SendModalOptions,
  type SwapModalOptions,
} from './FeaturePanel';
import { ActionButton } from './native-ui';
import { useSurfaceColors } from './layout';
import { useModalLanguage } from '../language';
import { FEATURE_COPY } from './feature-copy';

export interface FeatureModalProps {
  onClose: () => void;
  visible?: boolean;
}
/** Shared native modal chrome used by both provider openers and standalone components. */
export function FeatureModal({
  feature,
  visible = true,
  onClose,
  initial,
}: FeatureModalProps & { feature: FeatureName | null; initial?: FeatureInitial | undefined }) {
  const c = useSurfaceColors();
  const copy = FEATURE_COPY[useModalLanguage()];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 16 }}>
              <ActionButton title={copy.close} onPress={onClose} />
              {visible && feature && <FeaturePanel key={feature} feature={feature} initial={initial} />}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
// Web SDK counterparts: native layout, the same core operations, no DOM or Expo dependency.
export function SendModal({ initial, ...props }: FeatureModalProps & { initial?: SendModalOptions | undefined }) {
  return <FeatureModal {...props} feature="send" initial={initial ? { send: initial } : undefined} />;
}
export function ReceiveModal({ initial, ...props }: FeatureModalProps & { initial?: ReceiveModalOptions | undefined }) {
  return <FeatureModal {...props} feature="receive" initial={initial ? { receive: initial } : undefined} />;
}
export function EnabledAssetsModal(props: FeatureModalProps) {
  return <FeatureModal {...props} feature="assets" />;
}
export function SessionsModal(props: FeatureModalProps) {
  return <FeatureModal {...props} feature="sessions" />;
}
export function SwapModal({ initial, ...props }: FeatureModalProps & { initial?: SwapModalOptions | undefined }) {
  return <FeatureModal {...props} feature="swap" initial={initial ? { swap: initial } : undefined} />;
}
export function EarnModal({ initial, ...props }: FeatureModalProps & { initial?: EarnModalOptions | undefined }) {
  return <FeatureModal {...props} feature="earn" initial={initial ? { earn: initial } : undefined} />;
}
export function DistributionRulesModal(props: FeatureModalProps) {
  return <FeatureModal {...props} feature="distribution" />;
}
