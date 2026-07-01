'use client';

import { SwapProvider, SwapQuote, SwapQuoteParams, TransactionState, WalletId } from '@pollar/core';
import { type CSSProperties } from 'react';
import { PollarModalFooter } from '../commons';
import { TxStatusView } from '../transaction-modal/TxStatusView';

/** A selectable asset in the sell/buy pickers, normalized across balance/enabled records. */
export interface SwapAssetOption {
  ref: SwapQuoteParams['sellAsset'];
  code: string;
  issuer?: string | undefined;
  available?: string | undefined;
  enabledInApp?: boolean | undefined;
}

export function assetOptionKey(o: SwapAssetOption): string {
  return `${o.code}:${o.issuer ?? 'native'}`;
}

const PROVIDER_LABELS: Record<SwapProvider, string> = {
  auto: 'Best price (auto)',
  aquarius: 'Aquarius',
  soroswap: 'Soroswap',
  sdex: 'Stellar DEX',
};


function formatAmount(value: string): string {
  const n = parseFloat(value);
  return isNaN(n) ? value : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

export interface SwapModalTemplateProps {
  theme: string;
  accentColor: string;
  step: 'form' | 'tx';
  txTitle: string;
  sellOptions: SwapAssetOption[];
  buyOptions: SwapAssetOption[];
  selectedSell: SwapAssetOption | null;
  selectedBuy: SwapAssetOption | null;
  amount: string;
  provider: SwapProvider;
  providers: SwapProvider[];
  quote: SwapQuote | null;
  quoteLoading: boolean;
  quoteError: string;
  formError: string;
  isLoadingData: boolean;
  smartUnsupported: boolean;
  /** Swap config is still loading. */
  configLoading: boolean;
  /** Config loaded and this app exposes no swap venues — swap is disabled. */
  swapUnavailable: boolean;
  transaction: TransactionState;
  showXdr: boolean;
  copied: boolean;
  explorerUrl: string | null;
  walletType?: WalletId | null | undefined;
  showBack: boolean;
  isInProgress: boolean;
  onClose: () => void;
  onBack: () => void;
  onSelectSell: (o: SwapAssetOption) => void;
  onSelectBuy: (o: SwapAssetOption) => void;
  onAmountChange: (value: string) => void;
  onProviderChange: (p: SwapProvider) => void;
  onSwap: () => void;
  onToggleXdr: () => void;
  onCopyHash: () => void;
  onRetry: () => void;
  onDone: () => void;
}

export function SwapModalTemplate({
  theme,
  accentColor,
  step,
  txTitle,
  sellOptions,
  buyOptions,
  selectedSell,
  selectedBuy,
  amount,
  provider,
  providers,
  quote,
  quoteLoading,
  quoteError,
  formError,
  isLoadingData,
  smartUnsupported,
  configLoading,
  swapUnavailable,
  transaction,
  showXdr,
  copied,
  explorerUrl,
  walletType,
  showBack,
  isInProgress,
  onClose,
  onBack,
  onSelectSell,
  onSelectBuy,
  onAmountChange,
  onProviderChange,
  onSwap,
  onToggleXdr,
  onCopyHash,
  onRetry,
  onDone,
}: SwapModalTemplateProps) {
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

  const sellKey = selectedSell ? assetOptionKey(selectedSell) : '';
  const buyKey = selectedBuy ? assetOptionKey(selectedBuy) : '';
  const canSwap =
    !smartUnsupported && !!selectedSell && !!selectedBuy && !!amount && !!quote && !quoteLoading && !isLoadingData;

  const title = step === 'form' ? 'Swap' : txTitle;

  return (
    <div className="pollar-modal-card pollar-send-modal" data-theme={theme} style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-modal-header">
        <div className="pollar-send-header-left">
          {showBack && (
            <button type="button" className="pollar-modal-close" onClick={onBack} aria-label="Back">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <h2 className="pollar-modal-title">{title}</h2>
        </div>
        {!isInProgress && (
          <div className="pollar-modal-header-actions">
            <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {step === 'form' && configLoading && <div className="pollar-send-hint">Loading swap options…</div>}

      {step === 'form' && !configLoading && swapUnavailable && (
        <div className="pollar-modal-error">Swap is not available for this app.</div>
      )}

      {step === 'form' && !configLoading && !swapUnavailable && (
        <>
          {smartUnsupported && (
            <div className="pollar-modal-error">Swaps are not yet available for smart (passkey) wallets.</div>
          )}

          {/* Sell asset */}
          <div className="pollar-send-field">
            <label className="pollar-send-label">You pay</label>
            {isLoadingData ? (
              <div className="pollar-send-skeleton" />
            ) : (
              <select
                className="pollar-input pollar-send-select"
                value={sellKey}
                onChange={(e) => {
                  const found = sellOptions.find((o) => assetOptionKey(o) === e.target.value);
                  if (found) onSelectSell(found);
                }}
              >
                <option value="" disabled>
                  Select asset to sell
                </option>
                {sellOptions.map((o) => (
                  <option key={assetOptionKey(o)} value={assetOptionKey(o)}>
                    {o.code}
                    {o.available !== undefined ? ` — ${formatAmount(o.available)} available` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Amount */}
          <div className="pollar-send-field">
            <div className="pollar-send-label-row">
              <label className="pollar-send-label">Amount</label>
              {selectedSell?.available !== undefined && (
                <span className="pollar-send-hint">
                  Available: {formatAmount(selectedSell.available)} {selectedSell.code}
                </span>
              )}
            </div>
            <input
              className="pollar-input"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
            />
          </div>

          {/* Buy asset */}
          <div className="pollar-send-field">
            <label className="pollar-send-label">You receive</label>
            {isLoadingData ? (
              <div className="pollar-send-skeleton" />
            ) : (
              <select
                className="pollar-input pollar-send-select"
                value={buyKey}
                onChange={(e) => {
                  const found = buyOptions.find((o) => assetOptionKey(o) === e.target.value);
                  if (found) onSelectBuy(found);
                }}
              >
                <option value="" disabled>
                  Select asset to buy
                </option>
                {buyOptions.map((o) => (
                  <option key={assetOptionKey(o)} value={assetOptionKey(o)}>
                    {o.code}
                    {o.enabledInApp ? '' : ' (external)'}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Route selector */}
          <div className="pollar-send-field">
            <label className="pollar-send-label">Route</label>
            <select
              className="pollar-input pollar-send-select"
              value={provider}
              onChange={(e) => onProviderChange(e.target.value as SwapProvider)}
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {/* Quote panel */}
          {quoteLoading && <div className="pollar-send-hint">Fetching best price…</div>}
          {!quoteLoading && quoteError && <div className="pollar-modal-error">{quoteError}</div>}
          {!quoteLoading && !quoteError && quote && selectedBuy && (
            <div className="pollar-swap-quote">
              <div className="pollar-swap-quote-row">
                <span className="pollar-send-hint">You receive</span>
                <span>
                  ~ {formatAmount(quote.amountOut)} {selectedBuy.code}
                </span>
              </div>
              <div className="pollar-swap-quote-row">
                <span className="pollar-send-hint">Minimum received</span>
                <span>
                  {formatAmount(quote.minReceived)} {selectedBuy.code}
                </span>
              </div>
              <div className="pollar-swap-quote-row">
                <span className="pollar-send-hint">Price impact</span>
                <span>{quote.priceImpactPct}%</span>
              </div>
              <div className="pollar-swap-quote-row">
                <span className="pollar-send-hint">Route</span>
                <span>{PROVIDER_LABELS[quote.provider]}</span>
              </div>
            </div>
          )}
          {!quoteLoading && !quoteError && !quote && selectedSell && selectedBuy && !!amount && (
            <div className="pollar-send-hint">No route found for this pair.</div>
          )}

          {formError && <div className="pollar-modal-error">{formError}</div>}

          <div className="pollar-modal-actions">
            <button className="pollar-btn-primary" onClick={onSwap} disabled={!canSwap}>
              Swap
            </button>
          </div>
        </>
      )}

      {step === 'tx' && (
        <TxStatusView
          transaction={transaction}
          showXdr={showXdr}
          copied={copied}
          explorerUrl={explorerUrl}
          walletType={walletType}
          onSignAndSend={() => {}}
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
