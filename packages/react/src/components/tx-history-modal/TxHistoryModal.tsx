'use client';

import { WalletChain } from '@pollar/core';
import { useCallback, useEffect, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { useChains } from '../../useChains';
import { oneOf } from '../../modal-options';
import { addressForChain } from '../ChainSelect';
import '../shared.css';
import './TxHistoryModal.css';
import { TxHistoryModalTemplate } from './TxHistoryModalTemplate';
import { modalChrome } from '../modal-theme';

const PAGE_SIZE = 10;

/** Where the history opens: the network whose transactions it lists. A network the app does not offer is left out. */
export interface TxHistoryModalOptions {
  chain?: WalletChain;
}

interface TxHistoryModalProps {
  onClose: () => void;
  initial?: TxHistoryModalOptions | undefined;
}

export function TxHistoryModal({ onClose, initial }: TxHistoryModalProps) {
  const { getClient, styles, txHistory, wallets } = usePollar();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const language = useModalLanguage();
  const [offset, setOffset] = useState(0);

  const { chains } = useChains();
  const [selectedChain, setSelectedChain] = useState<WalletChain | null>(null);
  // Default to the app's first configured network, like the other modals.
  useEffect(() => {
    if (selectedChain === null && chains.length > 0) setSelectedChain(oneOf(chains, initial?.chain) ?? chains[0]!);
  }, [chains, selectedChain, initial?.chain]);

  const walletAddress = addressForChain(wallets, selectedChain);

  // The chain filter is a server query param (pagination is server-side), so a
  // fetch always carries the selected chain. Null while chains resolve - the
  // effect below waits for it rather than fetching the whole unfiltered set.
  const load = useCallback(
    (nextOffset: number, chain: WalletChain) => {
      setOffset(nextOffset);
      void getClient().fetchTxHistory({ limit: PAGE_SIZE, offset: nextOffset, chain });
    },
    [getClient],
  );

  // (Re)load from page 1 whenever the selected chain changes. Switching networks
  // must reset the offset - page 3 of Stellar is not page 3 of Solana.
  useEffect(() => {
    if (selectedChain) load(0, selectedChain);
  }, [selectedChain, load]);

  const onSelectChain = (chain: WalletChain) => setSelectedChain(chain);
  const paged = (nextOffset: number) => {
    if (selectedChain) load(nextOffset, selectedChain);
  };

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={onClose}>
      <TxHistoryModalTemplate
        theme={theme}
        accentColor={accentColor}
        styleOverrides={styleOverrides}
        txHistory={txHistory}
        offset={offset}
        chains={chains}
        selectedChain={selectedChain}
        walletAddress={walletAddress}
        onSelectChain={onSelectChain}
        onRefresh={() => paged(offset)}
        onPrev={() => paged(Math.max(0, offset - PAGE_SIZE))}
        onNext={() => paged(offset + PAGE_SIZE)}
        onClose={onClose}
        language={language}
      />
    </div>
  );
}
