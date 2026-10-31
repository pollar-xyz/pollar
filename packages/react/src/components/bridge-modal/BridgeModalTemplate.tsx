'use client';

import type { BridgeChain, BridgeQuote, BridgeTransfer, PollarLanguage } from '@pollar/core';
import { useInheritedLanguage } from '../../language-context';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';
import { BRIDGE_COPY } from './bridge-copy';

export const BRIDGE_CHAIN_LABEL: Record<BridgeChain, string> = {
  STELLAR: 'Stellar',
  SOLANA: 'Solana',
  POLYGON: 'Polygon',
};

/** Mainnet explorers: the bridge runs on mainnet only. */
const EXPLORER: Record<BridgeChain, (hash: string) => string> = {
  STELLAR: (hash) => `https://stellar.expert/explorer/public/tx/${hash}`,
  SOLANA: (hash) => `https://solscan.io/tx/${hash}`,
  POLYGON: (hash) => `https://polygonscan.com/tx/${hash}`,
};

export type BridgeModalStep = 'loading' | 'unavailable' | 'form' | 'transfer';

export interface BridgeModalTemplateProps {
  theme: string;
  accentColor: string;
  styleOverrides?: ModalStyleOverrides;
  step: BridgeModalStep;
  /** Why the form is not offered: off mainnet, or no pair of wallets to bridge between. */
  unavailableReason: 'mainnet_only' | 'no_directions' | null;
  sources: BridgeChain[];
  targets: BridgeChain[];
  fromChain: BridgeChain | null;
  toChain: BridgeChain | null;
  onFromChange: (chain: BridgeChain) => void;
  onToChange: (chain: BridgeChain) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  /** USDC available on `fromChain`; null while unknown. */
  balance: string | null;
  onMax: () => void;
  quote: BridgeQuote | null;
  quoting: boolean;
  /** What is wrong with the form or what the server refused, ready to show. */
  formError: string | null;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  transfer: BridgeTransfer | null;
  signing: boolean;
  onAuthorize: () => void;
  onApprove: () => void;
  actionError: string | null;
  pollTrouble: boolean;
  onNewBridge: () => void;
  onClose: () => void;
  language?: PollarLanguage | undefined;
}

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);

