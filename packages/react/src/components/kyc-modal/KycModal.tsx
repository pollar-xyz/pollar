'use client';

import { type KycProvider, type KycStartResponse, type KycStatus as KycStatusValue } from '@pollar/core';
import { useCallback, useEffect, useState } from 'react';
import { usePollar } from '../../context';
import type { KycStep } from './KycModalTemplate';
import { KycModalTemplate } from './KycModalTemplate';
import '../shared.css';
import './KycModal.css';
import { modalChrome } from '../modal-theme';

interface KycModalProps {
  corridorId?: string;
  onClose: () => void;
  /** ISO 3166-1 alpha-2 country code to filter providers. Defaults to 'MX'. */
  country?: string;
  /** Legacy fallback for older backends. Named options select their own workflow. */
  level?: 'basic' | 'intermediate' | 'enhanced';
  /** Called when KYC is successfully approved. */
  onApproved?: () => void;
}

export function KycModal({ onClose, country = 'MX', level = 'basic', onApproved, corridorId }: KycModalProps) {
  const { getClient, styles } = usePollar();

  const [step, setStep] = useState<KycStep>('select_provider');
  const [providers, setProviders] = useState<KycProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<KycProvider | null>(null);
  const [session, setSession] = useState<KycStartResponse | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatusValue>('none');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = getClient();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);

  const loadProviders = useCallback(() => {
    setIsLoading(true);
    setError(null);
    return getClient()
      .getKycProviders(country, corridorId)
      .then((result) => setProviders(result.providers))
      .catch(() => {
        setProviders([]);
        setError('Could not load verification options. Please refresh to try again.');
      })
      .finally(() => setIsLoading(false));
  }, [getClient, country, corridorId]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  async function handleSelectProvider(provider: KycProvider) {
    setSelectedProvider(provider);
    setError(null);
    setIsLoading(true);
    try {
      const result = await client.resolveKyc(provider.id, provider.levels[0] ?? level, country, corridorId);
      if (result.alreadyApproved) {
        setKycStatus('approved');
        setStep('done');
        onApproved?.();
        return;
      }
      setSession(result as KycStartResponse);
      setStep('verifying');
    } catch {
      setError('Could not start verification. Please try again.');
      setStep('select_provider');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDoneVerifying() {
    if (!selectedProvider) return;
    setError(null);
    setStep('polling');
    try {
      const finalStatus = await client.pollKycStatus(selectedProvider.id, {
        intervalMs: 3000,
        timeoutMs: 120_000,
        ...(corridorId ? { corridorId } : {}),
      });
      setKycStatus(finalStatus);
      setStep('done');
      if (finalStatus === 'approved') onApproved?.();
    } catch {
      setError('We could not confirm your result yet. Check again shortly; this does not mean your verification was rejected.');
      setStep('verifying');
    }
  }

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={onClose}>
      <KycModalTemplate
        theme={theme}
        accentColor={accentColor}
        styleOverrides={styleOverrides}
        step={step}
        providers={providers}
        selectedProvider={selectedProvider}
        session={session}
        kycStatus={kycStatus}
        isLoading={isLoading}
        error={error}
        onSelectProvider={handleSelectProvider}
        onDoneVerifying={handleDoneVerifying}
        onRefresh={() => void loadProviders()}
        onClose={onClose}
      />
    </div>
  );
}
