'use client';

import { useInheritedLanguage } from '../../language-context';
import { DistributionRule, DistributionRulesState, type PollarLanguage } from '@pollar/core';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';
import { DISTRIBUTION_RULES_COPY } from './distribution-rules-copy';

type DistributionRulesCopy = (typeof DISTRIBUTION_RULES_COPY)[PollarLanguage];

interface DistributionRulesModalTemplateProps {
  theme: string;
  accentColor: string;
  /** Per-app modal chrome overrides (background, card + button radius). */
  styleOverrides?: ModalStyleOverrides;
  state: DistributionRulesState;
  claimingId: string | null;
  claimErrors: Record<string, string>;
  claimedIds: Set<string>;
  /** Language of the modal's text; the device's when not given. */
  language?: PollarLanguage | undefined;
  onRefresh: () => void;
  onClaim: (rule: DistributionRule) => void;
  onClose: () => void;
}

// Reasons returned by sdk-api are the ErrorCode enum values from
// @pollar/shared. Mapped to short user-facing strings; anything unknown
// falls back to "Not available".
function reasonLabel(reason: string | null, copy: DistributionRulesCopy): string {
  if (!reason) return copy.notAvailable;
  return copy.reasons[reason] ?? copy.notAvailable;
}

function formatAmount(amount: string): string {
  const n = parseFloat(amount);
  return isNaN(n) ? amount : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

function formatValidity(rule: DistributionRule, copy: DistributionRulesCopy): string | null {
  const from = rule.validFrom ? new Date(rule.validFrom) : null;
  const until = rule.validUntil ? new Date(rule.validUntil) : null;
  if (!from && !until) return null;
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (from && until) return `${fmt(from)} → ${fmt(until)}`;
  if (until) return copy.until(fmt(until));
  if (from) return copy.from(fmt(from));
  return null;
}

function RuleCard({
  rule,
  isClaiming,
  isClaimed,
  errorMessage,
  copy,
  onClaim,
}: {
  rule: DistributionRule;
  isClaiming: boolean;
  isClaimed: boolean;
  errorMessage?: string;
  copy: DistributionRulesCopy;
  onClaim: () => void;
}) {
  const validity = formatValidity(rule, copy);
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
        <span>{copy.period[rule.period]}</span>
        {validity && <span>· {validity}</span>}
      </div>
      <div className="pollar-dist-item-action">
        {isClaimed ? (
          <span className="pollar-dist-item-status" data-kind="claimed">
            {copy.claimed}
          </span>
        ) : effectivelyClaimable ? (
          <button type="button" className="pollar-btn-primary pollar-dist-claim-btn" onClick={onClaim} disabled={isClaiming}>
            {isClaiming ? (
              <>
                <span className="pollar-spinner pollar-spinner-sm" />
                {copy.claiming}
              </>
            ) : (
              copy.claim
            )}
          </button>
        ) : (
          <span className="pollar-dist-item-status" data-kind="unavailable">
            {reasonLabel(rule.reason, copy)}
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
  styleOverrides,
  state,
  claimingId,
  claimErrors,
  claimedIds,
  language: languageProp,
  onRefresh,
  onClaim,
  onClose,
}: DistributionRulesModalTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = DISTRIBUTION_RULES_COPY[language];
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);

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
        <h2 className="pollar-modal-title">{copy.title}</h2>
        <div className="pollar-modal-header-actions">
          <button
            type="button"
            className="pollar-modal-close"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label={copy.refresh}
            title={copy.refresh}
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
          <button className="pollar-modal-close" onClick={onClose} aria-label={copy.close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="pollar-dist-list">
        {isLoading && (
          <div className="pollar-loading-block">
            <div className="pollar-spinner" />
            <span>{copy.loading}</span>
          </div>
        )}
        {state.step === 'error' && <div className="pollar-modal-error">{state.message}</div>}
        {state.step === 'loaded' && rules.length === 0 && <div className="pollar-modal-empty">{copy.empty}</div>}
        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            isClaiming={claimingId === rule.id}
            isClaimed={claimedIds.has(rule.id)}
            {...(claimErrors[rule.id] && { errorMessage: claimErrors[rule.id] })}
            copy={copy}
            onClaim={() => onClaim(rule)}
          />
        ))}
      </div>

      <PollarModalFooter />
    </div>
  );
}