function ChainPicker({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: BridgeChain | null;
  options: BridgeChain[];
  onChange: (chain: BridgeChain) => void;
  disabled: boolean;
}) {
  return (
    <label className="pollar-bridge-field">
      <span className="pollar-bridge-label">{label}</span>
      <select
        className="pollar-input"
        value={value ?? ''}
        disabled={disabled || options.length === 0}
        onChange={(event) => onChange(event.target.value as BridgeChain)}
      >
        {options.map((chain) => (
          <option key={chain} value={chain}>
            {BRIDGE_CHAIN_LABEL[chain]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Burn, Circle's attestation, mint: how far the transfer got. */
function Progress({ transfer, labels }: { transfer: BridgeTransfer; labels: { burn: string; attest: string; mint: string } }) {
  const reached = {
    burn: !!transfer.burnTxHash,
    attest: transfer.status === 'ATTESTED' || transfer.status === 'COMPLETED' || !!transfer.mintTxHash,
    mint: transfer.status === 'COMPLETED',
  };
  return (
    <ol className="pollar-bridge-steps">
      {(['burn', 'attest', 'mint'] as const).map((key) => (
        <li key={key} className={reached[key] ? 'pollar-bridge-step pollar-bridge-step-done' : 'pollar-bridge-step'}>
          <span className="pollar-bridge-step-dot" aria-hidden />
          {labels[key]}
        </li>
      ))}
    </ol>
  );
}

export function BridgeModalTemplate(props: BridgeModalTemplateProps) {
  const language = useInheritedLanguage(props.language);
  const copy = BRIDGE_COPY[language];
  const cssVars = buildModalCssVars(props.theme, props.accentColor, props.styleOverrides);
  const { transfer, quote } = props;
  const busy = props.submitting || props.quoting;
  const toName = props.toChain ? BRIDGE_CHAIN_LABEL[props.toChain] : '';
  const signingNote =
    quote?.signing === 'EXTERNAL'
      ? copy.signingExternal
      : quote?.signing === 'COSIGNED' || quote?.signing === 'SELF_CUSTODY'
        ? copy.signingCosigned
        : copy.signingInternal;

  return (
    <div
      className="pollar-modal-card pollar-bridge-modal"
      data-theme={props.theme}
      style={cssVars}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">{copy.title}</h2>
        <div className="pollar-modal-header-actions">
          <button type="button" className="pollar-modal-close" onClick={props.onClose} aria-label={copy.close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {props.step === 'loading' && <div className="pollar-modal-empty">{copy.loading}</div>}

      {props.step === 'unavailable' && (
        <div className="pollar-modal-empty">
          {props.unavailableReason === 'mainnet_only' ? copy.mainnetOnly : copy.noDirections}
        </div>
      )}

      {props.step === 'form' && (
        <div className="pollar-bridge-form">
          <div className="pollar-bridge-chains">
            <ChainPicker
              label={copy.from}
              value={props.fromChain}
              options={props.sources}
              onChange={props.onFromChange}
              disabled={busy}
            />
            <span className="pollar-bridge-arrow" aria-hidden>
              →
            </span>
            <ChainPicker
              label={copy.to}
              value={props.toChain}
              options={props.targets}
              onChange={props.onToChange}
              disabled={busy}
            />
          </div>

          <label className="pollar-bridge-field">
            <span className="pollar-bridge-label-row">
              <span className="pollar-bridge-label">{copy.amount}</span>
              <span className="pollar-bridge-balance">
                {copy.balance} {props.balance ?? '—'}
                {props.balance !== null && (
                  <button type="button" className="pollar-bridge-max" onClick={props.onMax} disabled={busy}>
                    {copy.max}
                  </button>
                )}
              </span>
            </span>
            <input
              className="pollar-input"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={props.amount}
              disabled={props.submitting}
              onChange={(event) => props.onAmountChange(event.target.value)}
            />
          </label>

          {props.quoting && <div className="pollar-bridge-note">{copy.quoting}</div>}
          {quote && !props.quoting && (
            <dl className="pollar-bridge-quote">
              <div>
                <dt>{copy.youReceive}</dt>
                <dd>
                  {quote.amountOut} USDC · {toName}
                </dd>
              </div>
              <div>
                <dt>{copy.fee}</dt>
                <dd>{quote.fee ? `${quote.fee.amount} USD` : copy.noFee}</dd>
              </div>
              <div>
                <dt>{copy.eta}</dt>
                <dd>{fill(copy.etaValue, { minutes: String(Math.max(1, Math.round(quote.etaSeconds / 60))) })}</dd>
              </div>
              <p className="pollar-bridge-note">{signingNote}</p>
            </dl>
          )}

          {props.formError && <div className="pollar-modal-error">{props.formError}</div>}

          <div className="pollar-modal-actions">
            <button
              type="button"
              className="pollar-btn-primary"
              disabled={!props.canSubmit || props.submitting}
              onClick={props.onSubmit}
            >
              {props.submitting ? copy.starting : copy.bridgeButton}
            </button>
          </div>
        </div>
      )}

      {props.step === 'transfer' && transfer && (
        <div className="pollar-bridge-transfer">
          <div className={`pollar-bridge-status pollar-bridge-status-${transfer.status.toLowerCase()}`}>
            <strong>{copy.statusTitle[transfer.status]}</strong>
            <p>
              {fill(copy.statusBody[transfer.status], {
                from: BRIDGE_CHAIN_LABEL[transfer.fromChain],
                to: BRIDGE_CHAIN_LABEL[transfer.toChain],
                amount: transfer.amountOut ?? transfer.amount,
              })}
            </p>
          </div>
          <Progress
            transfer={transfer}
            labels={{
              burn: fill(copy.steps.burn, { from: BRIDGE_CHAIN_LABEL[transfer.fromChain] }),
              attest: copy.steps.attest,
              mint: fill(copy.steps.mint, { to: BRIDGE_CHAIN_LABEL[transfer.toChain] }),
            }}
          />

          {transfer.pendingAction?.kind === 'SIGNATURE' && (
            <button type="button" className="pollar-btn-primary" disabled={props.signing} onClick={props.onAuthorize}>
              {props.signing ? copy.waitingWallet : copy.authorize}
            </button>
          )}
          {transfer.pendingAction?.kind === 'COSIGN_APPROVAL' && (
            <button type="button" className="pollar-btn-primary" onClick={props.onApprove}>
              {copy.approveOnDevice}
            </button>
          )}
          {props.actionError && <div className="pollar-modal-error">{props.actionError}</div>}
          {props.pollTrouble && <div className="pollar-bridge-note">{copy.pollTrouble}</div>}

          <div className="pollar-bridge-links">
            {transfer.burnTxHash && (
              <a href={EXPLORER[transfer.fromChain](transfer.burnTxHash)} target="_blank" rel="noopener noreferrer">
                {fill(copy.viewBurn, { chain: BRIDGE_CHAIN_LABEL[transfer.fromChain] })}
              </a>
            )}
            {transfer.mintTxHash && (
              <a href={EXPLORER[transfer.toChain](transfer.mintTxHash)} target="_blank" rel="noopener noreferrer">
                {fill(copy.viewMint, { chain: BRIDGE_CHAIN_LABEL[transfer.toChain] })}
              </a>
            )}
          </div>

          {(transfer.status === 'COMPLETED' || transfer.status === 'FAILED') && (
            <div className="pollar-modal-actions">
              <button type="button" className="pollar-btn-secondary" onClick={props.onNewBridge}>
                {copy.newBridge}
              </button>
              <button type="button" className="pollar-btn-primary" onClick={props.onClose}>
                {copy.done}
              </button>
            </div>
          )}
        </div>
      )}

      <PollarModalFooter />
    </div>
  );
}
