'use client';

import type { PollarLanguage } from '@pollar/core';
import { useState } from 'react';
import { CHAIN_LOGOS, TOKEN_LOGOS } from '../../constants';
import { useInheritedLanguage } from '../../language-context';
import { CopyButton } from '../commons';
import { TX_REVIEW_COPY, type TxReviewCopy } from './tx-review-copy';
import { shortAddress, type TxParty, type TxReviewData } from './tx-review-model';
import './TxReview.css';

export interface TxReviewProps {
  data: TxReviewData;
  /** Whether the details are unfolded; the review keeps its own state when not given. */
  open?: boolean;
  onToggle?: () => void;
  /** Opens the details: why the prompt shows up at all. */
  detailsIntro?: { title: string; body: string } | undefined;
  /** A secondary action kept out of the way, at the end of the details (declining the request). */
  detailsAction?: { label: string; onClick: () => void; disabled?: boolean } | undefined;
  language?: PollarLanguage | undefined;
}

function ChainBadge({ chain, copy }: { chain: TxParty['chain']; copy: TxReviewCopy }) {
  if (!chain) return null;
  return <img className="pollar-txr-chain" src={CHAIN_LOGOS[chain]} alt={copy.chains[chain]} title={copy.chains[chain]} />;
}

/** An asset's logo, or its initial when there is none; `small` sits inline next to text. */
export function AssetLogo({ asset, small = false }: { asset: string; small?: boolean }) {
  const url = TOKEN_LOGOS[asset.toUpperCase()];
  const [failed, setFailed] = useState(false);
  const size = small ? ' pollar-txr-logo-sm' : '';
  if (url && !failed) return <img className={`pollar-txr-logo${size}`} src={url} alt={asset} onError={() => setFailed(true)} />;
  return (
    <span className={`pollar-txr-logo pollar-txr-logo-initial${size}`} aria-hidden>
      {asset.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A chain's logo, inline next to its name. */
export function ChainLogo({ chain }: { chain: NonNullable<TxParty['chain']> }) {
  return <img className="pollar-txr-chain-inline" src={CHAIN_LOGOS[chain]} alt="" aria-hidden />;
}

/** The explorer link of a sent transaction, with the logo of the chain it landed on. */
export function TxExplorerLink({
  chain,
  url,
  language: languageProp,
}: {
  chain: NonNullable<TxParty['chain']>;
  url: string;
  language?: PollarLanguage | undefined;
}) {
  const copy = TX_REVIEW_COPY[useInheritedLanguage(languageProp)];
  return (
    <a className="pollar-txr-link pollar-txr-explorer" href={url} target="_blank" rel="noopener noreferrer">
      <ChainLogo chain={chain} />
      {copy.viewOnExplorer}
    </a>
  );
}

function AccountGlyph() {
  return (
    <span className="pollar-txr-logo pollar-txr-logo-glyph" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M3.75 16.5c.9-3 3.3-4.5 6.25-4.5s5.35 1.5 6.25 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** A key in a shield: proving who the user is, not sending anything. */
function SignInGlyph() {
  return (
    <span className="pollar-txr-signin-glyph" aria-hidden>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2.75 4.75 5.5v5.25c0 4.6 3.05 8.55 7.25 10 4.2-1.45 7.25-5.4 7.25-10V5.5L12 2.75Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 12.25v3.5M12 14.25h1.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function Assurance({ text }: { text: string }) {
  return (
    <li className="pollar-txr-assurance">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M3.5 7l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {text}
    </li>
  );
}

function Node({
  party,
  showAmount,
  glyph,
  copy,
}: {
  party: TxParty;
  showAmount: boolean;
  glyph: 'asset' | 'account';
  copy: TxReviewCopy;
}) {
  const caption = party.self
    ? copy.yourWallet
    : (party.label ?? (party.address ? shortAddress(party.address) : party.chain ? copy.chains[party.chain] : ''));
  return (
    <div className="pollar-txr-node">
      <span className="pollar-txr-avatar">
        {glyph === 'asset' && party.asset ? <AssetLogo key={party.asset} asset={party.asset} /> : <AccountGlyph />}
        <ChainBadge chain={party.chain} copy={copy} />
      </span>
      {showAmount && party.amount && (
        <span className="pollar-txr-amount">
          {party.minimum && <span className="pollar-txr-min">{copy.atLeast} </span>}
          {party.amount} {party.asset}
        </span>
      )}
      <span className="pollar-txr-caption" title={party.address}>
        {caption}
      </span>
    </div>
  );
}

function Arrow() {
  return (
    <span className="pollar-txr-arrow" aria-hidden>
      <svg width="100%" height="12" viewBox="0 0 64 12" preserveAspectRatio="none" fill="none">
        <path d="M1 6h60" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 4" />
      </svg>
      <svg className="pollar-txr-arrow-head" width="10" height="12" viewBox="0 0 10 12" fill="none">
        <path d="M2 1.5 7.5 6 2 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function FeeBadge({ sponsored, free = false, copy }: { sponsored: boolean; free?: boolean; copy: TxReviewCopy }) {
  return (
    <span className={`pollar-txr-fee${sponsored ? ' pollar-txr-fee-sponsored' : ''}`}>
      {sponsored ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="6" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M1.5 4.25h13V6h-13zM8 4.25V14" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path
            d="M8 4.25C6.5 4.25 5 3.5 5 2.4 5 1.2 7 1.2 8 4.25Zm0 0c1.5 0 3-.75 3-1.85 0-1.2-2-1.2-3 1.85Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8.5 1.5 3.5 9H8l-.5 5.5 5-7.5H8l.5-5.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )}
      {free ? copy.feeFree : sponsored ? copy.feeSponsored : copy.feePaid}
    </span>
  );
}

/** Who paid the network fee of a signed transaction, as one line with its icon. */
export function TxFeeBadge({
  sponsored,
  language: languageProp,
}: {
  sponsored: boolean;
  language?: PollarLanguage | undefined;
}) {
  const language = useInheritedLanguage(languageProp);
  return <FeeBadge sponsored={sponsored} copy={TX_REVIEW_COPY[language]} />;
}

/**
 * The transaction as a person reads it: who sends what to whom, drawn as a
 * flow, with the network fee as one badge. Addresses, chains, fees and the
 * raw transaction live behind "Show details".
 */
export function TxReview({
  data,
  open: openProp,
  onToggle,
  detailsIntro,
  detailsAction,
  language: languageProp,
}: TxReviewProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = TX_REVIEW_COPY[language];
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const toggle = onToggle ?? (() => setOpenState((v) => !v));
  const { from, to, kind } = data;
  // The receiving end repeats the amount only when it differs from what leaves.
  const toShowsAmount = !!to?.amount && (to.amount !== from?.amount || to.asset !== from?.asset);
  const toGlyph = kind === 'bridge' || kind === 'swap' || kind === 'deposit' || kind === 'withdraw' ? 'asset' : 'account';

  return (
    <div className="pollar-txr">
      {data.lead && <p className="pollar-txr-lead">{data.lead}</p>}
      {/* A permission moves nothing: an arrow from the wallet would say otherwise. */}
      {from && to && kind !== 'approve' && (
        <div className="pollar-txr-flow">
          <Node party={from} showAmount glyph={from.asset ? 'asset' : 'account'} copy={copy} />
          <Arrow />
          <Node party={to} showAmount={toShowsAmount} glyph={toGlyph} copy={copy} />
        </div>
      )}
      {kind === 'sign_in' && (
        <div className="pollar-txr-signin">
          <SignInGlyph />
          <p className="pollar-txr-signin-body">{copy.signIn.body}</p>
          <ul className="pollar-txr-assurances">
            <Assurance text={copy.signIn.noMoney} />
            <Assurance text={copy.signIn.nothingSent} />
          </ul>
        </div>
      )}

      <div className="pollar-txr-bar">
        {data.fee?.sponsored !== undefined ? (
          <FeeBadge sponsored={data.fee.sponsored} free={data.fee.free === true} copy={copy} />
        ) : (
          <span />
        )}
        <button type="button" className="pollar-txr-toggle" aria-expanded={open} onClick={toggle}>
          {open ? copy.hideDetails : copy.showDetails}
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
          >
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="pollar-txr-details">
          {detailsIntro && (
            <div className="pollar-txr-why">
              <p className="pollar-txr-why-title">{detailsIntro.title}</p>
              <p className="pollar-txr-why-body">{detailsIntro.body}</p>
            </div>
          )}
          <dl className="pollar-txr-rows">
            {data.rows.map((row, i) => (
              <div key={`${row.label}-${i}`} className="pollar-txr-row">
                <dt>{row.label}</dt>
                <dd className={row.mono ? 'pollar-txr-mono' : undefined}>
                  <span>{row.value}</span>
                  {row.copyValue && <CopyButton value={row.copyValue} className="pollar-copy-btn-sm" language={language} />}
                </dd>
              </div>
            ))}
            {data.hash && (
              <div className="pollar-txr-row">
                <dt>{copy.rows.txHash}</dt>
                <dd className="pollar-txr-mono">
                  <span>{data.hash.value}</span>
                  <CopyButton value={data.hash.value} className="pollar-copy-btn-sm" language={language} />
                </dd>
              </div>
            )}
          </dl>
          {data.hash?.explorerUrl && (
            <a className="pollar-txr-link" href={data.hash.explorerUrl} target="_blank" rel="noopener noreferrer">
              {copy.viewOnExplorer}
            </a>
          )}
          {data.raw && (
            <div className="pollar-txr-raw">
              <div className="pollar-txr-raw-head">
                <span>{copy.rows.rawTx}</span>
                <CopyButton value={data.raw} className="pollar-copy-btn-sm" language={language} />
              </div>
              <pre>{data.raw}</pre>
            </div>
          )}
          {detailsAction && (
            <button
              type="button"
              className="pollar-txr-action"
              disabled={detailsAction.disabled}
              onClick={detailsAction.onClick}
            >
              {detailsAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
