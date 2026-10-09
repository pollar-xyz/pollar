import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, ScrollView, Linking } from 'react-native';
import type {
  RampCountry,
  RampDepositInstructions,
  RampDirection,
  RampQuote,
  RampQuoteRequirement,
  RampsOfframpBody,
  RampsOnrampBody,
  RampTxStatus,
  RampsTransactionResponse,
} from '@pollar/core';
import { mergeRampCountries, mergeRampSnapshot, type RampSnapshot, type RampRoute } from '@pollar/core';
import { RampWorkflow } from './RampWorkflow';
import { usePollar } from '../../context';
import { PollarModalFooter, PollarOverlay } from '../commons';
import { KycModal } from '../kyc-modal/KycModal';
import { RouteDisplay } from './RouteDisplay';
import { RequirementFormModal } from '../requirement-form-modal/RequirementFormModal';
import { RegistryCheckModal } from '../registry-check-modal/RegistryCheckModal';
import { ProviderRegistrationModal } from '../provider-registration-modal/ProviderRegistrationModal';
import { lockedRouteCopy, pendingFromQuote, requiredRampKyc, type PendingRequirement } from './ramp-kyc';

export type RampStep = 'input' | 'loading_quote' | 'select_route' | 'contact' | 'status' | 'error';

/** A field the selected quote asks the client to collect (empty for SEP-24). */
export interface RampFieldSpec {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'select';
  bankType?: 'CLABE' | 'PIX' | 'PSE' | 'ACH' | 'BREB';
  options?: { value: string; label: string; placeholder?: string }[];
  /** Declared but not mandatory: blank must not block Continue. */
  optional?: boolean;
  placeholder?: string;
  hint?: string;
}

const TERMINAL: RampTxStatus[] = ['completed', 'failed'];

function requiredFieldsOf(quote: RampQuote): RampFieldSpec[] {
  return (quote as { requiredFields?: RampFieldSpec[] }).requiredFields ?? [];
}

function brokenLimitOf(amount: number, quote: RampQuote): { limit: 'min' | 'max'; value: number } | null {
  const { minAmount, maxAmount } = quote as { minAmount?: number; maxAmount?: number };
  if (!Number.isFinite(amount)) return null;
  if (minAmount != null && amount < minAmount) return { limit: 'min', value: minAmount };
  if (maxAmount != null && amount > maxAmount) return { limit: 'max', value: maxAmount };
  return null;
}

function limitMessage(limit: 'min' | 'max', value: number, currency: string): string {
  return `The ${limit === 'min' ? 'minimum' : 'maximum'} amount for this route is ${value} ${currency}.`;
}

const RAMP_ERROR_MESSAGES: Record<string, string> = {
  SDK_RAMPS_QUOTE_EXPIRED: 'This quote expired. Request a new one and try again.',
  SDK_RAMPS_ASSET_NOT_ENABLED: 'This currency is not available for that route right now.',
  SDK_RAMPS_KYC_REQUIRED: 'The provider needs to verify your identity before continuing.',
  SDK_RAMPS_WALLET_UNSUPPORTED: 'This wallet type cannot be used for this ramp.',
  SDK_RAMPS_PROVIDER_NOT_CONFIGURED: 'This ramp provider is not configured for this app yet.',
  SDK_RAMPS_ANCHOR_ERROR: 'The provider rejected the request. Please try again in a moment.',
  SDK_RAMPS_BRIDGE_ERROR: 'The provider rejected the request. Please try again in a moment.',
};

function rampErrorMessage(e: unknown, fallback: string): string {
  const body = (e as { body?: Record<string, unknown> } | undefined)?.body;
  const code = (e as { code?: unknown } | undefined)?.code;
  if (typeof code !== 'string') return e instanceof Error ? e.message : fallback;
  const limit = body?.limit;
  const value = body?.limitAmount;
  const currency = body?.limitCurrency;
  if ((limit === 'min' || limit === 'max') && typeof value === 'number' && typeof currency === 'string') {
    return limitMessage(limit, value, currency);
  }
  return RAMP_ERROR_MESSAGES[code] ?? (e instanceof Error ? e.message : fallback);
}

