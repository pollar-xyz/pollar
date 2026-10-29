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
  language?: PollarLanguage | undefined;
}

function ChainBadge({ chain, copy }: { chain: TxParty['chain']; copy: TxReviewCopy }) {
  if (!chain) return null;
  return <img className="pollar-txr-chain" src={CHAIN_LOGOS[chain]} alt={copy.chains[chain]} title={copy.chains[chain]} />;
}

function AssetLogo({ asset }: { asset: string }) {
  const url = TOKEN_LOGOS[asset.toUpperCase()];
  const [failed, setFailed] = useState(false);
  if (url && !failed) return <img className="pollar-txr-logo" src={url} alt={asset} onError={() => setFailed(true)} />;
  return (
    <span className="pollar-txr-logo pollar-txr-logo-initial" aria-hidden>
      {asset.slice(0, 1).toUpperCase()}
    </span>
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

function ContractGlyph() {
  return (
    <span className="pollar-txr-logo pollar-txr-logo-glyph" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <rect x="4.5" y="9" width="11" height="7.5" rx="1.75" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 9V6.75a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
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
  glyph: 'asset' | 'account' | 'contract';
  copy: TxReviewCopy;
}) {
  const caption = party.self
    ? copy.yourWallet
    : (party.label ?? (party.address ? shortAddress(party.address) : party.chain ? copy.chains[party.chain] : ''));
  return (
    <div className="pollar-txr-node">
      <span className="pollar-txr-avatar">
        {glyph === 'asset' && party.asset ? (
          <AssetLogo key={party.asset} asset={party.asset} />
        ) : glyph === 'contract' ? (
          <ContractGlyph />
        ) : (
          <AccountGlyph />
        )}
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

function FeeBadge({ sponsored, copy }: { sponsored: boolean; copy: TxReviewCopy }) {
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
      {sponsored ? copy.feeSponsored : copy.feePaid}
    </span>
  );
}

/**
 * The transaction as a person reads it: who sends what to whom, drawn as a
 * flow, with the network fee as one badge. Addresses, chains, fees and the
 * raw transaction live behind "Show details".
 */
export function TxReview({ data, open: openProp, onToggle, language: languageProp }: TxReviewProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = TX_REVIEW_COPY[language];
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const toggle = onToggle ?? (() => setOpenState((v) => !v));
  const { from, to, kind } = data;
  // The receiving end repeats the amount only when it differs from what leaves.
  const toShowsAmount = !!to?.amount && (to.amount !== from?.amount || to.asset !== from?.asset);
  const toGlyph = kind === 'approve' ? 'contract' : kind === 'bridge' || kind === 'swap' ? 'asset' : 'account';

  return (
    <div className="pollar-txr">
      {from && to && (
        <div className="pollar-txr-flow">
          <Node party={from} showAmount glyph={from.asset ? 'asset' : 'account'} copy={copy} />
          <Arrow />
          <Node party={to} showAmount={kind !== 'approve' && toShowsAmount} glyph={toGlyph} copy={copy} />
        </div>
      )}
      {kind === 'approve' && <p className="pollar-txr-note">{copy.approveNote}</p>}

      <div className="pollar-txr-bar">
        {data.fee?.sponsored !== undefined ? <FeeBadge sponsored={data.fee.sponsored} copy={copy} /> : <span />}
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
        </div>
      )}
    </div>
  );
}
