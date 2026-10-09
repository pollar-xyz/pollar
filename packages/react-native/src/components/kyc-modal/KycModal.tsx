import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Linking, AppState } from 'react-native';
import {
  isPollarApiError,
  type KycProvider,
  type KycStartResponse,
  type KycStatus as KycStatusValue,
  type KycStatusContent,
} from '@pollar/core';
import { usePollar } from '../../context';
import { PollarModalFooter, PollarOverlay } from '../commons';
import { KycStatus as KycStatusBadge } from './KycStatus';
import { kycErrorMessage, kycProcessingMessage, kycReviewMessage } from './kyc-messages';

export type KycStep = 'select_provider' | 'verifying' | 'polling' | 'done';

export interface KycModalTemplateProps {
  theme?: string | undefined;
  accentColor?: string | undefined;
  step: KycStep;
  providers: KycProvider[];
  selectedProvider: KycProvider | null;
  session: KycStartResponse | null;
  kycStatus: KycStatusValue;
  /** Set when the decision is held for manual review (e.g. DUPLICATE_DOCUMENT). */
  reviewReason?: string | null | undefined;
  /** The vendor approved and Pollar is still recording it (`kycStatus` stays `pending`). */
  processing?: boolean | undefined;
  isLoading: boolean;
  error?: string | null | undefined;
  onSelectProvider: (provider: KycProvider) => void;
  onOpenVerification: () => void;
  onDoneVerifying: () => void;
  onStartAgain?: (() => void) | undefined;
  onRefresh: () => void;
  onClose: () => void;
}

