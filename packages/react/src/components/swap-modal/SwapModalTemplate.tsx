'use client';

import { useInheritedLanguage } from '../../language-context';
import {
  type PendingConfirmation,
  type PollarLanguage,
  type StellarNetwork,
  SwapDestinationChain,
  SwapQuoteParams,
  TransactionState,
  WalletId,
} from '@pollar/core';
import { useState } from 'react';
import { PollarModalFooter, RefreshIcon } from '../commons';
import { PollarSelect } from '../PollarSelect';
import { TxStatusHeading, TxStatusView, txStatusReview } from '../transaction-modal/TxStatusView';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';
import { SWAP_COPY } from './swap-copy';

type SwapCopy = (typeof SWAP_COPY)[PollarLanguage];

/** The chain a swap runs on; the modal shows a selector when the app offers both. */
export type SwapChain = 'STELLAR' | 'SOLANA';

export interface SwapAssetOption {
  /** Stellar: the asset ref the quote takes. */
  ref?: SwapQuoteParams['sellAsset'] | undefined;
  code: string;
  /** Stellar: the issuer. Solana: the mint (wrapped SOL for SOL). */
  issuer?: string | undefined;
  /** Solana: the mint's decimals, to turn a decimal amount into base units. */
  decimals?: number | undefined;
  available?: string | undefined;
  enabledInApp?: boolean | undefined;
}

/** A quote as the form shows it, whichever chain priced it: decimal amounts. */
export interface SwapQuoteView {
  provider: string;
  amountOut: string;
  minReceived: string;
  /** Percent; null when the venue does not report it. */
  priceImpactPct: string | null;
  /** What the route charges, labelled. */
  fees?: Array<{ label: string; value: string }>;
  totalFeesUsd?: number | null;
  /** Seconds the price is good for; null when it has no window. */
  expiresInSeconds?: number | null;
}

/** A cross-chain swap's delivery on the destination chain, once its Solana transaction landed. */
export interface SwapSettlementView {
  kind: 'pending' | 'completed' | 'held' | 'refunded' | 'failed';
  text: string;
  /** The user's wallet it delivers to. */
  address: string | null;
  explorerUrl: string | null;
}

