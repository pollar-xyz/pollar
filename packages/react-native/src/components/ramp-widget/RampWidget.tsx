import React from 'react';
import { View } from 'react-native';
import { FeaturePanel } from '../FeaturePanel';
import { ActionButton } from '../native-ui';

// Retained for existing consumers; completion now comes only from provider status.
export type RampStep = 'idle' | 'in-progress' | 'completed';
export interface RampWidgetTemplateProps {
  theme?: string;
  accentColor?: string;
  onClose: () => void;
}
/** Requires PollarProvider. No timer or locally fabricated payment status. */
export function RampWidgetTemplate({ onClose }: RampWidgetTemplateProps) {
  return (
    <View style={{ padding: 20, gap: 16 }}>
      <ActionButton title="Close ramp" onPress={onClose} />
      <FeaturePanel feature="ramp" />
    </View>
  );
}
export function RampWidget({ onClose }: { onClose: () => void }) {
  return <RampWidgetTemplate onClose={onClose} />;
}
