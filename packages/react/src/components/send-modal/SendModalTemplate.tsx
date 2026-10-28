'use client';

import { useInheritedLanguage } from '../../language-context';
import { PollarLanguage, TransactionState, WalletBalanceRecord, WalletChain, WalletId } from '@pollar/core';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AmountField } from '../AmountField';
import { ChainSelect } from '../ChainSelect';
import { PollarModalFooter, RefreshIcon } from '../commons';
import { TxStatusView } from '../transaction-modal/TxStatusView';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';
import { SEND_COPY } from './send-copy';

type SendCopy = (typeof SEND_COPY)['en'];

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

function chainLabel(chain: WalletChain | null, copy: SendCopy): string {
  if (chain === 'STELLAR') return 'Stellar';
  if (chain === 'SOLANA') return 'Solana';
  if (chain === 'POLYGON') return 'Polygon';
  return copy.anyNetwork;
}

// Solana addresses are base58 with no fixed prefix, so they get a label instead.
function destinationPlaceholder(chain: WalletChain | null, copy: SendCopy): string {
  if (chain === 'SOLANA') return copy.solanaAddress;
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
  copy: SendCopy;
}

function availableLabel(asset: WalletBalanceRecord, copy: SendCopy): string {
  return asset.available === null
    ? copy.balanceUnavailable
    : copy.available.replace('{amount}', formatBalance(asset.available));
}

