'use client';

import { TransactionState, WalletBalanceRecord, WalletChain, WalletId } from '@pollar/core';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AmountField } from '../AmountField';
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

// Solana addresses are base58 with no fixed prefix, so they get a label instead.
function destinationPlaceholder(chain: WalletChain | null): string {
  if (chain === 'SOLANA') return 'Solana address';
  if (chain === 'POLYGON') return '0x…';
  return 'G…';
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

/** The memo types the backend accepts on a Stellar payment. */
export type SendMemoType = 'text' | 'id';

export interface SendModalTemplateProps {
  theme: string;
  accentColor: string;
  /** Per-app modal chrome overrides (background, card + button radius). */
  styleOverrides?: ModalStyleOverrides;
  /**
   * `create-account`: the Stellar destination has no account yet, so the user
   * chooses between creating it with the XLM being sent and waiting for someone
   * else to fund it.
   */
  step: 'form' | 'create-account' | 'tx';
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
  /** The destination's account is being looked up; the form waits for it. */
  isCheckingDestination?: boolean;
  /** The least XLM a new Stellar account can start with. */
  minStartingBalance?: number;
  /** Builds a `create_account` for the destination, funded with the amount. Required for the `create-account` step. */
  onCreateAccount?: () => void;
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
  /**
   * Optional Stellar memo. The field renders only on Stellar and only when
   * {@link onMemoChange} is passed, so a custom template written before it
   * existed keeps compiling.
   */
  memo?: string;
  memoType?: SendMemoType;
  onMemoChange?: (value: string) => void;
  onMemoTypeChange?: (type: SendMemoType) => void;
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
  isCheckingDestination = false,
  minStartingBalance = 1,
  onCreateAccount,
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
  memo = '',
  memoType = 'text',
  onMemoChange,
  onMemoTypeChange,
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
    !isLoadingBalance &&
    !isCheckingDestination;

  const title = step === 'form' ? 'Send' : step === 'create-account' ? 'Create account?' : txTitle;
  // Only XLM can create an account; any other asset needs the account to exist first.
  const createsWithNative = selectedAsset?.type === 'native';
  const meetsMinimum = Number.isFinite(parsedAmount) && parsedAmount >= minStartingBalance;

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
          <AmountField
            id="pollar-send-amount"
            label="Amount"
            value={amount}
            onChange={onAmountChange}
            unit={selectedAsset?.code}
            available={selectedAsset ? selectedAsset.available : undefined}
            onMax={onMax}
          />

          {/* Destination */}
          <div className="pollar-send-field">
            <label className="pollar-send-label">Destination wallet</label>
            <div className="pollar-send-input-shell">
              <input
                className="pollar-input pollar-send-destination-input"
                type="text"
                placeholder={destinationPlaceholder(selectedChain)}
                value={destination}
                onChange={(e) => onDestinationChange(e.target.value)}
                aria-label="Destination wallet"
              />
              <button type="button" className="pollar-send-inline-action" onClick={onPaste}>
                Paste
              </button>
            </div>
          </div>

          {selectedChain === 'STELLAR' && onMemoChange && (
            <div className="pollar-send-field">
              <label className="pollar-send-label" htmlFor="pollar-send-memo">
                Memo <span className="pollar-send-label-optional">(optional)</span>
              </label>
              <div className="pollar-send-memo-row">
                <select
                  className="pollar-input pollar-send-memo-type"
                  value={memoType}
                  onChange={(e) => onMemoTypeChange?.(e.target.value as SendMemoType)}
                  aria-label="Memo type"
                >
                  <option value="text">Text</option>
                  <option value="id">ID</option>
                </select>
                <input
                  id="pollar-send-memo"
                  className="pollar-input pollar-send-memo-input"
                  type="text"
                  inputMode={memoType === 'id' ? 'numeric' : 'text'}
                  placeholder={memoType === 'id' ? '123456789' : 'Up to 28 characters'}
                  value={memo}
                  onChange={(e) => onMemoChange(e.target.value)}
                />
              </div>
            </div>
          )}

          {formError && <div className="pollar-modal-error">{formError}</div>}

          <div className="pollar-modal-actions">
            <button className="pollar-btn-primary" onClick={onSubmit} disabled={!canSubmit}>
              {isCheckingDestination ? 'Checking destination…' : 'Continue'}
            </button>
          </div>
        </>
      )}

      {/* Destination has no account */}
      {step === 'create-account' && (
        <>
          <div className="pollar-send-notice">
            <p className="pollar-send-notice-title">This account doesn't exist yet</p>
            <p className="pollar-send-notice-address">{destination.trim()}</p>
            {createsWithNative ? (
              <p>
                A Stellar account has to be created and funded before it can receive payments. Instead of a payment, this will{' '}
                <strong>create the account</strong> with {amount} XLM as its starting balance.
              </p>
            ) : (
              <p>
                It can't receive {selectedAsset?.code ?? 'this asset'} yet: it has to be created and funded with XLM first, and
                then add a trustline for {selectedAsset?.code ?? 'the asset'}.
              </p>
            )}
            {createsWithNative && !meetsMinimum && (
              <p className="pollar-send-notice-warning">
                A new account needs a starting balance of at least {minStartingBalance} XLM. Go back and raise the amount to
                create it.
              </p>
            )}
            <p>Or wait until another wallet funds it, and send afterwards.</p>
          </div>

          <div className="pollar-send-account-actions">
            {createsWithNative && onCreateAccount && (
              <button className="pollar-btn-primary" onClick={onCreateAccount} disabled={!meetsMinimum}>
                Create account with {amount} XLM
              </button>
            )}
            <button className="pollar-btn-secondary" onClick={onBack}>
              I'll wait until it's funded
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
