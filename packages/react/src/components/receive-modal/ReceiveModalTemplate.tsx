'use client';

import { WalletChain } from '@pollar/core';
import { QRCode } from '../../lib/qr-code';
import { ChainSelect } from '../ChainSelect';
import { PollarModalFooter } from '../commons';
import { PollarLogo } from '../PollarLogo';
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
  /**
   * The networks the user holds an address on, in the app's configured order.
   * The picker renders only with two or more, so a single-chain app shows none.
   */
  chains?: WalletChain[];
  selectedChain: WalletChain | null;
  onSelectChain?: (chain: WalletChain) => void;
  copied: boolean;
  /**
   * Why the wallet cannot receive yet (its Stellar account is still being
   * created, or its creation failed), or null when it can.
   *
   * The address itself is valid either way - what is missing is the account
   * behind it, so a payment sent now is rejected by the network. Optional, so a
   * custom template written before this existed keeps compiling.
   */
  notReadyReason?: string | null;
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
  notReadyReason,
  onCopy,
  onClose,
}: ReceiveModalTemplateProps) {
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

      {/* Network selector - drives the address and QR below */}
      {chains && onSelectChain && <ChainSelect value={selectedChain} options={chains} onChange={onSelectChain} />}

      {/* QR code */}
      {walletAddress ? (
        <>
          <div className="pollar-receive-qr">
            <div className="pollar-receive-network-badge">
              <span className="pollar-receive-network-dot" aria-hidden />
              {chainName} network
            </div>
            <div className="pollar-receive-qr-frame">
              <QRCode
                value={walletAddress}
                size={220}
                level="H"
                fgColor="#111827"
                bgColor="#ffffff"
                title={`${chainName} wallet QR code`}
              />
              <span className="pollar-receive-qr-mark" aria-hidden>
                <PollarLogo width="22" height="24" />
              </span>
            </div>
          </div>

          {notReadyReason && <div className="pollar-receive-notice">{notReadyReason}</div>}

          {/* Address + copy */}
          <div className="pollar-receive-address-actions">
            <div className="pollar-receive-address-row">
              <span className="pollar-receive-address">{walletAddress}</span>
            </div>
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
                  Copied
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
                  Copy
                </>
              )}
            </button>
          </div>
          <p className="pollar-receive-warning">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25" />
              <path d="M7 6.25V9.25M7 4.5V4.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            <span>Only send {chainName} assets to this address</span>
          </p>
        </>
      ) : (
        <div className="pollar-modal-empty">No wallet connected.</div>
      )}

      <PollarModalFooter shield />
    </div>
  );
}
