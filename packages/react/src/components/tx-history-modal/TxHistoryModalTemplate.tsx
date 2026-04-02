'use client';

import { TxHistoryRecord, TxHistoryState } from '@pollar/core';
import { type CSSProperties } from 'react';
import { PollarModalFooter } from '../commons';

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
    <div className="pollar-modal-card pollar-hist-modal" data-theme={theme} style={cssVars} onClick={(e) => e.stopPropagation()}>
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">Transaction History</h2>
        <div className="pollar-modal-header-actions">
            <button className="pollar-modal-refresh-btn" onClick={onRefresh} disabled={isLoading}>
            <svg
              className={`pollar-modal-refresh-icon${isLoading ? ' spinning' : ''}`}
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
              aria-hidden
            >
              <path
                d="M11.5 6.5a5 5 0 11-1.5-3.536"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path d="M10 1v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
          <button className="pollar-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="pollar-hist-list">
        {txHistory.step === 'idle' && (
          <div className="pollar-modal-empty">Click Refresh to load transactions.</div>
        )}
        {isLoading && (
          <div className="pollar-modal-empty">Loading…</div>
        )}
        {txHistory.step === 'error' && (
          <div className="pollar-modal-empty">{txHistory.message}</div>
        )}
        {txHistory.step === 'loaded' && records.length === 0 && (
          <div className="pollar-modal-empty">No transactions yet.</div>
        )}
        {records.map((record) => (
          <div key={record.id} className="pollar-hist-item">
            <span className="pollar-hist-item-summary">{record.summary}</span>
            <StatusBadge status={record.status} />
            <span className="pollar-hist-item-meta">
              <span>{record.operation}</span>
              {record.feeXlm && <span>· {record.feeXlm} XLM</span>}
              <span>· {formatDate(record.createdAt)}</span>
            </span>
          </div>
        ))}
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