// Common shape of the on/off-ramp, complete and signature responses.
interface RampResult {
  txId: string;
  provider: string;
  status: RampTxStatus;
  kycUrl?: string;
  tosUrl?: string;
  kycRequired?: boolean;
  stellarTxHash?: string;
  pendingSignature?: { unsignedXdr: string; action: 'sep10' | 'withdraw_payment' };
  depositInstructions?: RampDepositInstructions;
}

export interface RampWidgetTemplateProps {
  theme?: string | undefined;
  accentColor?: string | undefined;
  step: RampStep;
  direction: RampDirection;
  amount: string;
  currency: string;
  country: string;
  countries: RampCountry[];
  countriesLoading: boolean;
  quotes: RampQuote[];
  /** Routes not quoted until the user completes the requirement step their corridor names (KYC, form, registry check or provider registration). */
  kycRequired: RampQuoteRequirement[];
  requiredFields: RampFieldSpec[];
  fieldValues: Record<string, string>;
  isLoading: boolean;
  provider: string;
  txStatus: RampTxStatus | null;
  kycUrl: string | null;
  tosUrl: string | null;
  kycBlocking: boolean;
  stellarTxHash: string | null;
  depositInstructions: RampDepositInstructions | null;
  canComplete: boolean;
  completing: boolean;
  errorMsg: string | null;
  /** Neutral guidance on the route list, e.g. after identity verification sent the user back to it. */
  noticeMsg?: string | null | undefined;
  routeSelector?: React.ReactNode;
  workflowContent?: React.ReactNode;
  onDirectionChange: (d: RampDirection) => void;
  onAmountChange: (v: string) => void;
  onCountryChange: (code: string) => void;
  onFieldChange: (key: string, value: string) => void;
  onFindRoute: () => void;
  onSelectQuote: (quote: RampQuote) => void;
  onVerifyRoute: (requirement: RampQuoteRequirement) => void;
  onContactContinue: () => void;
  onOpenUrl: (url: string) => void;
  onCompleteWithdraw: () => void;
  onBack: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/** A route the backend did not quote because its corridor has a requirement step the user has not completed. */
function LockedRoute({
  requirement,
  colors,
  accentColor,
  disabled,
  onVerify,
}: {
  requirement: RampQuoteRequirement;
  colors: { border: string; text: string; muted: string; inputBg: string };
  accentColor: string;
  disabled: boolean;
  onVerify: (requirement: RampQuoteRequirement) => void;
}) {
  const { message, action } = lockedRouteCopy(requirement);
  return (
    <View style={[styles.lockedRoute, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 2 }}>{requirement.provider}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{message}</Text>
      </View>
      {action && (
        <TouchableOpacity
          style={[styles.lockedRouteBtn, { borderColor: accentColor, opacity: disabled ? 0.5 : 1 }]}
          disabled={disabled}
          onPress={() => onVerify(requirement)}
        >
          <Text style={{ color: accentColor, fontWeight: '600', fontSize: 13 }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function RampWidgetTemplate({
  theme = 'light',
  accentColor = '#005DB4',
  step,
  direction,
  amount,
  currency,
  country,
  countries,
  countriesLoading,
  quotes,
  kycRequired,
  requiredFields,
  fieldValues,
  isLoading,
  provider,
  txStatus,
  kycUrl,
  tosUrl,
  kycBlocking,
  stellarTxHash,
  depositInstructions,
  canComplete,
  completing,
  errorMsg,
  noticeMsg,
  routeSelector,
  workflowContent,
  onDirectionChange,
  onAmountChange,
  onCountryChange,
  onFieldChange,
  onFindRoute,
  onSelectQuote,
  onVerifyRoute,
  onContactContinue,
  onOpenUrl,
  onCompleteWithdraw,
  onBack,
  onRetry,
  onClose,
}: RampWidgetTemplateProps) {
  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    inputBg: isDark ? '#374151' : '#f9fafb',
    error: '#ef4444',
  };
  const missingField = requiredFields.some((f) => !f.optional && !(fieldValues[f.key] ?? '').trim());
  const canFind = !!amount && Number(amount) > 0 && !!country && !isLoading;

  const primary = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      style={[styles.primaryBtn, { backgroundColor: accentColor, opacity: disabled ? 0.5 : 1 }]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
  const secondary = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      style={[styles.secondaryBtn, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
  const errorLine = errorMsg ? <Text style={[styles.note, { color: colors.error }]}>{errorMsg}</Text> : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{direction === 'onramp' ? 'Add funds' : 'Cash out'}</Text>
      </View>

      <TouchableOpacity
        style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        {step === 'input' && (
          <>
            <View style={styles.row}>
              {(['onramp', 'offramp'] as RampDirection[]).map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.chip,
                    { borderColor: d === direction ? accentColor : colors.border },
                    d === direction && { backgroundColor: accentColor },
                  ]}
                  onPress={() => onDirectionChange(d)}
                >
                  <Text style={{ color: d === direction ? '#fff' : colors.text, fontWeight: '600' }}>
                    {d === 'onramp' ? 'Buy' : 'Sell'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {routeSelector}
            <Text style={[styles.label, { color: colors.text }]}>Country</Text>
            {countriesLoading ? (
              <ActivityIndicator color={accentColor} style={{ marginBottom: 16 }} />
            ) : countries.length === 0 ? (
              <Text style={[styles.note, { color: colors.muted }]}>No ramp countries are available right now.</Text>
            ) : (
              <View style={[styles.row, { flexWrap: 'wrap' }]}>
                {countries.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.chip, { borderColor: c.code === country ? accentColor : colors.border }]}
                    onPress={() => onCountryChange(c.code)}
                  >
                    <Text style={{ color: colors.text }}>
                      {c.code}
                      {c.currency ? ` · ${c.currency}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={[styles.label, { color: colors.text }]}>Amount{currency ? ` (${currency})` : ''}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              placeholder="25.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={onAmountChange}
            />
            {errorLine}
            {primary('Find routes', onFindRoute, !canFind)}
          </>
        )}

        {step === 'loading_quote' && (
          <View style={styles.statusBox}>
            <ActivityIndicator size="large" color={accentColor} />
            <Text style={{ color: colors.text, marginTop: 16 }}>Finding routes…</Text>
          </View>
        )}

        {step === 'select_route' && (
          <>
            {!!noticeMsg && <Text style={[styles.note, { color: colors.text }]}>{noticeMsg}</Text>}
            {quotes.map((q) => (
              <RouteDisplay key={q.quoteId} quote={q} onSelect={(quote) => !isLoading && onSelectQuote(quote)} />
            ))}
            {kycRequired.map((r) => (
              <LockedRoute
                key={`${r.rampProviderId}:${r.corridorId}`}
                requirement={r}
                colors={colors}
                accentColor={accentColor}
                disabled={isLoading}
                onVerify={onVerifyRoute}
              />
            ))}
            {isLoading && <ActivityIndicator color={accentColor} style={{ marginVertical: 8 }} />}
            {errorLine}
            {secondary('Back', onBack, isLoading)}
          </>
        )}

        {step === 'contact' && (
          <>
            {requiredFields.map((f) => (
              <View key={f.key} style={{ marginBottom: 12 }}>
                <Text style={[styles.label, { color: colors.text }]}>
                  {f.label}
                  {f.optional ? ' (optional)' : ''}
                </Text>
                {f.type === 'select' && f.options ? (
                  <View style={[styles.row, { flexWrap: 'wrap' }]}>
                    {f.options.map((o) => (
                      <TouchableOpacity
                        key={o.value}
                        style={[styles.chip, { borderColor: fieldValues[f.key] === o.value ? accentColor : colors.border }]}
                        onPress={() => onFieldChange(f.key, o.value)}
                      >
                        <Text style={{ color: colors.text }}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                    placeholder={f.placeholder ?? ''}
                    placeholderTextColor={colors.muted}
                    keyboardType={f.type === 'email' ? 'email-address' : f.type === 'tel' ? 'phone-pad' : 'default'}
                    autoCapitalize={f.type === 'email' ? 'none' : 'sentences'}
                    value={fieldValues[f.key] ?? ''}
                    onChangeText={(v) => onFieldChange(f.key, v)}
                  />
                )}
                {!!f.hint && <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{f.hint}</Text>}
              </View>
            ))}
            {errorLine}
            {primary(isLoading ? 'Starting…' : 'Continue', onContactContinue, missingField || isLoading)}
            {secondary('Back', onBack, isLoading)}
          </>
        )}

        {step === 'status' && (
          <>
            <Text style={[styles.label, { color: colors.text }]}>{provider}</Text>
            <Text style={[styles.note, { color: colors.muted }]}>Status: {txStatus ?? 'pending'}</Text>
            {workflowContent}
            {!workflowContent && kycBlocking && (
              <Text style={[styles.note, { color: colors.text }]}>
                The provider needs to verify your identity. Finish it with the provider, then request a new quote.
              </Text>
            )}
            {!workflowContent && !!kycUrl && primary('Open provider verification', () => onOpenUrl(kycUrl))}
            {!workflowContent && !!tosUrl && secondary('Accept the terms of service', () => onOpenUrl(tosUrl))}
            {!workflowContent && depositInstructions && (
              <View style={[styles.instructions, { borderColor: colors.border }]}>
                {depositInstructions.scannable?.payload && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {depositInstructions.scannable.payloadLabel ?? 'Payment code'}
                    </Text>
                    <Text selectable style={{ color: colors.text, fontFamily: 'Courier' }}>
                      {depositInstructions.scannable.payload}
                    </Text>
                  </View>
                )}
                {depositInstructions.fields.map((f) => (
                  <View key={f.key} style={{ marginBottom: 6 }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{f.label}</Text>
                    <Text selectable style={{ color: colors.text }}>
                      {f.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {!workflowContent && !!stellarTxHash && (
              <Text selectable style={[styles.note, { color: colors.muted }]}>
                Stellar transaction: {stellarTxHash}
              </Text>
            )}
            {!workflowContent &&
              canComplete &&
              primary(completing ? 'Submitting…' : "I've completed KYC - withdraw", onCompleteWithdraw, completing)}
            {errorLine}
            {secondary(txStatus === 'completed' ? 'Done' : 'Close', onClose)}
          </>
        )}

        {step === 'error' && (
          <>
            <Text style={[styles.note, { color: colors.error }]}>{errorMsg ?? 'Unexpected error.'}</Text>
            {primary('Try again', onRetry)}
          </>
        )}
      </ScrollView>

      <PollarModalFooter />
    </View>
  );
}

/**
 * The ramp flow on React Native, mirroring the web widget: amount, route, the
 * provider's fields, then the transaction. When the route needs platform KYC the
 * KYC modal opens on the option the backend names; approval brings back fresh
 * quotes for the same input, and the user picks one again.
 */
export function RampWidget({ onClose }: { onClose: () => void }) {
  const { getClient, walletAddress, copyText, ramp: savedRamp, setRamp: saveRamp, styles: pollarStyles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = pollarStyles;
  const routeTextColor = theme === 'dark' ? '#f3f4f6' : '#111827';
  const routeBorderColor = theme === 'dark' ? '#374151' : '#e5e7eb';
  const client = getClient();

  const [step, setStep] = useState<RampStep>('input');
  const [direction, setDirection] = useState<RampDirection>('onramp');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [country, setCountry] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [legacyCountries, setCountries] = useState<RampCountry[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [quotes, setQuotes] = useState<RampQuote[]>([]);
  const [requirementsRequired, setRequirementsRequired] = useState<RampQuoteRequirement[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<RampQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingKyc, setPendingKyc] = useState<PendingRequirement | null>(null);
  const kycAttempt = useRef<typeof pendingKyc>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const [txId, setTxId] = useState<string | null>(null);
  const [provider, setProvider] = useState('');
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [tosUrl, setTosUrl] = useState<string | null>(null);
  const [kycPending, setKycPending] = useState(false);
  const [kycApproved, setKycApproved] = useState(false);
  const [txStatus, setTxStatus] = useState<RampTxStatus | null>(null);
  const [stellarTxHash, setStellarTxHash] = useState<string | null>(null);
  const [depositInstructions, setDepositInstructions] = useState<RampDepositInstructions | null>(null);
  const [workflow, setWorkflow] = useState<RampSnapshot | null>(null);
  const workflowRef = useRef<RampSnapshot | null>(null);
  const [legacySignature, setLegacySignature] = useState<RampResult['pendingSignature']>(undefined);
  const completionLocked = useRef(false);
  function acceptWorkflow(incoming: RampSnapshot) {
    const next = mergeRampSnapshot(workflowRef.current, incoming);
    workflowRef.current = next;
    setWorkflow(next);
    if (next === incoming) saveRamp({ direction, transaction: { ...incoming, provider } as RampsTransactionResponse });
    return next === incoming;
  }
  const [routes, setRoutes] = useState<RampRoute[]>([]);
  const [routeId, setRouteId] = useState('');
  const selectedRoute = routes.find((route) => route.routeId === routeId);
  const countries = mergeRampCountries(legacyCountries, routes);
  useEffect(() => {
    let active = true;
    void client
      .getRampRoutes()
      .then((result) => {
        if (active) setRoutes(result.routes);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [client]);
  useEffect(() => {
    if (!country && countries[0]) {
      setCountry(countries[0].code);
      setCurrency(countries[0].currency ?? '');
    }
  }, [country, countries]);
  const [completing, setCompleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initialRamp = useRef(savedRamp);
  useEffect(() => {
    if (initialRamp.current) {
      setDirection(initialRamp.current.direction);
      void applyResult(initialRamp.current.transaction);
    }
  }, []);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on every mount: development mounts components twice, and the cleanup of the
    // first mount would otherwise leave this false and drop every response.
    mounted.current = true;
    return () => {
      mounted.current = false;
      kycAttempt.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    client
      .getRampCountries()
      .then(({ countries: list }) => {
        if (!active) return;
        setCountries(list);
        const first = list[0];
        if (first) {
          setCountry(first.code);
          if (first.currency) setCurrency(first.currency);
        }
      })
      .catch(() => active && setCountries([]))
      .finally(() => active && setCountriesLoading(false));
    return () => {
      active = false;
    };
  }, [client]);

  // Poll the provider transaction while on the status step until terminal.
  useEffect(() => {
    if (step !== 'status' || !txId) return;
    if (
      (workflow && ['completed', 'failed', 'refunded'].includes(workflow.lifecycleState ?? workflow.status)) ||
      (txStatus && TERMINAL.includes(txStatus))
    )
      return;
    let active = true;
    const id = setInterval(async () => {
      try {
        const tx = await client.getRampTransaction(txId);
        if (!active) return;
        if (tx.transactionVersion !== undefined && !acceptWorkflow(tx)) return;
        setTxStatus(tx.status);
        if (tx.stellarTxHash) setStellarTxHash(tx.stellarTxHash);
        if (tx.kycUrl) setKycUrl(tx.kycUrl);
        if (tx.depositInstructions) setDepositInstructions(tx.depositInstructions);
      } catch {
        /* transient - keep polling */
      }
    }, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [step, txId, txStatus, workflow?.lifecycleState, client]);

  // A link-less provider KYC gate (Abroad): poll until the user clears it elsewhere.
  useEffect(() => {
    if (workflow || step !== 'status' || !kycPending || kycApproved) return;
    let active = true;
    const check = async () => {
      try {
        const { hasApproved } = await client.getRampKycStatus();
        if (active && hasApproved) setKycApproved(true);
      } catch {
        /* transient - keep polling */
      }
    };
    void check();
    const id = setInterval(check, 10000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [step, kycPending, kycApproved, workflow, client]);

  function handleCountryChange(code: string) {
    setRouteId('');
    setCountry(code);
    const match = countries.find((c) => c.code === code);
    if (match?.currency) setCurrency(match.currency);
  }

  function resetToInput({ keepMessage = false }: { keepMessage?: boolean } = {}) {
    setStep('input');
    setQuotes([]);
    setRequirementsRequired([]);
    setSelectedQuote(null);
    setFieldValues({});
    setWorkflow(null);
    workflowRef.current = null;
    setLegacySignature(undefined);
    saveRamp(null);
    setTxId(null);
    setProvider('');
    setKycUrl(null);
    setTosUrl(null);
    setTxStatus(null);
    setStellarTxHash(null);
    setDepositInstructions(null);
    setKycPending(false);
    setKycApproved(false);
    setNoticeMsg(null);
    if (!keepMessage) setErrorMsg(null);
  }

  /**
   * Quote the current input. A route held back by a requirement step still counts as an answer:
   * it is shown locked, so "no providers" only means nothing came back at all.
   */
  async function fetchQuotes(): Promise<{ list: RampQuote[]; locked: RampQuoteRequirement[] } | null> {
    try {
      const result = await client.getRampsQuote({
        country,
        amount: Number(amount),
        amountExact: amount,
        currency,
        direction,
        ...(selectedRoute ? { routeId: selectedRoute.routeId, chain: selectedRoute.asset.chain } : {}),
      });
      const list = result.quotes ?? [];
      const locked = result.requirementsRequired ?? [];
      if (list.length === 0 && locked.length === 0) {
        setErrorMsg(`No ramp providers available for ${country} yet.`);
        setStep('error');
        return null;
      }
      return { list, locked };
    } catch (e) {
      setErrorMsg(rampErrorMessage(e, 'Failed to fetch quotes.'));
      setStep('error');
      return null;
    }
  }

  async function handleFindRoute() {
    setStep('loading_quote');
    setIsLoading(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    const quoted = await fetchQuotes();
    if (!mounted.current) return;
    setIsLoading(false);
    if (!quoted) return;
    setQuotes(quoted.list);
    setRequirementsRequired(quoted.locked);
    setStep('select_route');
  }

  /**
   * Back to the route list with fresh prices for the same input. A verification
   * takes minutes and quotes live about as long, so the one that hit the gate is
   * usually expired by now; the user picks again rather than an order starting on
   * a price they did not see.
   */
  async function requoteAfterKyc(completed: PendingRequirement['type'] = 'KYC') {
    setStep('loading_quote');
    setIsLoading(true);
    setErrorMsg(null);
    setSelectedQuote(null);
    const quoted = await fetchQuotes();
    if (!mounted.current) return;
    setIsLoading(false);
    if (!quoted) return;
    setQuotes(quoted.list);
    setRequirementsRequired(quoted.locked);
    setNoticeMsg(
      completed === 'KYC'
        ? 'Your identity is verified. Prices may have changed, so choose a route to continue.'
        : 'Thanks, your details are saved. Prices may have changed, so choose a route to continue.',
    );
    setStep('select_route');
  }

  async function resumeWithSignature(id: string, ps: NonNullable<RampResult['pendingSignature']>) {
    const outcome = await client.signTx(ps.unsignedXdr, { skipSponsorship: ps.action === 'sep10' });
    if (outcome.status !== 'signed') {
      setErrorMsg(outcome.message ?? outcome.details ?? 'Signing was cancelled.');
      setStep('error');
      return;
    }
    const result = (await client.submitRampSignature(id, {
      signedXdr: outcome.signedXdr,
      action: ps.action,
    })) as RampResult;
    await applyResult(result);
  }

  async function applyResult(result: RampResult) {
    const generic = result as RampResult & RampSnapshot;
    if (generic.transactionVersion !== undefined && !acceptWorkflow(generic)) return;
    saveRamp({ direction: initialRamp.current?.direction ?? direction, transaction: result as RampsTransactionResponse });
    initialRamp.current = null;
    setTxId(result.txId);
    setProvider(result.provider);
    setLegacySignature(result.pendingSignature);
    setKycUrl(result.kycUrl ?? null);
    setTosUrl(result.tosUrl ?? null);
    setKycPending(result.kycRequired === true);
    if (result.kycRequired) setKycApproved(false);
    setTxStatus(result.status);
    setStellarTxHash(result.stellarTxHash ?? null);
    setDepositInstructions(result.depositInstructions ?? null);
    setStep('status');
  }

  function handleSelectQuote(quote: RampQuote) {
    setSelectedQuote(quote);
    setErrorMsg(null);
    setNoticeMsg(null);
    const broken = brokenLimitOf(Number(amount), quote);
    if (broken) {
      setErrorMsg(limitMessage(broken.limit, broken.value, currency));
      return;
    }
    const fields = requiredFieldsOf(quote);
    const missing = fields.some((f) => !f.optional && !(fieldValues[f.key] ?? '').trim());
    if (fields.length > 0 && missing) {
      setStep('contact');
      return;
    }
    void startRamp(quote);
  }

  async function startRamp(quote: RampQuote) {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const base: Record<string, unknown> = {
        quoteId: quote.quoteId,
        amount: Number(amount),
        amountExact: quote.terms?.fiatAmount ?? amount,
        currency,
        country,
      };
      if (walletAddress) base.walletAddress = walletAddress;
      // Same mapping as the web widget: a `bankType` field becomes `bankDetails`,
      // the standard body fields map by name, anything else goes into `fields`.
      const STANDARD_BODY_KEYS = new Set(['email', 'fullName', 'taxId', 'qrCode']);
      const extraFields: Record<string, string> = {};
      for (const f of requiredFieldsOf(quote)) {
        const val = (fieldValues[f.key] ?? '').trim();
        if (!val) continue;
        if (f.bankType) base.bankDetails = { type: f.bankType, value: val };
        else if (STANDARD_BODY_KEYS.has(f.key)) base[f.key] = val;
        else extraFields[f.key] = val;
      }
      if (Object.keys(extraFields).length > 0) base.fields = extraFields;
      const result = (
        direction === 'onramp'
          ? await client.createOnRamp(base as RampsOnrampBody)
          : await client.createOffRamp(base as RampsOfframpBody)
      ) as RampResult;
      if (!mounted.current) return;
      await applyResult(result);
    } catch (e) {
      if (!mounted.current) return;
      const requirement = requiredRampKyc(e);
      if (requirement) {
        setStep(requiredFieldsOf(quote).length ? 'contact' : 'select_route');
        setErrorMsg(
          requirement.type === 'KYC'
            ? 'Identity verification is required before continuing.'
            : 'A few more details are required before continuing.',
        );
        kycAttempt.current = requirement;
        setPendingKyc(requirement);
        return;
      }
      setErrorMsg(rampErrorMessage(e, 'Failed to start the ramp.'));
      setStep('error');
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }

  async function handleLegacySignature() {
    if (!txId || !legacySignature || completionLocked.current) return;
    completionLocked.current = true;
    setCompleting(true);
    setErrorMsg(null);
    try {
      await resumeWithSignature(txId, legacySignature);
    } catch (e) {
      setErrorMsg(rampErrorMessage(e, 'Failed to submit the signature.'));
    } finally {
      completionLocked.current = false;
      setCompleting(false);
    }
  }

  async function handleCompleteWithdraw() {
    if (!txId || completionLocked.current) return;
    completionLocked.current = true;
    setCompleting(true);
    setErrorMsg(null);
    try {
      const result = (await client.completeWithdraw(txId)) as RampResult;
      if (result.pendingSignature) {
        await resumeWithSignature(txId, result.pendingSignature);
        return;
      }
      setTxStatus(result.status);
      setStellarTxHash(result.stellarTxHash ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setErrorMsg(
        msg.includes('KYC') ? 'Finish KYC at the provider first, then try again.' : msg || 'Failed to complete the withdrawal.',
      );
    } finally {
      completionLocked.current = false;
      setCompleting(false);
    }
  }

  /** Open the step a locked route names (KYC, form, registry check or registration); completing it re-quotes like the start gate does. */
  function handleVerifyRoute(requirement: RampQuoteRequirement) {
    const attempt = pendingFromQuote(requirement);
    setErrorMsg(null);
    setNoticeMsg(null);
    kycAttempt.current = attempt;
    setPendingKyc(attempt);
  }

  function handleOpenUrl(url: string) {
    Linking.openURL(url).catch(() => setErrorMsg('Could not open the page. Please try again.'));
  }

  const kycBlocking = kycPending && !kycApproved;
  const canComplete =
    !workflow &&
    !legacySignature &&
    direction === 'offramp' &&
    step === 'status' &&
    txStatus !== 'completed' &&
    txStatus !== 'failed' &&
    !stellarTxHash &&
    !kycPending;

  // Keep this widget's state while a step is open so cancelling preserves the form.
  if (pendingKyc?.type === 'FORM') {
    return (
      <RequirementFormModal
        formId={pendingKyc.optionId}
        progress={pendingKyc.progress}
        onClose={() => {
          kycAttempt.current = null;
          setPendingKyc(null);
        }}
        onSubmitted={() => {
          if (kycAttempt.current !== pendingKyc) return;
          kycAttempt.current = null;
          setPendingKyc(null);
          void requoteAfterKyc('FORM');
        }}
      />
    );
  }

  if (pendingKyc?.type === 'REGISTRY_CHECK' || pendingKyc?.type === 'PROVIDER_REGISTRATION') {
    const close = () => {
      kycAttempt.current = null;
      setPendingKyc(null);
    };
    const done = () => {
      if (kycAttempt.current !== pendingKyc) return;
      close();
      void requoteAfterKyc(pendingKyc.type);
    };
    return pendingKyc.type === 'REGISTRY_CHECK' ? (
      <RegistryCheckModal optionId={pendingKyc.optionId} progress={pendingKyc.progress} onClose={close} onApproved={done} />
    ) : (
      <ProviderRegistrationModal
        corridorId={pendingKyc.corridorId}
        progress={pendingKyc.progress}
        onClose={close}
        onRegistered={done}
      />
    );
  }

  if (pendingKyc) {
    return (
      <KycModal
        country={country}
        corridorId={pendingKyc.corridorId}
        providerId={pendingKyc.optionId}
        onClose={() => {
          kycAttempt.current = null;
          setPendingKyc(null);
        }}
        onApproved={() => {
          // Ignore duplicate approvals or polling that finishes after cancellation.
          if (kycAttempt.current !== pendingKyc) return;
          kycAttempt.current = null;
          setPendingKyc(null);
          void requoteAfterKyc();
        }}
      />
    );
  }

  return (
    <PollarOverlay onCancel={onClose}>
      <View style={styles.modalWrapper}>
        <RampWidgetTemplate
          routeSelector={
            routes.length > 0 && (
              <View>
                <Text style={[styles.label, { color: routeTextColor }]}>Asset and payment route</Text>
                {routes.map((route) => (
                  <TouchableOpacity
                    key={route.routeId}
                    style={[
                      styles.chip,
                      { marginBottom: 8, borderColor: routeId === route.routeId ? accentColor : routeBorderColor },
                    ]}
                    disabled={countriesLoading}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: countriesLoading, selected: routeId === route.routeId }}
                    onPress={() => {
                      setRouteId(route.routeId);
                      setCountry(route.country);
                      setCurrency(route.fiatCurrency);
                      setDirection(route.direction);
                    }}
                  >
                    <Text style={{ color: routeTextColor }}>
                      {route.direction} · {route.fiatCurrency} / {route.asset.code} · {route.asset.chain} · {route.rail}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )
          }
          workflowContent={
            workflow ? (
              <RampWorkflow
                copyText={copyText}
                client={client}
                snapshot={workflow}
                onChange={(next) => {
                  if (acceptWorkflow(next)) setTxStatus(next.status);
                }}
              />
            ) : legacySignature && step === 'status' && txStatus !== 'completed' && txStatus !== 'failed' ? (
              <TouchableOpacity disabled={completing} onPress={() => void handleLegacySignature()}>
                <Text>Authorize wallet request</Text>
              </TouchableOpacity>
            ) : undefined
          }
          theme={theme}
          accentColor={accentColor}
          step={step}
          direction={direction}
          amount={amount}
          currency={currency}
          country={country}
          countries={countries}
          countriesLoading={countriesLoading}
          quotes={quotes}
          kycRequired={requirementsRequired}
          requiredFields={selectedQuote ? requiredFieldsOf(selectedQuote) : []}
          fieldValues={fieldValues}
          isLoading={isLoading}
          provider={provider}
          txStatus={txStatus}
          kycUrl={kycUrl}
          tosUrl={tosUrl}
          kycBlocking={kycBlocking}
          stellarTxHash={stellarTxHash}
          depositInstructions={depositInstructions}
          canComplete={canComplete}
          completing={completing}
          errorMsg={errorMsg}
          noticeMsg={noticeMsg}
          onDirectionChange={(next) => {
            setDirection(next);
            setRouteId('');
          }}
          onAmountChange={(next) => {
            setAmount(next);
            setErrorMsg(null);
          }}
          onCountryChange={handleCountryChange}
          onFieldChange={(key, value) => setFieldValues((v) => ({ ...v, [key]: value }))}
          onFindRoute={handleFindRoute}
          onSelectQuote={handleSelectQuote}
          onVerifyRoute={handleVerifyRoute}
          onContactContinue={() => selectedQuote && void startRamp(selectedQuote)}
          onOpenUrl={handleOpenUrl}
          onCompleteWithdraw={handleCompleteWithdraw}
          onBack={() => resetToInput({ keepMessage: true })}
          onRetry={() => resetToInput()}
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
    maxHeight: '90%',
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
    marginBottom: 16,
    marginTop: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
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
  body: {
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    marginVertical: 8,
  },
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 8,
  },
  instructions: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  primaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  lockedRoute: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  lockedRouteBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  statusBox: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
