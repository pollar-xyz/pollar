'use client';

import { WalletChain } from '@pollar/core';
import { QRCode } from '../../lib/qr-code';
import { ChainSelect } from '../ChainSelect';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';

/** Network name as it reads in a sentence ("Share your Stellar address"). */
const CHAIN_NAME: Record<string, string> = {
  STELLAR: 'Stellar',
  POLYGON: 'Polygon',
  SOLANA: 'Solana',
};

export interface ReceiveModalTemplateProps {
  theme: string;
  accentColor: string;
  /** Per-app modal chrome overrides (background, card + button radius). */
  styleOverrides?: ModalStyleOverrides;
  /** Address of the wallet on {@link selectedChain}. */
  walletAddress: string;
  /** Networks the user holds a wallet on; the first one is the default. */
  chains: WalletChain[];
  selectedChain: WalletChain | null;
  onSelectChain: (chain: WalletChain) => void;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

export function ReceiveModalTemplate({
  theme,
  accentColor,
  styleOverrides,
  walletAddress,
  chains,
  selectedChain,
  onSelectChain,
  copied,
  onCopy,
  onClose,
}: ReceiveModalTemplateProps) {
  const isDark = theme === 'dark';

  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);

  const chainName = selectedChain ? (CHAIN_NAME[selectedChain] ?? selectedChain) : 'wallet';

  return (
    <div
      className="pollar-modal-card pollar-receive-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">Receive</h2>
        <div className="pollar-modal-header-actions">
          <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <ChainSelect value={selectedChain} options={chains} onChange={onSelectChain} />

      {/* QR code */}
      {walletAddress ? (
        <>
          <div className="pollar-receive-qr">
            <QRCode value={walletAddress} size={180} fgColor={isDark ? '#ffffff' : '#111827'} bgColor="transparent" />
          </div>

          <p className="pollar-receive-instructions">
            Share your {chainName} address to receive any asset. Only send {chainName} assets to this address. Funds sent from
            another network are lost.
          </p>

          {/* Address + copy */}
          <div className="pollar-receive-address-row">
            <span className="pollar-receive-address">{walletAddress}</span>
            <button type="button" className="pollar-receive-copy-btn" onClick={onCopy} aria-label="Copy address">
              {copied ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <circle cx="7" cy="7" r="7" fill="currentColor" />
                    <path
                      d="M3.5 7l2.5 2.5 4.5-5"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <path
                      d="M3 9H2a1 1 0 01-1-1V2a1 1 0 011-1h6a1 1 0 011 1v1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  Copy address
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        <div className="pollar-modal-empty">No wallet connected.</div>
      )}

      <PollarModalFooter />
    </div>
  );
}
