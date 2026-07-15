'use client';

import { TxHistoryRecord, TxHistoryState } from '@pollar/core';
import { type CSSProperties, type ReactNode } from 'react';
import { CopyButton, PollarModalFooter } from '../commons';

const PAGE_SIZE = 10;

interface TxHistoryModalTemplateProps {
  theme: string;
  accentColor: string;
  txHistory: TxHistoryState;
  offset: number;
  onRefresh: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

function StatusBadge({ status }: { status: TxHistoryRecord['status'] }) {
  return (
    <span className="pollar-hist-item-badge" data-status={status}>
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Shorten a long identifier (issuer, hash, address) to `head…tail`. */
function truncateMiddle(value: string, head = 4, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

// Stellar account (G) and contract (C) strkeys are 56 base32 chars.
const STELLAR_ADDRESS = /\b[GC][A-Z2-7]{55}\b/g;

/** Truncated address rendered as a copyable tag (issuer, wallet, contract…). */
function AddressChip({ value, label }: { value: string; label: string }) {
  return (
    <span className="pollar-hist-item-issuer">
      {truncateMiddle(value)}
      <CopyButton value={value} label={label} className="pollar-copy-btn-sm" />
    </span>
  );
}

/**
 * Renders a summary string, swapping every full Stellar address (G… account or
 * C… contract) for an {@link AddressChip}. Plain-text runs are kept as-is.
 */
function renderSummary(summary: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  STELLAR_ADDRESS.lastIndex = 0;
  for (let m = STELLAR_ADDRESS.exec(summary); m !== null; m = STELLAR_ADDRESS.exec(summary)) {
    if (m.index > last) parts.push(<span key={key++}>{summary.slice(last, m.index)}</span>);
    const address = m[0];
    parts.push(
      <AddressChip key={key++} value={address} label={address[0] === 'C' ? 'Copy contract address' : 'Copy wallet address'} />,
    );
    last = m.index + address.length;
  }
  if (parts.length === 0) return <span className="pollar-hist-item-title">{summary}</span>;
  if (last < summary.length) parts.push(<span key={key}>{summary.slice(last)}</span>);
  return parts;
}

export function TxHistoryModalTemplate({
  theme,
  accentColor,
  txHistory,
  offset,
  onRefresh,
  onPrev,
  onNext,
  onClose,
}: TxHistoryModalTemplateProps) {
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

  const isLoading = txHistory.step === 'loading';
  const records = txHistory.step === 'loaded' ? txHistory.data.records : [];
  const total = txHistory.step === 'loaded' ? txHistory.data.total : 0;
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;
  const showPagination = txHistory.step === 'loaded' && total > PAGE_SIZE;

  return (
    <div
      className="pollar-modal-card pollar-hist-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">Transaction History</h2>
        <div className="pollar-modal-header-actions">
          <button
            type="button"
            className="pollar-modal-close"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh"
            title="Refresh"
          >
            <svg
              className={isLoading ? 'pollar-modal-refresh-icon pollar-spinning' : 'pollar-modal-refresh-icon'}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button className="pollar-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="pollar-hist-list">
        {txHistory.step === 'idle' && <div className="pollar-modal-empty">Click Refresh to load transactions.</div>}
        {isLoading && (
          <div className="pollar-loading-block">
            <div className="pollar-spinner" />
            <span>Loading…</span>
          </div>
        )}
        {txHistory.step === 'error' && <div className="pollar-modal-empty">{txHistory.message}</div>}
        {txHistory.step === 'loaded' && records.length === 0 && <div className="pollar-modal-empty">No transactions yet.</div>}
        {records.map((record) => {
          const hash = typeof record.hash === 'string' && record.hash.length > 0 ? record.hash : undefined;
          const explorerUrl = hash
            ? `https://stellar.expert/explorer/${record.network === 'testnet' ? 'testnet' : 'public'}/tx/${hash}`
            : undefined;
          const asset = typeof record.details?.asset === 'string' ? record.details.asset : undefined;
          // `change_trust` summaries embed the asset as `CODE:ISSUER` — split so
          // the issuer can be truncated and copied on its own.
          const colon = asset ? asset.indexOf(':') : -1;
          const trustline =
            record.operation === 'change_trust' && asset && colon > 0
              ? {
                  prefix: record.summary.split(':')[0],
                  code: asset.slice(0, colon),
                  issuer: asset.slice(colon + 1),
                }
              : undefined;
          // `invoke_contract` summaries carry a server-truncated contract id, so
          // rebuild the chip from the full id in details instead.
          const contract =
            record.operation === 'invoke_contract' &&
            typeof record.details?.contractId === 'string' &&
            typeof record.details?.method === 'string'
              ? { method: record.details.method, contractId: record.details.contractId }
              : undefined;
          return (
            <div key={record.id} className="pollar-hist-item">
              <div className="pollar-hist-item-top">
                <span className="pollar-hist-item-summary">
                  {trustline ? (
                    <>
                      <span className="pollar-hist-item-title">
                        {trustline.prefix}: {trustline.code}
                      </span>
                      <AddressChip value={trustline.issuer} label="Copy issuer" />
                    </>
                  ) : contract ? (
                    <>
                      <span className="pollar-hist-item-title">Invoke {contract.method}() on</span>
                      <AddressChip value={contract.contractId} label="Copy contract address" />
                    </>
                  ) : (
                    renderSummary(record.summary)
                  )}
                </span>
                <StatusBadge status={record.status} />
              </div>

              <span className="pollar-hist-item-meta">
                <span>{record.operation}</span>
                {typeof record.details?.sponsored === 'boolean' && (
                  <span>· {record.details.sponsored ? 'Sponsored' : 'Self-paid'}</span>
                )}
                {record.feeXlm && <span>· {record.feeXlm} XLM</span>}
              </span>

              <div className="pollar-hist-item-footer">
                <span>{formatDate(record.createdAt)}</span>
                {hash && (
                  <>
                    <span className="pollar-hist-item-dot">·</span>
                    <span className="pollar-hist-item-hash">{truncateMiddle(hash, 6, 6)}</span>
                    <CopyButton value={hash} label="Copy transaction hash" className="pollar-copy-btn-sm" />
                    <a
                      className="pollar-hist-item-explorer"
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View on Stellar Explorer"
                    >
                      <svg width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden>
                        <path
                          d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M8 1h4m0 0v4m0-4L6 7"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showPagination && (
        <div className="pollar-hist-pagination">
          <span className="pollar-hist-pagination-info">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="pollar-hist-pagination-btns">
            <button className="pollar-hist-page-btn" onClick={onPrev} disabled={!hasPrev}>
              ← Prev
            </button>
            <button className="pollar-hist-page-btn" onClick={onNext} disabled={!hasNext}>
              Next →
            </button>
          </div>
        </div>
      )}

      <PollarModalFooter />
    </div>
  );
}
