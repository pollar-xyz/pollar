'use client';

import { TransactionState, WalletBalanceRecord, WalletChain, WalletId } from '@pollar/core';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChainSelect } from '../ChainSelect';
import { PollarModalFooter, RefreshIcon } from '../commons';
import { TxStatusView } from '../transaction-modal/TxStatusView';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';

// A null balance means the chain could not be read; it shows as a dash rather
// than as 0, so an unreadable wallet never looks empty.
function formatBalance(balance: string | null): string {
  if (balance === null) return '—';
  const n = parseFloat(balance);
  return isNaN(n) ? balance : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

function assetKey(record: WalletBalanceRecord): string {
  return `${record.code}:${record.issuer ?? 'native'}`;
}

function chainLabel(chain: WalletChain | null): string {
  if (chain === 'STELLAR') return 'Stellar';
  if (chain === 'SOLANA') return 'Solana';
  if (chain === 'POLYGON') return 'Polygon';
  return 'network';
}

function AssetIcon({ code }: { code: string }) {
  return (
    <span className="pollar-send-asset-icon" aria-hidden>
      {code.slice(0, 2).toUpperCase()}
    </span>
  );
}

interface SendAssetSelectorProps {
  assets: WalletBalanceRecord[];
  selectedAsset: WalletBalanceRecord | null;
  loading: boolean;
  onSelectAsset: (asset: WalletBalanceRecord) => void;
}

function SendAssetSelector({ assets, selectedAsset, loading, onSelectAsset }: SendAssetSelectorProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !triggerRef.current?.parentElement?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  if (loading) {
    return (
      <div className="pollar-send-field">
        <span className="pollar-send-label">Asset</span>
        <div className="pollar-send-asset-selector pollar-send-asset-selector-loading" aria-label="Loading assets">
          <span className="pollar-spinner pollar-spinner-sm" />
          <span>Loading assets…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pollar-send-field">
      <label className="pollar-send-label" id="pollar-send-asset-label">
        Asset
      </label>
      <div className="pollar-send-asset-picker">
        <button
          ref={triggerRef}
          type="button"
          className="pollar-send-asset-selector"
          aria-labelledby="pollar-send-asset-label"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={!selectedAsset}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={handleTriggerKeyDown}
        >
          {selectedAsset ? (
            <>
              <AssetIcon code={selectedAsset.code} />
              <span className="pollar-send-asset-copy">
                <strong>{selectedAsset.code}</strong>
                <small>
                  {selectedAsset.available === null
                    ? 'Balance unavailable'
                    : `${formatBalance(selectedAsset.available)} available`}
                </small>
              </span>
            </>
          ) : (
            <span className="pollar-send-asset-copy">
              <strong>No assets available</strong>
            </span>
          )}
          <svg className="pollar-send-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && assets.length > 0 && (
          <div className="pollar-send-asset-menu" role="listbox" aria-label="Assets">
            {assets.map((asset) => {
              const key = assetKey(asset);
              const selected = selectedAsset ? key === assetKey(selectedAsset) : false;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`pollar-send-asset-option${selected ? ' is-selected' : ''}`}
                  onClick={() => {
                    onSelectAsset(asset);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                >
                  <AssetIcon code={asset.code} />
                  <span className="pollar-send-asset-copy">
                    <strong>{asset.code}</strong>
                    <small>
                      {asset.available === null ? 'Balance unavailable' : `${formatBalance(asset.available)} available`}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export interface SendModalTemplateProps {
  theme: string;
  accentColor: string;
  /** Per-app modal chrome overrides (background, card + button radius). */
  styleOverrides?: ModalStyleOverrides;
  step: 'form' | 'tx';
  txTitle: string;
  assets: WalletBalanceRecord[];
  selectedAsset: WalletBalanceRecord | null;
  selectedChain: WalletChain | null;
  /**
   * The networks the user can send from, in the app's configured order. The
   * picker renders only with two or more, so a single-chain app shows none.
   */
  chains?: WalletChain[];
  /** @deprecated Kept for compatibility; the sender address is no longer shown. */
  walletAddress?: string;
  /** Can a payment be built on {@link selectedChain}? Stellar and Solana only. */
  canSendOnChain: boolean;
  /**
   * Why the wallet cannot act on-chain right now (its Stellar account is still
   * being created, or its creation failed), or null when it can.
   *
   * Separate from {@link canSendOnChain}: that one is about the NETWORK not
   * having a transfer path, this one about the user's own account. Collapsing
   * them would tell someone waiting on a brand-new wallet that Stellar does not
   * support sending. Optional, so a custom template written before this existed
   * keeps compiling.
   */
  notReadyReason?: string | null;
  onSelectChain?: (chain: WalletChain) => void;
  amount: string;
  destination: string;
  formError: string;
  isLoadingBalance: boolean;
  transaction: TransactionState;
  showXdr: boolean;
  copied: boolean;
  explorerUrl: string | null;
  walletType?: WalletId | null | undefined;
  showBack: boolean;
  isInProgress: boolean;
  onClose: () => void;
  onBack: () => void;
  onRefresh: () => void;
  onSelectAsset: (asset: WalletBalanceRecord) => void;
  onAmountChange: (value: string) => void;
  onMax: () => void;
  onPaste: () => void;
  onDestinationChange: (value: string) => void;
  onSubmit: () => void;
  onSignAndSend: () => void;
  onToggleXdr: () => void;
  onCopyHash: () => void;
  onRetry: () => void;
  onDone: () => void;
}

export function SendModalTemplate({
  theme,
  accentColor,
  styleOverrides,
  step,
  txTitle,
  assets,
  selectedAsset,
  selectedChain,
  canSendOnChain,
  notReadyReason,
  chains,
  onSelectChain,
  amount,
  destination,
  formError,
  isLoadingBalance,
  transaction,
  showXdr,
  copied,
  explorerUrl,
  walletType,
  showBack,
  isInProgress,
  onClose,
  onBack,
  onRefresh,
  onSelectAsset,
  onAmountChange,
  onMax,
  onPaste,
  onDestinationChange,
  onSubmit,
  onSignAndSend,
  onToggleXdr,
  onCopyHash,
  onRetry,
  onDone,
}: SendModalTemplateProps) {
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);

  const parsedAmount = amount ? Number(amount) : 0;
  const availableAmount =
    selectedAsset?.available === null || selectedAsset?.available === undefined ? 0 : Number(selectedAsset.available);
  const canSubmit =
    canSendOnChain &&
    !notReadyReason &&
    !!selectedAsset &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= availableAmount &&
    !!destination.trim() &&
    !isLoadingBalance;

  const title = step === 'form' ? 'Send' : txTitle;

  return (
    <div
      className="pollar-modal-card pollar-send-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="pollar-modal-header">
        <div className="pollar-send-header-left">
          {showBack && (
            <button type="button" className="pollar-modal-close" onClick={onBack} aria-label="Back">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <div className="pollar-send-title-copy">
            <h2 className="pollar-modal-title">{title}</h2>
            {step === 'form' && (
              <p className="pollar-send-subtitle">Transfer assets to another {chainLabel(selectedChain)} wallet</p>
            )}
          </div>
        </div>
        {!isInProgress && (
          <div className="pollar-modal-header-actions">
            {step === 'form' && (
              <button
                type="button"
                className="pollar-modal-close"
                onClick={onRefresh}
                disabled={isLoadingBalance}
                aria-label="Refresh"
                title="Refresh balances"
              >
                <RefreshIcon spinning={isLoadingBalance} />
              </button>
            )}
            <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Form step */}
      {step === 'form' && (
        <>
          {/* Network selector - drives the asset list below */}
          {chains && onSelectChain && (
            <ChainSelect value={selectedChain} options={chains} onChange={onSelectChain} disabled={isLoadingBalance} />
          )}

          {!canSendOnChain && <div className="pollar-modal-empty">Sending is not available on this network yet.</div>}
          {canSendOnChain && notReadyReason && <div className="pollar-modal-empty">{notReadyReason}</div>}

          {/* Asset selector */}
          <SendAssetSelector
            assets={assets}
            selectedAsset={selectedAsset}
            loading={isLoadingBalance}
            onSelectAsset={onSelectAsset}
          />

          {/* Amount */}
          <div className="pollar-send-field">
            <div className="pollar-send-label-row">
              <label className="pollar-send-label">Amount</label>
              {selectedAsset && (
                <span className="pollar-send-hint">
                  Available: {formatBalance(selectedAsset.available)} {selectedAsset.code}
                </span>
              )}
            </div>
            <div className="pollar-send-input-shell">
              <input
                className="pollar-input pollar-send-amount-input"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                aria-label="Amount"
              />
              <div className="pollar-send-input-suffix">
                <button
                  type="button"
                  className="pollar-send-inline-action"
                  onClick={onMax}
                  disabled={!selectedAsset?.available}
                >
                  Max
                </button>
                <span>{selectedAsset?.code ?? ''}</span>
              </div>
            </div>
          </div>

          {/* Destination */}
          <div className="pollar-send-field">
            <label className="pollar-send-label">Destination wallet</label>
            <div className="pollar-send-input-shell">
              <input
                className="pollar-input pollar-send-destination-input"
                type="text"
                placeholder="G…"
                value={destination}
                onChange={(e) => onDestinationChange(e.target.value)}
                aria-label="Destination wallet"
              />
              <button type="button" className="pollar-send-inline-action" onClick={onPaste}>
                Paste
              </button>
            </div>
          </div>

          {formError && <div className="pollar-modal-error">{formError}</div>}

          <div className="pollar-modal-actions">
            <button className="pollar-btn-primary" onClick={onSubmit} disabled={!canSubmit}>
              Continue
            </button>
          </div>
        </>
      )}

      {/* Transaction step */}
      {step === 'tx' && (
        <TxStatusView
          transaction={transaction}
          showXdr={showXdr}
          copied={copied}
          explorerUrl={explorerUrl}
          walletType={walletType}
          onSignAndSend={onSignAndSend}
          onToggleXdr={onToggleXdr}
          onCopyHash={onCopyHash}
          onRetry={onRetry}
          onDone={onDone}
        />
      )}

      <PollarModalFooter />
    </div>
  );
}
