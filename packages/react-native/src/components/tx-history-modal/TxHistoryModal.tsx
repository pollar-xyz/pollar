import type { WalletChain } from '@pollar/core';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { TxHistoryModalTemplate } from './TxHistoryModalUI';

/** Where the history opens: the network whose transactions it lists. A network the app does not offer is left out. */
export interface TxHistoryModalOptions {
  chain?: WalletChain;
}

export interface TxHistoryModalProps {
  onClose: () => void;
  initial?: TxHistoryModalOptions | undefined;
}

export function TxHistoryModal({ onClose, initial }: TxHistoryModalProps) {
  const { styles, txHistory, getClient, wallets, appConfig } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const language = useModalLanguage();
  // The networks the user holds a wallet on, in the app's order when it sets one.
  const held = [...new Set(wallets.map((w) => w.chain ?? 'STELLAR'))];
  const order = appConfig.application?.chains as WalletChain[] | undefined;
  const chains = order && order.length > 0 ? order.filter((c) => held.includes(c)) : held;
  const [selected, setSelected] = useState<WalletChain | null>(null);
  const chain = selected ?? (initial?.chain && chains.includes(initial.chain) ? initial.chain : (chains[0] ?? null));

  // The chain filter is a server query param, so every fetch carries the network shown.
  const load = () => (chain ? getClient().fetchTxHistory({ chain }) : getClient().fetchTxHistory());
  useEffect(() => {
    void load();
  }, [chain]);

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
              onRefresh={() => void load()}
              chains={chains}
              chain={chain}
              onChainChange={setSelected}
              language={language}
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
