import React from 'react';
import { View } from 'react-native';
import { FeaturePanel } from '../FeaturePanel';
import { ActionButton } from '../native-ui';

export function TransactionModal({ onClose }: { onClose: () => void }) {
  return (
    <View style={{ gap: 16 }}>
      <ActionButton title="Close" onPress={onClose} />
      <FeaturePanel feature="transactions" />
    </View>
  );
}
