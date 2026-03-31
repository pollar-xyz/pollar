'use client';

import { type KycProvider, type KycStartResponse, type KycStatus as KycStatusValue } from '@pollar/core';
import { useEffect, useState } from 'react';
import { usePollar } from '../../context';
import type { KycStep } from './KycModalTemplate';
import { KycModalTemplate } from './KycModalTemplate';
import './KycModal.css';

interface KycModalProps {
  onClose: () => void;
  /** ISO 3166-1 alpha-2 country code to filter providers. Defaults to 'MX'. */
  country?: string;
  /** KYC level required. Defaults to 'basic'. */
  level?: 'basic' | 'intermediate' | 'enhanced';
  /** Called when KYC is successfully approved. */
  onApproved?: () => void;
}

export function KycModal({ onClose, country = 'MX', level = 'basic', onApproved }: KycModalProps) {
  const { getClient, styles } = usePollar();

  const [step, setStep] = useState<KycStep>('select_provider');
  const [providers, setProviders] = useState<KycProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<KycProvider | null>(null);
  const [session, setSession] = useState<KycStartResponse | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatusValue>('none');
  const [isLoading, setIsLoading] = useState(false);

  const client = getClient();
  const { theme = 'light', accentColor = '#005DB4' } = styles;

  useEffect(() => {
    setIsLoading(true);
    client.getKycProviders(country)
      .then((result) => setProviders(result.providers))
      .catch(() => setProviders([]))
      .finally(() => setIsLoading(false));
  }, [country]);

  async function handleSelectProvider(provider: KycProvider) {
    setSelectedProvider(provider);
    setIsLoading(true);
    try {
      const result = await client.resolveKyc(provider.id, level);
      if (result.alreadyApproved) {
        setKycStatus('approved');
        setStep('done');
        onApproved?.();
        return;
      }
      setSession(result as KycStartResponse);
      setStep('verifying');
    } catch {
      setStep('select_provider');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDoneVerifying() {
    if (!selectedProvider) return;
    setStep('polling');
    try {
      const finalStatus = await client.pollKycStatus(selectedProvider.id, { intervalMs: 3000, timeoutMs: 120_000 });
      setKycStatus(finalStatus);
      setStep('done');
      if (finalStatus === 'approved') onApproved?.();
    } catch {
      setKycStatus('rejected');
      setStep('done');
    }
  }

  return (
    <div className="pollar-overlay" onClick={onClose}>
      <KycModalTemplate
        theme={theme}
        accentColor={accentColor}
        step={step}
        providers={providers}
        selectedProvider={selectedProvider}
        session={session}
        kycStatus={kycStatus}
        isLoading={isLoading}
        onSelectProvider={handleSelectProvider}
        onDoneVerifying={handleDoneVerifying}
        onClose={onClose}
      />
    </div>
  );
}
