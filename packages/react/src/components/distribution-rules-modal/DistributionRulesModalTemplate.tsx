'use client';

import { DistributionRule, DistributionRulesState } from '@pollar/core';
import { type CSSProperties } from 'react';
import { PollarModalFooter } from '../commons';

interface DistributionRulesModalTemplateProps {
  theme: string;
  accentColor: string;
  state: DistributionRulesState;
  claimingId: string | null;
  claimErrors: Record<string, string>;
  claimedIds: Set<string>;
  onRefresh: () => void;
  onClaim: (rule: DistributionRule) => void;
  onClose: () => void;
}

const PERIOD_LABEL: Record<DistributionRule['period'], string> = {
  DAY: 'every 24h',
  DAY_CALENDAR: 'daily',
  WEEK: 'every 7 days',
  MONTH: 'every 30 days',
  MONTH_CALENDAR: 'monthly',
  LIFETIME: 'one-time',
};

// Reasons returned by sdk-api are the ErrorCode enum values from
// @pollar/shared. Mapped to short user-facing strings; anything unknown
// falls back to "Not available".
const REASON_LABEL: Record<string, string> = {
  DISTRIBUTION_RULE_DISABLED: 'Disabled',
  DISTRIBUTION_RULE_NOT_STARTED: 'Not started yet',
  DISTRIBUTION_RULE_EXPIRED: 'Expired',
  DISTRIBUTION_RULE_EXHAUSTED: 'Fully claimed',
  // Per-user, per-window claim limit (resets next period) — not permanent.
  DISTRIBUTION_RATE_LIMIT_EXCEEDED: 'Claimed for this period',
};

function reasonLabel(reason: string | null): string {
  if (!reason) return 'Not available';
  return REASON_LABEL[reason] ?? 'Not available';
}

function formatAmount(amount: string): string {
  const n = parseFloat(amount);
  return isNaN(n) ? amount : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

function formatValidity(rule: DistributionRule): string | null {
  const from = rule.validFrom ? new Date(rule.validFrom) : null;
  const until = rule.validUntil ? new Date(rule.validUntil) : null;
  if (!from && !until) return null;
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (from && until) return `${fmt(from)} → ${fmt(until)}`;
  if (until) return `Until ${fmt(until)}`;
  if (from) return `From ${fmt(from)}`;
  return null;
}

function RuleCard({
  rule,
  isClaiming,
  isClaimed,
  errorMessage,
  onClaim,
}: {
  rule: DistributionRule;
  isClaiming: boolean;
  isClaimed: boolean;
  errorMessage?: string;
  onClaim: () => void;
}) {
  const validity = formatValidity(rule);
  const effectivelyClaimable = rule.claimable && !isClaimed;

  return (
    <div className="pollar-dist-item" data-claimable={effectivelyClaimable ? 'true' : 'false'}>
      <div className="pollar-dist-item-row">
        <span className="pollar-dist-item-name">{rule.name}</span>
        <span className="pollar-dist-item-amount">
          {formatAmount(rule.amount)} <span className="pollar-dist-item-asset">{rule.assetCode}</span>
        </span>
      </div>
      <div className="pollar-dist-item-meta">
        <span>{PERIOD_LABEL[rule.period]}</span>
        {validity && <span>· {validity}</span>}
      </div>
      <div className="pollar-dist-item-action">
        {isClaimed ? (
          <span className="pollar-dist-item-status" data-kind="claimed">
            Claimed
          </span>
        ) : effectivelyClaimable ? (
          <button type="button" className="pollar-btn-primary pollar-dist-claim-btn" onClick={onClaim} disabled={isClaiming}>
            {isClaiming ? 'Claiming…' : 'Claim'}
          </button>
        ) : (
          <span className="pollar-dist-item-status" data-kind="unavailable">
            {reasonLabel(rule.reason)}
          </span>
        )}
      </div>
      {errorMessage && <div className="pollar-dist-item-error">{errorMessage}</div>}
    </div>
  );
}

export function DistributionRulesModalTemplate({
  theme,
  accentColor,
  state,
  claimingId,
  claimErrors,
  claimedIds,
  onRefresh,
  onClaim,
  onClose,
}: DistributionRulesModalTemplateProps) {
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

  const isLoading = state.step === 'loading';
  const rules = state.step === 'loaded' ? state.rules : [];

  return (
    <div
      className="pollar-modal-card pollar-dist-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">Distribution Rules</h2>
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
              <path d="M11.5 6.5a5 5 0 11-1.5-3.536" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

      <div className="pollar-dist-list">
        {isLoading && <div className="pollar-modal-empty">Loading…</div>}
        {state.step === 'error' && <div className="pollar-modal-error">{state.message}</div>}
        {state.step === 'loaded' && rules.length === 0 && (
          <div className="pollar-modal-empty">No distribution rules available.</div>
        )}
        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            isClaiming={claimingId === rule.id}
            isClaimed={claimedIds.has(rule.id)}
            {...(claimErrors[rule.id] && { errorMessage: claimErrors[rule.id] })}
            onClaim={() => onClaim(rule)}
          />
        ))}
      </div>

      <PollarModalFooter />
    </div>
  );
}
