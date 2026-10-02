'use client';

import { SwapProvider, SwapQuote, SwapQuoteParams, TransactionState, WalletId } from '@pollar/core';
import { PollarModalFooter, RefreshIcon } from '../commons';
import { TxStatusView } from '../transaction-modal/TxStatusView';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';

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
  auto: 'Best price',
  aquarius: 'Aquarius',
  soroswap: 'Soroswap',
  sdex: 'Stellar DEX',
};

function formatAmount(value: string | undefined): string {
  if (value === undefined) return '—';
  const n = parseFloat(value);
  return isNaN(n) ? value : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

/** Decimal division for display only. All intermediate arithmetic stays in BigInt. */
function formatRate(numerator: string, denominator: string): string | null {
  const parse = (value: string) => {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
    const [whole = '0', fraction = ''] = trimmed.split('.');
    return { digits: BigInt(`${whole}${fraction}`), scale: fraction.length };
  };
  const top = parse(numerator);
  const bottom = parse(denominator);
  if (!top || !bottom || bottom.digits === 0n || top.digits === 0n) return null;

  const precision = 8;
  const scaledNumerator = top.digits * 10n ** BigInt(bottom.scale + precision);
  const scaledDenominator = bottom.digits * 10n ** BigInt(top.scale);
  const scaled = scaledNumerator / scaledDenominator;
  const whole = scaled / 10n ** BigInt(precision);
  const fraction = (scaled % 10n ** BigInt(precision)).toString().padStart(precision, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function AssetIcon({ code }: { code: string }) {
  return <span className="pollar-swap-asset-icon" aria-hidden>{code.slice(0, 2).toUpperCase()}</span>;
}

function AssetPill({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: SwapAssetOption[];
  disabled: boolean;
  onChange: (key: string) => void;
}) {
  const selected = options.find((option) => assetOptionKey(option) === value);
  const appAssets = options.filter((option) => option.enabledInApp);
  const otherAssets = options.filter((option) => !option.enabledInApp);

  return (
    <label className="pollar-swap-asset-pill-wrap">
      <span className="sr-only">{label}</span>
      <AssetIcon code={selected?.code ?? '—'} />
      <select
        className="pollar-swap-asset-pill"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {value === '' && <option value="" disabled hidden />}
        {appAssets.length > 0 && (
          <optgroup label="App assets">
            {appAssets.map((option) => (
              <option key={assetOptionKey(option)} value={assetOptionKey(option)}>{option.code}</option>
            ))}
          </optgroup>
        )}
        {otherAssets.length > 0 && (
          <optgroup label="Other assets">
            {otherAssets.map((option) => (
              <option key={assetOptionKey(option)} value={assetOptionKey(option)}>{option.code}</option>
            ))}
          </optgroup>
        )}
      </select>
      <svg className="pollar-swap-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="m3.5 5.25 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

export interface SwapModalTemplateProps {
  theme: string;
  accentColor: string;
  styleOverrides?: ModalStyleOverrides;
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
  configLoading: boolean;
  swapUnavailable: boolean;
  buyNeedsTrustline: boolean;
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
  onSelectSell: (o: SwapAssetOption) => void;
  onSelectBuy: (o: SwapAssetOption) => void;
  onReverse: () => void;
  onMax: () => void;
  onAddCustomToken: (code: string, issuer: string) => string | null;
  onAmountChange: (value: string) => void;
  onProviderChange: (p: SwapProvider) => void;
  onSwap: () => void;
  onToggleXdr: () => void;
  onCopyHash: () => void;
  onRetry: () => void;
  onDone: () => void;
}

export function SwapModalTemplate({
  theme, accentColor, styleOverrides, step, txTitle, sellOptions, buyOptions, selectedSell, selectedBuy, amount,
  provider, providers, quote, quoteLoading, quoteError, formError, isLoadingData, smartUnsupported, configLoading,
  swapUnavailable, buyNeedsTrustline, transaction, showXdr, copied, explorerUrl, walletType, showBack, isInProgress,
  onClose, onBack, onRefresh, onSelectSell, onSelectBuy, onReverse, onMax, onAmountChange,
  onProviderChange, onSwap, onToggleXdr, onCopyHash, onRetry, onDone,
}: SwapModalTemplateProps) {
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);
  const sellKey = selectedSell ? assetOptionKey(selectedSell) : '';
  const buyKey = selectedBuy ? assetOptionKey(selectedBuy) : '';
  const sameAsset = !!selectedSell && !!selectedBuy && sellKey === buyKey;
  const canSwap = !smartUnsupported && !sameAsset && !!selectedSell && !!selectedBuy && !!amount && !!quote && !quoteLoading && !isLoadingData;
  const rate = quote && amount ? formatRate(quote.amountOut, amount) : null;
  const title = step === 'form' ? 'Swap' : txTitle;

  const selectSell = (key: string) => {
    const found = sellOptions.find((option) => assetOptionKey(option) === key);
    if (found) onSelectSell(found);
  };
  const selectBuy = (key: string) => {
    const found = buyOptions.find((option) => assetOptionKey(option) === key);
    if (found) onSelectBuy(found);
  };
  return (
    <div className="pollar-modal-card pollar-swap-modal" data-theme={theme} style={cssVars} onClick={(event) => event.stopPropagation()}>
      <div className="pollar-modal-header">
        <div className="pollar-send-header-left">
          {showBack && (
            <button type="button" className="pollar-modal-close" onClick={onBack} aria-label="Back">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          <h2 className="pollar-modal-title">{title}</h2>
        </div>
        {!isInProgress && (
          <div className="pollar-modal-header-actions">
            {step === 'form' && (
              <button type="button" className="pollar-modal-close" onClick={onRefresh} disabled={configLoading || isLoadingData} aria-label="Refresh" title="Refresh balances and options">
                <RefreshIcon spinning={configLoading || isLoadingData} />
              </button>
            )}
            <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        )}
      </div>

      {step === 'form' && !configLoading && swapUnavailable && <div className="pollar-modal-error">Swap is not available for this app.</div>}

      {step === 'form' && !swapUnavailable && (
        <>
          {smartUnsupported && <div className="pollar-modal-error">Swaps are not yet available for smart (passkey) wallets.</div>}

          <div className="pollar-swap-panels">
            <section className="pollar-swap-panel" aria-labelledby="pollar-swap-pay-label">
              <div className="pollar-swap-panel-heading">
                <span id="pollar-swap-pay-label" className="pollar-swap-panel-label">You pay</span>
                <span className="pollar-swap-balance">Balance: {formatAmount(selectedSell?.available)}</span>
              </div>
              <div className="pollar-swap-panel-main">
                <input className="pollar-swap-amount" type="text" inputMode="decimal" aria-label="Amount to pay" placeholder="0.00" value={amount} disabled={configLoading || isLoadingData} onChange={(event) => onAmountChange(event.target.value)} />
                <div className="pollar-swap-panel-selector">
                  <AssetPill label="Asset to pay" value={sellKey} options={sellOptions} disabled={configLoading || isLoadingData} onChange={selectSell} />
                  <button type="button" className="pollar-swap-max" onClick={onMax} disabled={!selectedSell?.available || configLoading || isLoadingData}>Max</button>
                </div>
              </div>
            </section>

            <button type="button" className="pollar-swap-reverse" onClick={onReverse} disabled={!selectedSell || !selectedBuy} aria-label="Swap pay and receive assets" title="Swap pay and receive assets">
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden><path d="M5 3v10M5 3 2.5 5.5M5 3l2.5 2.5M12 14V4M12 14l2.5-2.5M12 14 9.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>

            <section className="pollar-swap-panel" aria-labelledby="pollar-swap-receive-label">
              <div className="pollar-swap-panel-heading">
                <span id="pollar-swap-receive-label" className="pollar-swap-panel-label">You receive</span>
                <span className="pollar-swap-balance">Balance: {formatAmount(selectedBuy?.available)}</span>
              </div>
              <div className="pollar-swap-panel-main">
                <div className={`pollar-swap-output${quoteLoading ? ' is-loading' : ''}`} aria-live="polite">
                  {quoteLoading ? <span className="pollar-spinner pollar-spinner-sm" /> : formatAmount(quote?.amountOut)}
                </div>
                <div className="pollar-swap-panel-selector">
                  <AssetPill label="Asset to receive" value={buyKey} options={buyOptions} disabled={configLoading || isLoadingData} onChange={selectBuy} />
                  <span className="pollar-swap-panel-note">Quoted amount</span>
                </div>
              </div>
            </section>
          </div>

          {/* Custom code/issuer entry remains supported by the swap state, but is
              intentionally hidden from the redesigned modal for now. */}

          <div className="pollar-swap-rate-row">
            <div className="pollar-swap-rate" aria-live="polite">
              {rate && selectedSell && selectedBuy ? <>1 {selectedSell.code} ≈ {rate} {selectedBuy.code}</> : quoteLoading ? 'Updating rate…' : 'Exchange rate unavailable'}
            </div>
            {configLoading ? (
              <div className="pollar-swap-route-pill"><span className="pollar-spinner pollar-spinner-sm" /> Loading</div>
            ) : (
              <label className="pollar-swap-route-wrap">
                <span className="sr-only">Route</span>
                <select className="pollar-swap-route-pill" aria-label="Route" value={provider} disabled={providers.length === 0} onChange={(event) => onProviderChange(event.target.value as SwapProvider)}>
                  {providers.length === 0 ? <option value={provider}>{PROVIDER_LABELS[provider]}</option> : providers.map((p) => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
                </select>
              </label>
            )}
          </div>

          {!quoteLoading && quoteError && <div className="pollar-modal-error">{quoteError}</div>}
          {!quoteLoading && !quoteError && !quote && selectedSell && selectedBuy && !!amount && <div className="pollar-send-hint">No route found for this pair.</div>}
          {quote && (
            <div className="pollar-swap-quote">
              <div className="pollar-swap-quote-row"><span>Minimum received</span><strong>{formatAmount(quote.minReceived)} {selectedBuy?.code}</strong></div>
              <div className="pollar-swap-quote-row"><span>Price impact</span><strong>{quote.priceImpactPct}%</strong></div>
              <div className="pollar-swap-quote-row"><span>Route</span><strong>{PROVIDER_LABELS[quote.provider]}</strong></div>
            </div>
          )}
          {buyNeedsTrustline && selectedBuy && <div className="pollar-swap-trustline-notice">To receive {selectedBuy.code} your wallet needs a trustline. Swapping will create it first (~0.5 XLM reserve, refundable if you later remove it).</div>}
          {sameAsset && <div className="pollar-modal-error">Choose two different assets to swap.</div>}
          {formError && <div className="pollar-modal-error">{formError}</div>}

          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-primary" onClick={onSwap} disabled={!canSwap}>{buyNeedsTrustline ? 'Create trustline & swap' : 'Swap'}</button>
          </div>
        </>
      )}

      {step === 'tx' && <TxStatusView transaction={transaction} showXdr={showXdr} copied={copied} explorerUrl={explorerUrl} walletType={walletType} onSignAndSend={() => {}} onToggleXdr={onToggleXdr} onCopyHash={onCopyHash} onRetry={onRetry} onDone={onDone} />}
      <PollarModalFooter shield />
    </div>
  );
}
