'use client';

import { WalletChain } from '@pollar/core';
import { useCallback, useEffect, useState } from 'react';
import { usePollar } from '../../context';
import { useChains } from '../../useChains';
import { addressForChain } from '../ChainSelect';
import '../shared.css';
import './TxHistoryModal.css';
import { TxHistoryModalTemplate } from './TxHistoryModalTemplate';

const PAGE_SIZE = 10;

interface TxHistoryModalProps {
  onClose: () => void;
}

export function TxHistoryModal({ onClose }: TxHistoryModalProps) {
  const { getClient, styles, txHistory, wallets, network } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const [offset, setOffset] = useState(0);

  const { chains } = useChains();
  const [selectedChain, setSelectedChain] = useState<WalletChain | null>(null);
  // Default to the app's first configured network, like the other modals.
  useEffect(() => {
    if (selectedChain === null && chains.length > 0) setSelectedChain(chains[0]!);
  }, [chains, selectedChain]);

  const walletAddress = addressForChain(wallets, selectedChain);

  // The chain filter is a server query param (pagination is server-side), so a
  // fetch always carries the selected chain. Null while chains resolve — the
  // effect below waits for it rather than fetching the whole unfiltered set.
  const load = useCallback(
    (nextOffset: number, chain: WalletChain) => {
      setOffset(nextOffset);
      void getClient().fetchTxHistory({ limit: PAGE_SIZE, offset: nextOffset, chain });
    },
    [getClient],
  );

  // (Re)load from page 1 whenever the selected chain changes. Switching networks
  // must reset the offset — page 3 of Stellar is not page 3 of Solana.
  useEffect(() => {
    if (selectedChain) load(0, selectedChain);
  }, [selectedChain, load]);

  const onSelectChain = (chain: WalletChain) => setSelectedChain(chain);
  const paged = (nextOffset: number) => {
    if (selectedChain) load(nextOffset, selectedChain);
  };

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <TxHistoryModalTemplate
        theme={theme}
        accentColor={accentColor}
        txHistory={txHistory}
        offset={offset}
        chains={chains}
        selectedChain={selectedChain}
        walletAddress={walletAddress}
        network={network}
        onSelectChain={onSelectChain}
        onRefresh={() => paged(offset)}
        onPrev={() => paged(Math.max(0, offset - PAGE_SIZE))}
        onNext={() => paged(offset + PAGE_SIZE)}
        onClose={onClose}
      />
    </div>
  );
}
