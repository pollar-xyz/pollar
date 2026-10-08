'use client';

import {
  isPollarApiError,
  type KycProvider,
  type KycStartResponse,
  type KycStatus as KycStatusValue,
  type KycStatusContent,
} from '@pollar/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import type { KycStep } from './KycModalTemplate';
import { KycModalTemplate } from './KycModalTemplate';
import { kycErrorMessage } from './kyc-messages';
import '../shared.css';
import './KycModal.css';
import { modalChrome } from '../modal-theme';

interface KycModalProps {
  corridorId?: string;
  /** Open this option directly instead of listing the choices (the one a ramp's KYC gate names). */
  providerId?: string;
  onClose: () => void;
  /** ISO 3166-1 alpha-2 country code to filter providers. Defaults to 'MX'. */
  country?: string;
  /** Legacy fallback for older backends. Named options select their own workflow. */
  level?: 'basic' | 'intermediate' | 'enhanced';
  /** Called when KYC is successfully approved. */
  onApproved?: () => void;
}

function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `kyc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function KycModal({ onClose, country = 'MX', level = 'basic', onApproved, corridorId, providerId }: KycModalProps) {
  const { getClient, styles } = usePollar();

  const [step, setStep] = useState<KycStep>('select_provider');
  const [providers, setProviders] = useState<KycProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<KycProvider | null>(null);
  const [session, setSession] = useState<KycStartResponse | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatusValue>('none');
  const [reviewReason, setReviewReason] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per option for this modal: a retried start returns the vendor session
  // already opened instead of creating (and billing) another one.
  const idempotencyKeys = useRef<Record<string, string>>({});
  const autoOpened = useRef(false);

  const client = getClient();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);

  function finish(status: KycStatusValue, reason: string | null = null, isProcessing = false) {
    setKycStatus(status);
    setReviewReason(reason);
    setProcessing(isProcessing);
    setStep('done');
    if (status === 'approved') onApproved?.();
  }

  function finishWith(read: KycStatusContent) {
    if (read.status === 'pending' && read.decisionStatus === 'approved') finish('pending', null, true);
    else if (read.decisionStatus === 'manual_review') finish('pending', read.reviewReason ?? null);
    else finish(read.decisionStatus === 'expired' ? 'expired' : read.status);
  }

  function readStatus(providerId: string) {
    return corridorId ? client.getKycStatus(undefined, corridorId) : client.getKycStatus(providerId);
  }

  // One session request at a time: a second one for the same key would only wait on
  // the first, and the auto-open path can fire alongside a click.
  const starting = useRef(false);

  /** `listed`: the option came from the country-filtered list. Off it, the backend picks the option's own country. */
  async function handleSelectProvider(provider: KycProvider, listed = true) {
    if (starting.current) return;
    starting.current = true;
    setSelectedProvider(provider);
    setError(null);
    setIsLoading(true);
    const key = (idempotencyKeys.current[provider.id] ??= newIdempotencyKey());
    try {
      const result = await client.resolveKyc(
        provider.id,
        provider.levels?.[0] ?? level,
        listed ? country : undefined,
        corridorId,
        key,
      );
      if (result.alreadyApproved) {
        finish('approved');
        return;
      }
      setSession(result as KycStartResponse);
      setStep('verifying');
    } catch (e) {
      const code = isPollarApiError(e) ? e.code : undefined;
      if (code === 'SDK_KYC_ALREADY_APPROVED') {
        finish('approved');
        return;
      }
      // A session of this user is in the provider's review, or approved and still being
      // recorded: show which one instead of opening another session.
      if (code === 'SDK_KYC_UNDER_REVIEW') {
        await readStatus(provider.id).then(finishWith, () => finish('pending'));
        return;
      }
      if (code === 'SDK_KYC_SESSION_EXPIRED') delete idempotencyKeys.current[provider.id];
      setError(kycErrorMessage(e, 'start'));
      setStep('select_provider');
    } finally {
      starting.current = false;
      setIsLoading(false);
    }
  }

  const loadProviders = useCallback(() => {
    setIsLoading(true);
    setError(null);
    return getClient()
      .getKycProviders(country, corridorId)
      .then((result) => {
        setProviders(result.providers);
        return result.providers;
      })
      .catch((e: unknown) => {
        setProviders([]);
        setError(kycErrorMessage(e, 'load'));
        return [] as KycProvider[];
      })
      .finally(() => setIsLoading(false));
  }, [getClient, country, corridorId]);

  useEffect(() => {
    void loadProviders().then((list) => {
      if (!providerId || autoOpened.current) return;
      autoOpened.current = true;
      const target = list.find((p) => p.id === providerId);
      // The option a gate or a step names was chosen by the backend for this user: the
      // country this list was filtered by must not hide it behind "no providers".
      if (target) void handleSelectProvider(target);
      else
        void handleSelectProvider(
          { id: providerId, name: 'Identity verification', flow: 'iframe', levels: [level] } as KycProvider,
          false,
        );
    });
    // handleSelectProvider reads the latest props on each call; listing it would reload providers every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProviders, providerId]);

  async function handleDoneVerifying() {
    if (!selectedProvider) return;
    setError(null);
    setStep('polling');
    try {
      const read = await client.pollKycDecision(selectedProvider.id, {
        intervalMs: 3000,
        timeoutMs: 120_000,
        ...(corridorId ? { corridorId } : {}),
      });
      finishWith(read);
    } catch {
      setError('We could not confirm your result yet. Check again shortly; this does not mean your verification was rejected.');
      setStep('verifying');
    }
  }

  function handleStartAgain() {
    if (selectedProvider) delete idempotencyKeys.current[selectedProvider.id];
    setSession(null);
    setKycStatus('none');
    setReviewReason(null);
    setProcessing(false);
    if (selectedProvider) void handleSelectProvider(selectedProvider);
    else setStep('select_provider');
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
        reviewReason={reviewReason}
        processing={processing}
        isLoading={isLoading}
        error={error}
        onSelectProvider={handleSelectProvider}
        onDoneVerifying={handleDoneVerifying}
        onStartAgain={handleStartAgain}
        onRefresh={() => void loadProviders()}
        onClose={onClose}
      />
    </div>
  );
}
