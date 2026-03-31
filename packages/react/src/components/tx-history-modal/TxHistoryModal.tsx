'use client';

import { useState } from 'react';
import { usePollar } from '../../context';
import './TxHistoryModal.css';
import { TxHistoryModalTemplate } from './TxHistoryModalTemplate';

const PAGE_SIZE = 10;

interface TxHistoryModalProps {
  onClose: () => void;
}

export function TxHistoryModal({ onClose }: TxHistoryModalProps) {
  const { getClient, styles, txHistory } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const [offset, setOffset] = useState(0);

  function load(nextOffset: number) {
    setOffset(nextOffset);
    void getClient().fetchTxHistory({ limit: PAGE_SIZE, offset: nextOffset });
  }

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <TxHistoryModalTemplate
        theme={theme}
        accentColor={accentColor}
        txHistory={txHistory}
        offset={offset}
        onRefresh={() => load(offset)}
        onPrev={() => load(Math.max(0, offset - PAGE_SIZE))}
        onNext={() => load(offset + PAGE_SIZE)}
        onClose={onClose}
      />
    </div>
  );
}