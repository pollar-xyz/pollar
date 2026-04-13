'use client';

import { type CSSProperties } from 'react';
import { QRCode } from '../../lib/qr-code';
import { PollarModalFooter } from '../commons';

export interface ReceiveModalTemplateProps {
  theme: string;
  accentColor: string;
  walletAddress: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

export function ReceiveModalTemplate({
  theme,
  accentColor,
  walletAddress,
  copied,
  onCopy,
  onClose,
}: ReceiveModalTemplateProps) {
  const isDark = theme === 'dark';

  const cssVars = {
    '--pollar-accent': accentColor,
    '--pollar-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': isDark ? '#ffffff' : '#111827',
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    '--pollar-input-bg': isDark ? '#374151' : '#f9fafb',
    '--pollar-error-bg': isDark ? '#2a1515' : '#fef2f2',
    '--pollar-error-border': isDark ? '#7f1d1d' : '#fecaca',
    '--pollar-error-text': isDark ? '#f87171' : '#dc2626',
    '--pollar-success-text': isDark ? '#4ade80' : '#16a34a',
    '--pollar-buttons-border-radius': '6px',
    '--pollar-buttons-height': '44px',
    '--pollar-input-height': '44px',
    '--pollar-input-border-radius': '0.5rem',
    '--pollar-card-border-radius': '10px',
  } as CSSProperties;

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

      {/* QR code */}
      {walletAddress ? (
        <>
          <div className="pollar-receive-qr">
            <QRCode
              value={walletAddress}
              size={180}
              fgColor={isDark ? '#ffffff' : '#111827'}
              bgColor="transparent"
            />
          </div>

          <p className="pollar-receive-instructions">
            Share your Stellar address to receive any asset. Only send Stellar assets to this address.
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
