import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { usePollar } from '../../context';
import { TxHistoryModalTemplate } from './TxHistoryModalUI'; // Bypassing cache

export interface TxHistoryModalProps {
  onClose: () => void;
}

export function TxHistoryModal({ onClose }: TxHistoryModalProps) {
  const { styles, txHistory, getClient } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  useEffect(() => {
    getClient().fetchTxHistory();
  }, []);

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={stylesUI.overlay}>
        <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
          <View style={stylesUI.modalWrapper}>
            <TxHistoryModalTemplate
              theme={theme}
              accentColor={accentColor}
              txHistory={txHistory}
              onClose={onClose}
              onRefresh={() => getClient().fetchTxHistory()}
            />
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  );
}

const stylesUI = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 50,
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 400,
  },
});