export function assetOptionKey(o: SwapAssetOption): string {
  return `${o.code}:${o.issuer ?? 'native'}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  aquarius: 'Aquarius',
  soroswap: 'Soroswap',
  sdex: 'Stellar DEX',
  jupiter: 'Jupiter',
  titan: 'Titan',
};

const providerLabel = (provider: string, copy: SwapCopy) =>
  provider === 'auto'
    ? copy.bestPrice
    : provider === 'multichain'
      ? copy.multichainVenue
      : (PROVIDER_LABELS[provider] ?? provider);

const CHAIN_LABELS: Record<SwapChain | SwapDestinationChain, string> = {
  STELLAR: 'Stellar',
  SOLANA: 'Solana',
  POLYGON: 'Polygon',
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
  return (
    <span className="pollar-swap-asset-icon" aria-hidden>
      {code.slice(0, 2).toUpperCase()}
    </span>
  );
}

function AssetPill({
  label,
  value,
  options,
  disabled,
  copy,
  onChange,
}: {
  label: string;
  value: string;
  options: SwapAssetOption[];
  disabled: boolean;
  copy: SwapCopy;
  onChange: (key: string) => void;
}) {
  const selected = options.find((option) => assetOptionKey(option) === value);
  const appAssets = options.filter((option) => option.enabledInApp);
  const otherAssets = options.filter((option) => !option.enabledInApp);

  return (
    <label className="pollar-swap-asset-pill-wrap">
      <span className="sr-only">{label}</span>
      <AssetIcon code={selected?.code ?? '—'} />
      <PollarSelect
        className="pollar-swap-asset-pill"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={[
          {
            label: copy.appAssets,
            options: appAssets.map((option) => ({ value: assetOptionKey(option), label: option.code })),
          },
          {
            label: copy.otherAssets,
            options: otherAssets.map((option) => ({ value: assetOptionKey(option), label: option.code })),
          },
        ]}
      />
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
  /** The chains the app offers swaps on; a selector shows when there are two. */
  chains: SwapChain[];
  chain: SwapChain;
  /** Where a Solana swap can deliver; a selector shows when there is more than one. */
  destinations?: SwapDestinationChain[];
  destination?: SwapDestinationChain;
  /** USDC to USDC across chains: a transfer, which the swap does not do. */
  usdcAcross?: boolean;
  settlement?: SwapSettlementView | null;
  /** The signature waiting for the user's yes, answered in the transaction step. */
  confirmation?: PendingConfirmation | null | undefined;
  /** The app's network, for the details of a confirmation. */
  network?: StellarNetwork | undefined;
  provider: string;
  providers: string[];
  quote: SwapQuoteView | null;
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
  /** Language of the modal's text; the device's when not given. */
  language?: PollarLanguage | undefined;
  onClose: () => void;
  onBack: () => void;
  onRefresh: () => void;
  onSelectSell: (o: SwapAssetOption) => void;
  onSelectBuy: (o: SwapAssetOption) => void;
  onReverse: () => void;
  onMax: () => void;
  onAddCustomToken: (code: string, issuer: string) => string | null;
  onAmountChange: (value: string) => void;
  onChainChange: (chain: SwapChain) => void;
  onDestinationChange?: (chain: SwapDestinationChain) => void;
  onProviderChange: (p: string) => void;
  onSwap: () => void;
  onToggleXdr: () => void;
  onCopyHash: () => void;
  onRetry: () => void;
  onDone: () => void;
}

export function SwapModalTemplate({
  theme,
  accentColor,
  styleOverrides,
  step,
  txTitle,
  sellOptions,
  buyOptions,
  selectedSell,
  selectedBuy,
  amount,
  chains,
  chain,
  destinations = [],
  destination = 'SOLANA',
  usdcAcross = false,
  settlement = null,
  confirmation = null,
  network,
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
  buyNeedsTrustline,
  transaction,
  showXdr,
  copied,
  explorerUrl,
  walletType,
  showBack,
  isInProgress,
  language: languageProp,
  onClose,
  onBack,
  onRefresh,
  onSelectSell,
  onSelectBuy,
  onAddCustomToken,
  onReverse,
  onMax,
  onAmountChange,
  onChainChange,
  onDestinationChange,
  onProviderChange,
  onSwap,
  onToggleXdr,
  onCopyHash,
  onRetry,
  onDone,
}: SwapModalTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = SWAP_COPY[language];
  // Where a cross-chain swap delivers is a detail: the strip says how far it got, the rows say where.
  const settlementRows = settlement
    ? [
        ...(settlement.address
          ? [{ label: copy.deliveredTo, value: settlement.address, copyValue: settlement.address, mono: true }]
          : []),
        ...(settlement.explorerUrl
          ? [
              {
                label: TX_REVIEW_COPY[language].viewOnExplorer,
                value: settlement.explorerUrl.replace(/^https:\/\//, '').split('/')[0] ?? settlement.explorerUrl,
                href: settlement.explorerUrl,
              },
            ]
          : []),
      ]
    : [];
  const txReview =
    step === 'tx'
      ? txStatusReview({ transaction, explorerUrl, confirmation, network, extraRows: settlementRows, language })
      : null;
  const [customOpen, setCustomOpen] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [customIssuer, setCustomIssuer] = useState('');
  const [customError, setCustomError] = useState('');

  const submitCustomToken = () => {
    const err = onAddCustomToken(customCode, customIssuer);
    if (err) {
      setCustomError(err);
      return;
    }
    setCustomCode('');
    setCustomIssuer('');
    setCustomError('');
    setCustomOpen(false);
  };

  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);
  const sellKey = selectedSell ? assetOptionKey(selectedSell) : '';
  const buyKey = selectedBuy ? assetOptionKey(selectedBuy) : '';
  const sameAsset = !!selectedSell && !!selectedBuy && sellKey === buyKey;
  const canSwap =
    !smartUnsupported &&
    !sameAsset &&
    !!selectedSell &&
    !!selectedBuy &&
    !!amount &&
    !!quote &&
    !quoteLoading &&
    !usdcAcross &&
    !isLoadingData;
  const rate = quote && amount ? formatRate(quote.amountOut, amount) : null;
  const title = step === 'form' ? copy.title : txTitle;

  const selectSell = (key: string) => {
    const found = sellOptions.find((option) => assetOptionKey(option) === key);
    if (found) onSelectSell(found);
  };
  const selectBuy = (key: string) => {
    const found = buyOptions.find((option) => assetOptionKey(option) === key);
    if (found) onSelectBuy(found);
  };
  return (
    <div
      className="pollar-modal-card pollar-swap-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <div className="pollar-send-header-left">
          {showBack && (
            <button type="button" className="pollar-modal-close" onClick={onBack} aria-label={copy.back}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {step === 'tx' ? (
            <TxStatusHeading review={txReview} fallback={title} />
          ) : (
            <h2 className="pollar-modal-title">{title}</h2>
          )}
        </div>
        {!isInProgress && (
          <div className="pollar-modal-header-actions">
            {step === 'form' && (
              <button
                type="button"
                className="pollar-modal-close"
                onClick={onRefresh}
                disabled={configLoading || isLoadingData}
                aria-label={copy.refresh}
                title={copy.refreshTitle}
              >
                <RefreshIcon spinning={configLoading || isLoadingData} />
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

      {step === 'form' && !configLoading && swapUnavailable && <div className="pollar-modal-error">{copy.unavailable}</div>}

      {step === 'form' && !swapUnavailable && (
        <>
          {chains.length > 1 && (
            <label className="pollar-swap-route-wrap pollar-swap-chain-wrap">
              <span className="sr-only">{copy.network}</span>
              <PollarSelect
                className="pollar-swap-route-pill"
                aria-label={copy.network}
                value={chain}
                disabled={configLoading || isLoadingData}
                onChange={(value) => onChainChange(value as SwapChain)}
                options={chains.map((c) => ({ value: c, label: CHAIN_LABELS[c] }))}
              />
            </label>
          )}

          {destinations.length > 1 && (
            <label className="pollar-swap-route-wrap pollar-swap-chain-wrap">
              <span className="sr-only">{copy.receiveOn}</span>
              <PollarSelect
                className="pollar-swap-route-pill"
                aria-label={copy.receiveOn}
                value={destination}
                disabled={configLoading || isLoadingData}
                onChange={(value) => onDestinationChange?.(value as SwapDestinationChain)}
                options={destinations.map((c) => ({ value: c, label: `${copy.receiveOn} ${CHAIN_LABELS[c]}` }))}
              />
            </label>
          )}

          {smartUnsupported && chain === 'STELLAR' && <div className="pollar-modal-error">{copy.smartUnavailable}</div>}

          <div className="pollar-swap-panels">
            <section className="pollar-swap-panel" aria-labelledby="pollar-swap-pay-label">
              <div className="pollar-swap-panel-heading">
                <span id="pollar-swap-pay-label" className="pollar-swap-panel-label">
                  {copy.youPay}
                </span>
                <span className="pollar-swap-balance">
                  {copy.balance} {formatAmount(selectedSell?.available)}
                </span>
              </div>
              <div className="pollar-swap-panel-main">
                <input
                  className="pollar-swap-amount"
                  type="text"
                  inputMode="decimal"
                  aria-label={copy.amountToPay}
                  placeholder="0.00"
                  value={amount}
                  disabled={configLoading || isLoadingData}
                  onChange={(event) => onAmountChange(event.target.value)}
                />
                <div className="pollar-swap-panel-selector">
                  <AssetPill
                    label={copy.assetToPay}
                    value={sellKey}
                    options={sellOptions}
                    disabled={configLoading || isLoadingData}
                    copy={copy}
                    onChange={selectSell}
                  />
                  <button
                    type="button"
                    className="pollar-swap-max"
                    onClick={onMax}
                    disabled={!selectedSell?.available || configLoading || isLoadingData}
                  >
                    {copy.max}
                  </button>
                </div>
              </div>
            </section>

            <button
              type="button"
              className="pollar-swap-reverse"
              onClick={onReverse}
              disabled={!selectedSell || !selectedBuy}
              aria-label={copy.reverse}
              title={copy.reverse}
            >
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden>
                <path
                  d="M5 3v10M5 3 2.5 5.5M5 3l2.5 2.5M12 14V4M12 14l2.5-2.5M12 14 9.5 11.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <section className="pollar-swap-panel" aria-labelledby="pollar-swap-receive-label">
              <div className="pollar-swap-panel-heading">
                <span id="pollar-swap-receive-label" className="pollar-swap-panel-label">
                  {copy.youReceive}
                </span>
                <span className="pollar-swap-balance">
                  {copy.balance} {formatAmount(selectedBuy?.available)}
                </span>
              </div>
              <div className="pollar-swap-panel-main">
                <div className={`pollar-swap-output${quoteLoading ? ' is-loading' : ''}`} aria-live="polite">
                  {quoteLoading ? (
                    <span className="pollar-spinner pollar-spinner-sm" />
                  ) : quote ? (
                    `~${formatAmount(quote.amountOut)}`
                  ) : (
                    '—'
                  )}
                </div>
                <div className="pollar-swap-panel-selector">
                  <AssetPill
                    label={copy.assetToReceive}
                    value={buyKey}
                    options={buyOptions}
                    disabled={configLoading || isLoadingData}
                    copy={copy}
                    onChange={selectBuy}
                  />
                  <span className="pollar-swap-panel-note">{copy.quotedAmount}</span>
                </div>
              </div>
            </section>
          </div>

          {/* A Stellar buy token the app has not enabled, by code and issuer */}
          {chain === 'STELLAR' && (
            <div className="pollar-swap-custom-area">
              {customOpen ? (
                <div className="pollar-swap-custom">
                  <input
                    className="pollar-input"
                    type="text"
                    placeholder={copy.customCodePlaceholder}
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                  />
                  <input
                    className="pollar-input"
                    type="text"
                    placeholder={copy.customIssuerPlaceholder}
                    value={customIssuer}
                    onChange={(e) => setCustomIssuer(e.target.value)}
                  />
                  {customError && <div className="pollar-modal-error">{customError}</div>}
                  <div className="pollar-swap-custom-actions">
                    <button type="button" className="pollar-btn-primary" onClick={submitCustomToken}>
                      {copy.addToken}
                    </button>
                    <button
                      type="button"
                      className="pollar-swap-custom-cancel"
                      onClick={() => {
                        setCustomOpen(false);
                        setCustomError('');
                      }}
                    >
                      {copy.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="pollar-swap-custom-toggle"
                  disabled={configLoading}
                  onClick={() => setCustomOpen(true)}
                >
                  {copy.addCustomToken}
                </button>
              )}
            </div>
          )}

          <div className="pollar-swap-rate-row">
            <div className="pollar-swap-rate" aria-live="polite">
              {rate && selectedSell && selectedBuy ? (
                <>
                  1 {selectedSell.code} ≈ {rate} {selectedBuy.code}
                </>
              ) : quoteLoading ? (
                copy.updatingRate
              ) : (
                copy.rateUnavailable
              )}
            </div>
            {configLoading ? (
              <div className="pollar-swap-route-pill">
                <span className="pollar-spinner pollar-spinner-sm" /> {copy.loading}
              </div>
            ) : (
              <label className="pollar-swap-route-wrap">
                <span className="sr-only">{copy.route}</span>
                <PollarSelect
                  className="pollar-swap-route-pill"
                  aria-label={copy.route}
                  value={provider}
                  disabled={providers.length === 0}
                  onChange={onProviderChange}
                  options={(providers.length === 0 ? [provider] : providers).map((p) => ({
                    value: p,
                    label: providerLabel(p, copy),
                  }))}
                />
              </label>
            )}
          </div>

          {!quoteLoading && quoteError && <div className="pollar-modal-error">{quoteError}</div>}
          {usdcAcross && <div className="pollar-send-hint">{copy.useTransferForUsdc}</div>}
          {!usdcAcross && !quoteLoading && !quoteError && !quote && selectedSell && selectedBuy && !!amount && (
            <div className="pollar-send-hint">{copy.noRoute}</div>
          )}
          {quote && (
            <div className="pollar-swap-quote">
              <div className="pollar-swap-quote-row">
                <span>{copy.minimumReceived}</span>
                <strong>
                  {formatAmount(quote.minReceived)} {selectedBuy?.code}
                </strong>
              </div>
              <div className="pollar-swap-quote-row">
                <span>{copy.priceImpact}</span>
                <strong>{quote.priceImpactPct === null ? '—' : `${quote.priceImpactPct}%`}</strong>
              </div>
              <div className="pollar-swap-quote-row">
                <span>{copy.route}</span>
                <strong>{providerLabel(quote.provider, copy)}</strong>
              </div>
              {(quote.fees ?? []).map((fee) => (
                <div key={fee.label} className="pollar-swap-quote-row">
                  <span>{fee.label}</span>
                  <strong>{fee.value}</strong>
                </div>
              ))}
              {quote.totalFeesUsd != null && (
                <div className="pollar-swap-quote-row">
                  <span>{copy.totalFees}</span>
                  <strong>${quote.totalFeesUsd.toFixed(2)}</strong>
                </div>
              )}
              {quote.expiresInSeconds != null && (
                <div className="pollar-send-hint" aria-live="off">
                  {copy.priceRefreshesIn(quote.expiresInSeconds)}
                </div>
              )}
            </div>
          )}
          {buyNeedsTrustline && selectedBuy && (
            <div className="pollar-swap-trustline-notice">{copy.trustlineNotice(selectedBuy.code)}</div>
          )}
          {sameAsset && <div className="pollar-modal-error">{copy.sameAsset}</div>}
          {formError && <div className="pollar-modal-error">{formError}</div>}

          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-primary" onClick={onSwap} disabled={!canSwap}>
              {buyNeedsTrustline ? copy.trustlineAndSwap : copy.swapButton}
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
          confirmation={confirmation}
          network={network}
          extraRows={settlementRows}
          {...(settlement ? { outcomeNote: { text: settlement.text, failed: settlement.kind === 'failed' } } : {})}
        />
      )}
      <PollarModalFooter />
    </div>
  );
}