export function KycModalTemplate({
  theme = 'light',
  accentColor = '#005DB4',
  step,
  providers,
  selectedProvider,
  session,
  kycStatus,
  reviewReason,
  processing = false,
  isLoading,
  error,
  onSelectProvider,
  onOpenVerification,
  onDoneVerifying,
  onStartAgain,
  onRefresh,
  onClose,
}: KycModalTemplateProps) {
  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    itemBg: isDark ? '#262626' : '#f9fafb',
    successText: isDark ? '#4ade80' : '#16a34a',
  };

  const subtitle =
    step === 'select_provider'
      ? 'Choose your verification provider'
      : step === 'verifying'
        ? `Complete the steps with ${selectedProvider?.name ?? 'the provider'}`
        : step === 'polling'
          ? 'Waiting for verification result'
          : kycStatus === 'approved'
            ? 'You are ready to continue'
            : 'Your verification status';

  const resultText =
    kycStatus === 'approved'
      ? 'Your identity has been verified successfully.'
      : kycStatus === 'rejected'
        ? 'Your verification was not approved. Contact support for the next steps.'
        : kycStatus === 'expired'
          ? 'Your verification expired. Start again to verify your identity.'
          : processing
            ? kycProcessingMessage()
            : kycReviewMessage(reviewReason);

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Identity verification</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      </View>

      <TouchableOpacity
        style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>

      {!!error && (
        <View style={[styles.errorBox, { borderColor: colors.border, borderLeftColor: accentColor }]}>
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }} accessibilityRole="alert">
            {error}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        {step === 'select_provider' &&
          (isLoading && providers.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={accentColor} />
              <Text style={{ color: colors.muted, marginTop: 12 }}>Loading providers…</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 320 }}>
              {providers.length === 0 && (
                <Text style={{ color: colors.muted, textAlign: 'center', marginBottom: 12 }}>
                  No providers available for your country.
                </Text>
              )}
              {providers.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.providerBtn, { backgroundColor: colors.itemBg, borderColor: colors.border }]}
                  disabled={isLoading}
                  onPress={() => onSelectProvider(p)}
                >
                  <Text style={[styles.providerName, { color: colors.text }]}>{p.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {isLoading && selectedProvider?.id === p.id ? 'Opening…' : 'Continue in the browser'}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={onRefresh}
                disabled={isLoading}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Refresh</Text>
              </TouchableOpacity>
            </ScrollView>
          ))}

        {step === 'verifying' && (
          <>
            <Text style={[styles.description, { color: colors.muted }]}>
              Verification opens in your browser. Finish the steps there, then come back here to check your status.
            </Text>
            {session?.kycUrl ? (
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={onOpenVerification}>
                <Text style={styles.primaryBtnText}>Open verification</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: colors.muted, marginBottom: 12 }}>Identity verification will open here.</Text>
            )}
            <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={onDoneVerifying}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Check status</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'polling' && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={accentColor} />
            <Text style={{ color: colors.text, marginTop: 12 }}>Checking verification status…</Text>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.resultBox}>
            <KycStatusBadge status={kycStatus} {...(processing ? { label: 'Approved' } : {})} />
            <Text style={[styles.resultText, { color: kycStatus === 'approved' ? colors.successText : colors.text }]}>
              {resultText}
            </Text>
            {kycStatus === 'expired' && onStartAgain && (
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={onStartAgain}
                disabled={isLoading}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Start again</Text>
              </TouchableOpacity>
            )}
            {kycStatus !== 'approved' && kycStatus !== 'rejected' && kycStatus !== 'expired' && (
              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={onDoneVerifying}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Check again</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={onClose}>
              <Text style={styles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <PollarModalFooter />
    </View>
  );
}

export interface KycModalProps {
  onClose: () => void;
  /** ISO 3166-1 alpha-2 country code to filter providers. Defaults to 'MX'. */
  country?: string | undefined;
  /** Legacy fallback for older backends. Named options select their own workflow. */
  level?: 'basic' | 'intermediate' | 'enhanced' | undefined;
  corridorId?: string | undefined;
  /** Open this option directly instead of listing the choices (the one a ramp's KYC gate names). */
  providerId?: string | undefined;
  /** Called when KYC is successfully approved. */
  onApproved?: (() => void) | undefined;
}

function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `kyc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The hosted KYC flow on React Native: the vendor page opens in the system
 * browser (no WebView dependency), and returning to the app checks the status.
 */
export function KycModal({ onClose, country = 'MX', level = 'basic', corridorId, providerId, onApproved }: KycModalProps) {
  const { getClient, styles: pollarStyles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = pollarStyles;

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
  const openedInBrowser = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on every mount: development mounts components twice, and the cleanup of the
    // first mount would otherwise leave this false and drop every response.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const client = getClient();

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
  // the first, and the auto-open path can fire alongside a tap.
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
      if (!mounted.current) return;
      if (result.alreadyApproved) {
        finish('approved');
        return;
      }
      openedInBrowser.current = false;
      setSession(result as KycStartResponse);
      setStep('verifying');
    } catch (e) {
      if (!mounted.current) return;
      const code = isPollarApiError(e) ? e.code : undefined;
      if (code === 'SDK_KYC_ALREADY_APPROVED') {
        finish('approved');
        return;
      }
      // A session of this user is in the provider's review, or approved and still being
      // recorded: show which one instead of opening another session.
      if (code === 'SDK_KYC_UNDER_REVIEW') {
        await readStatus(provider.id).then(
          (read) => mounted.current && finishWith(read),
          () => mounted.current && finish('pending'),
        );
        return;
      }
      if (code === 'SDK_KYC_SESSION_EXPIRED') delete idempotencyKeys.current[provider.id];
      setError(kycErrorMessage(e, 'start'));
      setStep('select_provider');
    } finally {
      starting.current = false;
      if (mounted.current) setIsLoading(false);
    }
  }

  const loadProviders = useCallback(() => {
    setIsLoading(true);
    setError(null);
    return client
      .getKycProviders(country, corridorId)
      .then((result) => {
        if (mounted.current) setProviders(result.providers);
        return result.providers;
      })
      .catch((e: unknown) => {
        if (mounted.current) {
          setProviders([]);
          setError(kycErrorMessage(e, 'load'));
        }
        return [] as KycProvider[];
      })
      .finally(() => {
        if (mounted.current) setIsLoading(false);
      });
    // The client instance is stable; getClient is rebuilt with every context update.
  }, [client, country, corridorId]);

  useEffect(() => {
    void loadProviders().then((list) => {
      if (!providerId || autoOpened.current || !mounted.current) return;
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
      if (!mounted.current) return;
      finishWith(read);
    } catch {
      if (!mounted.current) return;
      setError('We could not confirm your result yet. Check again shortly; this does not mean your verification was rejected.');
      setStep('verifying');
    }
  }

  // Coming back from the browser is the moment the user expects an answer.
  const checkOnReturn = useRef(handleDoneVerifying);
  checkOnReturn.current = handleDoneVerifying;
  useEffect(() => {
    if (step !== 'verifying') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !openedInBrowser.current) return;
      openedInBrowser.current = false;
      void checkOnReturn.current();
    });
    return () => subscription.remove();
  }, [step]);

  async function handleOpenVerification() {
    if (!session?.kycUrl) return;
    try {
      await Linking.openURL(session.kycUrl);
      openedInBrowser.current = true;
    } catch {
      setError('Could not open the verification page. Please try again.');
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
    <PollarOverlay onCancel={onClose}>
      <View style={styles.modalWrapper}>
        <KycModalTemplate
          theme={theme}
          accentColor={accentColor}
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
          onOpenVerification={handleOpenVerification}
          onDoneVerifying={handleDoneVerifying}
          onStartAgain={handleStartAgain}
          onRefresh={() => void loadProviders()}
          onClose={onClose}
        />
      </View>
    </PollarOverlay>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 50,
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 400,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  header: {
    marginBottom: 12,
    marginTop: 10,
    paddingRight: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  iconButton: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeBtn: {
    top: 16,
    right: 16,
  },
  errorBox: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  body: {
    marginVertical: 12,
  },
  description: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  providerBtn: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  providerName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  primaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBox: {
    paddingTop: 4,
    alignItems: 'center',
  },
  resultText: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginVertical: 12,
  },
});
