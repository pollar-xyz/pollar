'use client';

import { DistributionRule, DistributionRulesState } from '@pollar/core';
import { useCallback, useEffect, useState } from 'react';
import { usePollar } from '../../context';
import '../shared.css';
import './DistributionRulesModal.css';
import { DistributionRulesModalTemplate } from './DistributionRulesModalTemplate';

interface DistributionRulesModalProps {
  onClose: () => void;
}

export function DistributionRulesModal({ onClose }: DistributionRulesModalProps) {
  const { getClient, styles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  const [state, setState] = useState<DistributionRulesState>({ step: 'idle' });
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({});
  const [claimedIds, setClaimedIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setState({ step: 'loading' });
    try {
      const rules = await getClient().listDistributionRules();
      setState({ step: 'loaded', rules });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load distribution rules';
      setState({ step: 'error', message });
    }
  }, [getClient]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleClaim = useCallback(
    async (rule: DistributionRule) => {
      setClaimingId(rule.id);
      setClaimErrors((prev) => {
        if (!prev[rule.id]) return prev;
        const next = { ...prev };
        delete next[rule.id];
        return next;
      });
      try {
        await getClient().claimDistributionRule({ ruleId: rule.id });
        setClaimedIds((prev) => {
          const next = new Set(prev);
          next.add(rule.id);
          return next;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Claim failed';
        setClaimErrors((prev) => ({ ...prev, [rule.id]: message }));
      } finally {
        setClaimingId(null);
      }
    },
    [getClient],
  );

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <DistributionRulesModalTemplate
        theme={theme}
        accentColor={accentColor}
        state={state}
        claimingId={claimingId}
        claimErrors={claimErrors}
        claimedIds={claimedIds}
        onRefresh={() => void load()}
        onClaim={handleClaim}
        onClose={onClose}
      />
    </div>
  );
}