function SendAssetSelector({ assets, selectedAsset, loading, onSelectAsset, copy }: SendAssetSelectorProps) {
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
        <span className="pollar-send-label">{copy.asset}</span>
        <div className="pollar-send-asset-selector pollar-send-asset-selector-loading" aria-label={copy.loadingAssets}>
          <span className="pollar-spinner pollar-spinner-sm" />
          <span>{copy.loadingAssets}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pollar-send-field">
      <label className="pollar-send-label" id="pollar-send-asset-label">
        {copy.asset}
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
                <small>{availableLabel(selectedAsset, copy)}</small>
              </span>
            </>
          ) : (
            <span className="pollar-send-asset-copy">
              <strong>{copy.noAssets}</strong>
            </span>
          )}
          <svg className="pollar-send-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && assets.length > 0 && (
          <div className="pollar-send-asset-menu" role="listbox" aria-label={copy.assets}>
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
                    <small>{availableLabel(asset, copy)}</small>
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
export type SendMemoType = 'text' | 'id' | 'hash';

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
  /** Language of the modal. Defaults to the user's device; the modal passes the resolved one. */
  language?: PollarLanguage | undefined;
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
  language: languageProp,
}: SendModalTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);
  const copy = SEND_COPY[language];

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

  const title = step === 'form' ? copy.title : step === 'create-account' ? copy.createAccountTitle : txTitle;
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
            <button type="button" className="pollar-modal-close" onClick={onBack} aria-label={copy.back}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <div className="pollar-send-title-copy">
            <h2 className="pollar-modal-title">{title}</h2>
            {step === 'form' && (
              <p className="pollar-send-subtitle">{copy.subtitle.replace('{chain}', chainLabel(selectedChain, copy))}</p>
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
                aria-label={copy.refresh}
                title={copy.refreshBalances}
              >
                <RefreshIcon spinning={isLoadingBalance} />
              </button>
            )}
            <button type="button" className="pollar-modal-close" onClick={onClose} aria-label={copy.close}>
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
            <ChainSelect
              label={copy.network}
              value={selectedChain}
              options={chains}
              onChange={onSelectChain}
              disabled={isLoadingBalance}
            />
          )}

          {!canSendOnChain && <div className="pollar-modal-empty">{copy.sendingUnavailable}</div>}
          {canSendOnChain && notReadyReason && <div className="pollar-modal-empty">{notReadyReason}</div>}

          {/* Asset selector */}
          <SendAssetSelector
            assets={assets}
            selectedAsset={selectedAsset}
            loading={isLoadingBalance}
            onSelectAsset={onSelectAsset}
            copy={copy}
          />

          {/* Amount */}
          <AmountField
            id="pollar-send-amount"
            label={copy.amount}
            value={amount}
            onChange={onAmountChange}
            unit={selectedAsset?.code}
            available={selectedAsset ? selectedAsset.available : undefined}
            onMax={onMax}
          />

          {/* Destination */}
          <div className="pollar-send-field">
            <label className="pollar-send-label">{copy.destination}</label>
            <div className="pollar-send-input-shell">
              <input
                className="pollar-input pollar-send-destination-input"
                type="text"
                placeholder={destinationPlaceholder(selectedChain, copy)}
                value={destination}
                onChange={(e) => onDestinationChange(e.target.value)}
                aria-label={copy.destination}
              />
              <button type="button" className="pollar-send-inline-action" onClick={onPaste}>
                {copy.paste}
              </button>
            </div>
          </div>

          {selectedChain === 'STELLAR' && onMemoChange && (
            <div className="pollar-send-field">
              <label className="pollar-send-label" htmlFor="pollar-send-memo">
                {copy.memo} <span className="pollar-send-label-optional">{copy.optional}</span>
              </label>
              <div className="pollar-send-memo-row">
                <select
                  className="pollar-input pollar-send-memo-type"
                  value={memoType}
                  onChange={(e) => onMemoTypeChange?.(e.target.value as SendMemoType)}
                  aria-label={copy.memoType}
                >
                  <option value="text">{copy.memoTypes.text}</option>
                  <option value="id">{copy.memoTypes.id}</option>
                  <option value="hash">{copy.memoTypes.hash}</option>
                </select>
                <input
                  id="pollar-send-memo"
                  className="pollar-input pollar-send-memo-input"
                  type="text"
                  inputMode={memoType === 'id' ? 'numeric' : 'text'}
                  placeholder={
                    memoType === 'id' ? '123456789' : memoType === 'hash' ? copy.memoHashPlaceholder : copy.memoTextPlaceholder
                  }
                  value={memo}
                  onChange={(e) => onMemoChange(e.target.value)}
                />
              </div>
            </div>
          )}

          {formError && <div className="pollar-modal-error">{formError}</div>}

          <div className="pollar-modal-actions">
            <button className="pollar-btn-primary" onClick={onSubmit} disabled={!canSubmit}>
              {isCheckingDestination ? copy.checkingDestination : copy.continue}
            </button>
          </div>
        </>
      )}

      {/* Destination has no account */}
      {step === 'create-account' && (
        <>
          <div className="pollar-send-notice">
            <p className="pollar-send-notice-title">{copy.accountMissingTitle}</p>
            <p className="pollar-send-notice-address">{destination.trim()}</p>
            {createsWithNative ? (
              <p>
                {copy.createNativeBefore} <strong>{copy.createNativeStrong}</strong>{' '}
                {copy.createNativeAfter.replace('{amount}', amount)}
              </p>
            ) : (
              <p>
                {copy.createNonNative
                  .replace('{asset}', selectedAsset?.code ?? copy.thisAsset)
                  .replace('{trustAsset}', selectedAsset?.code ?? copy.theAsset)}
              </p>
            )}
            {createsWithNative && !meetsMinimum && (
              <p className="pollar-send-notice-warning">{copy.minimumWarning.replace('{min}', String(minStartingBalance))}</p>
            )}
            <p>{copy.orWait}</p>
          </div>

          <div className="pollar-send-account-actions">
            {createsWithNative && onCreateAccount && (
              <button className="pollar-btn-primary" onClick={onCreateAccount} disabled={!meetsMinimum}>
                {copy.createWith.replace('{amount}', amount)}
              </button>
            )}
            <button className="pollar-btn-secondary" onClick={onBack}>
              {copy.wait}
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
          language={language}
        />
      )}

      <PollarModalFooter />
    </div>
  );
}
