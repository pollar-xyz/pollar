import type { AppRequirementStep } from '@pollar/core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { RequirementFormModal } from '../requirement-form-modal/RequirementFormModal';
import { KycModal } from './KycModal';

interface AppKycFlowProps {
  onClose: () => void;
  country?: string;
  level?: 'basic' | 'intermediate' | 'enhanced';
  /** Called once every step of the app's own KYC is complete. */
  onApproved?: () => void;
}

type FlowState =
  | { kind: 'loading' }
  /** The app has no steps: the KYC modal lists its enabled options, as it always did. */
  | { kind: 'options' }
  | { kind: 'step'; step: AppRequirementStep }
  /** Every step was already complete on open; the KYC modal shows the verified state on the option the user passed. */
  | { kind: 'done'; providerId: string };

/**
 * The app's own KYC, step by step: the user completes every step the app configured,
 * in order, and only the pending one is shown. A KYC step opens the KYC modal on its
 * option; a form step opens the form. After each one the steps are read again.
 */
export function AppKycFlow({ onClose, country, level, onApproved }: AppKycFlowProps) {
  const { getClient } = usePollar();
  const client = getClient();
  const [state, setState] = useState<FlowState>({ kind: 'loading' });
  const kycStepDone = useRef(false);
  // On the first read a complete flow shows its verified state; after a step it just closes.
  const firstRead = useRef(true);
  // One read at a time: development runs the mount effect twice, and the second read
  // would see the first one's `firstRead` and close the flow instead of showing it.
  const loading = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on every mount: development mounts components twice, and the cleanup of the
    // first mount would otherwise leave this false and drop every response.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * The KYC option the user holds an approval on, among the ones a step accepts. A
   * status read never opens a vendor session; opening an option the user did not pass
   * would start (and bill) one.
   */
  async function approvedOption(steps: { type: string; optionIds: string[] }[]): Promise<string | null> {
    for (const step of steps) {
      if (step.type !== 'KYC') continue;
      for (const optionId of step.optionIds) {
        const status = await client.getKycStatus(optionId).catch(() => null);
        if (status?.status === 'approved') return optionId;
      }
    }
    return null;
  }

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    kycStepDone.current = false;
    try {
      const requirements = await client.getAppRequirements();
      if (!mounted.current) return;
      if (!requirements.total) return setState({ kind: 'options' });
      const first = firstRead.current;
      firstRead.current = false;
      if (requirements.next) return setState({ kind: 'step', step: requirements.next });
      onApproved?.();
      const providerId = first ? await approvedOption(requirements.steps) : null;
      if (!mounted.current) return;
      if (providerId) setState({ kind: 'done', providerId });
      else onClose();
    } catch {
      // Without the steps the modal still works as it did: it lists the enabled options.
      if (mounted.current) setState({ kind: 'options' });
    } finally {
      loading.current = false;
    }
    // The client instance and the callback are fixed while the flow is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') return null;

  if (state.kind === 'options') {
    return (
      <KycModal
        onClose={onClose}
        {...(country !== undefined && { country })}
        {...(level !== undefined && { level })}
        {...(onApproved !== undefined && { onApproved })}
      />
    );
  }

  if (state.kind === 'done') {
    return <KycModal onClose={onClose} providerId={state.providerId} {...(country !== undefined && { country })} />;
  }

  const { step } = state;
  const progress = { position: step.completed + 1, total: step.total };
  if (step.type === 'FORM') {
    return (
      <RequirementFormModal
        key={step.optionId}
        formId={step.optionId}
        progress={progress}
        onClose={onClose}
        onSubmitted={() => void load()}
      />
    );
  }
  // The KYC modal shows its own result; closing it after an approval moves to the next step.
  return (
    <KycModal
      key={step.optionId}
      providerId={step.optionId}
      {...(country !== undefined && { country })}
      {...(level !== undefined && { level })}
      onApproved={() => {
        kycStepDone.current = true;
      }}
      onClose={() => {
        if (kycStepDone.current) void load();
        else onClose();
      }}
    />
  );
}
