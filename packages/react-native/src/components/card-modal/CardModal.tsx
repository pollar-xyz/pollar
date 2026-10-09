import {
  isPollarApiError,
  type CardBalance,
  type CardDepositAddress,
  type CardFunding,
  type CardHolder,
  type CardIncomeRange,
  type CardInfo,
  type CardKycInput,
  type CardOccupation,
  type CardProvider,
  type CardRequirements,
  type CardSecrets,
  type CardTransaction,
} from '@pollar/core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { usePollar } from '../../context';
import { PollarModalFooter } from '../commons';
import { KycModal } from '../kyc-modal/KycModal';
import { ProviderRegistrationModal } from '../provider-registration-modal/ProviderRegistrationModal';
import { RegistryCheckModal } from '../registry-check-modal/RegistryCheckModal';
import { RequirementFormModal } from '../requirement-form-modal/RequirementFormModal';
import { blockedStepMessage, cardStage, pendingFromRequirement, requiredCardStep, type PendingCardStep } from './card-kyc';

export interface CardModalProps {
  onClose: () => void;
}

/** How often the holder is re-read while the provider's identity verification is pending. */
const KYC_POLL_MS = 5000;
/** How long the revealed number stays on screen. */
const REVEAL_MS = 30_000;
const TX_LIMIT = 10;
/** How often fundings in flight are re-read while the funding panel is open. */
const FUNDING_POLL_MS = 10_000;
const FUNDING_INFLIGHT = new Set(['CREATED', 'BURNED', 'ATTESTED', 'MINTED']);

const FUNDING_COPY: Record<string, string> = {
  CREATED: 'Waiting for your payment to confirm',
  BURNED: 'Leaving Stellar',
  ATTESTED: 'Crossing to Polygon',
  MINTED: 'Arrived, waiting for the card to credit it',
  CREDITED: 'Credited',
  FAILED: 'Failed',
};

const INCOME_RANGES: { value: CardIncomeRange; label: string }[] = [
  { value: '0-1000', label: 'Up to 1,000 USD' },
  { value: '1000-5000', label: '1,000 to 5,000 USD' },
  { value: '5000-10000', label: '5,000 to 10,000 USD' },
  { value: '10000+', label: 'More than 10,000 USD' },
];

const TX_LABELS: Record<string, string> = {
  deposit: 'Deposit',
  transactionTransfer: 'Bank deposit',
  spend: 'Purchase',
  spend_adjustment: 'Adjustment',
  fee: 'Fee',
  fee_refund: 'Fee refund',
  withdrawal: 'Withdrawal',
  card_insurance: 'Card issuance',
};

const KYC_PENDING_COPY: Record<string, string> = {
  PENDING: 'Your information is being reviewed.',
  NEEDS_ACTION:
    'Finish verifying your identity with the card provider: you will be asked for a photo of your document and a selfie.',
  IN_REVIEW: 'Your verification is under manual review. This can take a while.',
};

const KYC_FINAL_COPY: Record<string, string> = {
  DENIED: 'Your verification was denied.',
  LOCKED: 'Your account is locked.',
  CANCELED: 'Your verification was canceled.',
};

const emptyKyc: CardKycInput = {
  firstName: '',
  lastName: '',
  birthDate: '',
  nationalId: '',
  countryOfIssue: '',
  phoneCountryCode: '',
  phoneNumber: '',
  occupation: '',
  annualSalary: '1000-5000',
  accountPurpose: 'Personal expenses',
  expectedMonthlyVolume: '1000-5000',
  address: { line1: '', line2: '', city: '', region: '', postalCode: '', countryCode: '' },
};

function usd(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '-';
  return `$${(cents / 100).toFixed(2)}`;
}

function money(amount: string, currency: string): string {
  const n = Number(amount);
  return `${Number.isFinite(n) ? n.toFixed(2) : amount} ${currency}`;
}

function groupPan(pan: string): string {
  return pan
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/** The provider's own words when it rejected something; our code otherwise. */
function errorText(e: unknown, fallback: string): string {
  if (isPollarApiError(e)) {
    const providerMessage = e.body.providerMessage;
    if (typeof providerMessage === 'string' && providerMessage) return providerMessage;
    const message = e.body.message;
    if (typeof message === 'string' && message) return message;
    return e.code;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * The card flow on React Native: the same screens as the web modal, with the
 * provider's hosted verification opened in the system browser.
 */
export function CardModal({ onClose }: CardModalProps) {
  const { getClient, styles: pollarStyles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = pollarStyles;
  const isDark = theme === 'dark';
  const colors = {
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#374151' : '#e5e7eb',
    card: isDark ? '#1a1a1a' : '#ffffff',
    panel: isDark ? '#262626' : '#f3f4f6',
    error: '#dc2626',
  };

  const [providers, setProviders] = useState<CardProvider[] | null>(null);
  const [holder, setHolder] = useState<CardHolder | null | undefined>(undefined);
  // undefined while loading; null when the provider has no steps or the server lacks the route.
  const [requirements, setRequirements] = useState<CardRequirements | null | undefined>(undefined);
  const [pendingStep, setPendingStep] = useState<PendingCardStep | null>(null);
  const stepAttempt = useRef<PendingCardStep | null>(null);
  const [cards, setCards] = useState<CardInfo[] | null>(null);
  const [balance, setBalance] = useState<CardBalance | null>(null);
  const [transactions, setTransactions] = useState<CardTransaction[] | null>(null);
  const [deposit, setDeposit] = useState<CardDepositAddress[] | null>(null);
  const [fundings, setFundings] = useState<CardFunding[] | null>(null);
  const [fundAmount, setFundAmount] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [occupations, setOccupations] = useState<CardOccupation[]>([]);
  const [kyc, setKyc] = useState<CardKycInput>(emptyKyc);
  const [terms, setTerms] = useState(false);
  const [nickname, setNickname] = useState('');
  const [secrets, setSecrets] = useState<CardSecrets | null>(null);
  const [panel, setPanel] = useState<'card' | 'fund'>('card');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on every mount: development mounts components twice, and the cleanup of the
    // first mount would otherwise leave this false and drop every response.
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, []);

  const provider = providers?.[0] ?? null;
  const card = cards?.[0] ?? null;

  // --- Loading ----------------------------------------------------------------
  const loadHolder = useCallback(async () => {
    const h = await getClient().getCardHolder();
    if (mounted.current) setHolder(h);
    return h;
  }, [getClient]);

  const loadRequirements = useCallback(
    async (cardProviderId: string) => {
      try {
        const r = await getClient().getCardRequirements({ cardProviderId });
        if (mounted.current) setRequirements(r);
        return r;
      } catch {
        if (mounted.current) setRequirements(null);
        return null;
      }
    },
    [getClient],
  );

  const loadCardData = useCallback(async () => {
    const client = getClient();
    const list = await client.getCards();
    if (!mounted.current) return;
    setCards(list);
    if (list.length === 0) return;
    const [b, tx] = await Promise.all([client.getCardBalance(), client.getCardTransactions({ limit: TX_LIMIT })]);
    if (!mounted.current) return;
    setBalance(b);
    setTransactions(tx.transactions);
  }, [getClient]);

  useEffect(() => {
    (async () => {
      try {
        const ps = await getClient().getCardProviders();
        if (!mounted.current) return;
        setProviders(ps);
        if (ps.length === 0) return;
        const [h] = await Promise.all([loadHolder(), loadRequirements(ps[0]!.id)]);
        if (h?.kycStatus === 'APPROVED') await loadCardData();
      } catch (e) {
        if (!mounted.current) return;
        setProviders((cur) => cur ?? []);
        setError(errorText(e, 'Could not load your card'));
      }
    })();
  }, [getClient, loadHolder, loadRequirements, loadCardData]);

  const stage = cardStage(holder, requirements);

  useEffect(() => {
    if (stage !== 'provider-form') return;
    const profile = getClient().getUserProfile();
    setKyc((k) => ({
      ...k,
      firstName: k.firstName || profile?.first_name || '',
      lastName: k.lastName || profile?.last_name || '',
    }));
    getClient()
      .getCardOccupations()
      .then((list) => mounted.current && setOccupations(list))
      .catch(() => mounted.current && setOccupations([]));
  }, [stage, getClient]);

  const kycPending = holder ? holder.kycStatus in KYC_PENDING_COPY : false;
  useEffect(() => {
    if (!kycPending) return;
    const id = setInterval(() => {
      loadHolder()
        .then((h) => {
          if (h?.kycStatus === 'APPROVED') void loadCardData();
        })
        .catch(() => {
          /* transient; the next tick retries */
        });
    }, KYC_POLL_MS);
    return () => clearInterval(id);
  }, [kycPending, loadHolder, loadCardData]);

  // --- Actions ------------------------------------------------------------------
  function openStep(step: PendingCardStep) {
    stepAttempt.current = step;
    setPendingStep(step);
  }

  async function run(key: string, work: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      await work();
    } catch (e) {
      if (!mounted.current) return;
      const step = requiredCardStep(e);
      if (step) openStep(step);
      else setError(errorText(e, fallback));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function afterStep() {
    if (!provider) return;
    const [h, r] = await Promise.all([loadHolder(), loadRequirements(provider.id)]);
    if (h?.kycStatus === 'APPROVED') await loadCardData();
    if (r?.next && !blockedStepMessage(r.next)) openStep(pendingFromRequirement(provider.id, r.next));
  }

  const start = () =>
    run(
      'start',
      async () => {
        if (!provider) return;
        if (requirements?.next) {
          openStep(pendingFromRequirement(provider.id, requirements.next));
          return;
        }
        // Signed up but not past the steps: read where the user stands again and open what is pending.
        if (holder) return afterStep();
        const h = await getClient().createCardHolder();
        if (mounted.current) setHolder(h);
      },
      'Could not start your card application',
    );

  const sendKyc = () =>
    run(
      'kyc',
      async () => {
        const address = { ...kyc.address };
        if (!address.line2) delete address.line2;
        const h = await getClient().submitCardKyc({ termsAccepted: terms, kyc: { ...kyc, address } });
        if (mounted.current) setHolder(h);
      },
      'Could not submit your information',
    );

  const issue = () =>
    run(
      'issue',
      async () => {
        await getClient().issueCard(nickname.trim() ? { nickname: nickname.trim() } : {});
        await loadCardData();
      },
      'Could not issue your card',
    );

  const reveal = () =>
    run(
      'reveal',
      async () => {
        if (!card) return;
        const s = await getClient().revealCardSecrets(card.id);
        if (!mounted.current) return;
        setSecrets(s);
        if (revealTimer.current) clearTimeout(revealTimer.current);
        revealTimer.current = setTimeout(() => mounted.current && setSecrets(null), REVEAL_MS);
      },
      'Could not show the card details',
    );

  const openFund = () =>
    run(
      'fund',
      async () => {
        const list = await getClient().listCardFundings();
        if (!mounted.current) return;
        setFundings(list);
        setPanel('fund');
      },
      'Could not load your fundings',
    );

  const fund = () =>
    run(
      'fund-send',
      async () => {
        const outcome = await getClient().fundCard({ amount: fundAmount.trim() });
        if (!mounted.current) return;
        if (outcome.status === 'cancelled') {
          setError('The payment was not signed.');
          return;
        }
        setFundings((cur) => [outcome.funding, ...(cur ?? []).filter((f) => f.id !== outcome.funding.id)]);
        setFundAmount('');
      },
      'Could not fund the card',
    );

  const showManualAddress = () =>
    run(
      'fund-manual',
      async () => {
        if (!deposit) {
          const list = await getClient().getCardDepositAddresses();
          if (mounted.current) setDeposit(list);
        }
        if (mounted.current) setShowManual(true);
      },
      'Could not load the deposit address',
    );

  const fundingsInflight = (fundings ?? []).some((f) => FUNDING_INFLIGHT.has(f.status));
  useEffect(() => {
    if (panel !== 'fund' || !fundingsInflight) return;
    const id = setInterval(() => {
      getClient()
        .listCardFundings()
        .then((list) => mounted.current && setFundings(list))
        .catch(() => {
          /* transient; the next tick retries */
        });
    }, FUNDING_POLL_MS);
    return () => clearInterval(id);
  }, [panel, fundingsInflight, getClient]);

  function openUrl(url: string) {
    Linking.openURL(url).catch(() => setError('Could not open the page. Please try again.'));
  }

  const kycComplete =
    kyc.firstName &&
    kyc.lastName &&
    /^\d{4}-\d{2}-\d{2}$/.test(kyc.birthDate) &&
    kyc.nationalId &&
    kyc.countryOfIssue.length === 2 &&
    kyc.phoneCountryCode &&
    kyc.phoneNumber &&
    kyc.occupation &&
    kyc.accountPurpose &&
    kyc.address.line1 &&
    kyc.address.city &&
    kyc.address.region &&
    kyc.address.postalCode &&
    kyc.address.countryCode.length === 2;

  // --- Platform steps, in place of the modal -------------------------------------
  if (pendingStep) {
    const close = () => {
      stepAttempt.current = null;
      setPendingStep(null);
    };
    const done = () => {
      // Ignore a step that finishes after it was cancelled or replaced.
      if (stepAttempt.current !== pendingStep) return;
      close();
      void afterStep();
    };
    if (pendingStep.type === 'FORM') {
      return (
        <RequirementFormModal
          formId={pendingStep.optionId}
          progress={pendingStep.progress}
          onClose={close}
          onSubmitted={done}
        />
      );
    }
    if (pendingStep.type === 'REGISTRY_CHECK') {
      return (
        <RegistryCheckModal optionId={pendingStep.optionId} progress={pendingStep.progress} onClose={close} onApproved={done} />
      );
    }
    if (pendingStep.type === 'PROVIDER_REGISTRATION') {
      return (
        <ProviderRegistrationModal
          cardProviderId={pendingStep.cardProviderId}
          progress={pendingStep.progress}
          onClose={close}
          onRegistered={done}
        />
      );
    }
    return (
      <KycModal
        cardProviderId={pendingStep.cardProviderId}
        providerId={pendingStep.optionId}
        onClose={close}
        onApproved={done}
      />
    );
  }

  // --- Render -------------------------------------------------------------------
  const loading = providers === null || (providers.length > 0 && (holder === undefined || requirements === undefined));
  const blocked = requirements?.next ? blockedStepMessage(requirements.next) : null;
  const stepsPending = !!requirements?.next;
  const title = panel === 'fund' ? 'Add funds' : card ? (card.nickname ?? 'Your card') : 'Get a card';
  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.border }];
  const noteStyle = { color: colors.muted, fontSize: 12, marginTop: 8 };

  const input = (
    value: string,
    onChange: (text: string) => void,
    label: string,
    extra: { placeholder?: string; keyboardType?: 'default' | 'numeric' | 'decimal-pad'; maxLength?: number } = {},
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={onChange}
        placeholder={extra.placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={extra.keyboardType ?? 'default'}
        maxLength={extra.maxLength}
        autoCapitalize="none"
      />
    </View>
  );

  const choices = <T extends string>(
    label: string,
    value: T,
    options: { value: T; label: string }[],
    onPick: (v: T) => void,
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <View style={styles.choices}>
        {options.map((o) => (
          <TouchableOpacity
            key={o.value}
            onPress={() => onPick(o.value)}
            style={[
              styles.choice,
              {
                borderColor: value === o.value ? accentColor : colors.border,
                backgroundColor: value === o.value ? accentColor : 'transparent',
              },
            ]}
          >
            <Text style={{ color: value === o.value ? '#fff' : colors.text, fontSize: 12 }}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const primary = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      style={[styles.primaryBtn, { backgroundColor: accentColor, opacity: disabled ? 0.6 : 1 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );

  const secondary = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      style={[styles.secondaryBtn, { borderColor: colors.border, opacity: disabled ? 0.6 : 1 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.overlay}>
      <View style={styles.modalWrapper}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.header}>
            {panel === 'fund' && (
              <TouchableOpacity onPress={() => setPanel('card')} accessibilityLabel="Back" style={styles.headerBtn}>
                <Text style={{ color: colors.muted, fontSize: 16 }}>{'<'}</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" style={styles.headerBtn}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
            {loading && (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={accentColor} />
              </View>
            )}

            {!loading && providers?.length === 0 && (
              <Text style={{ color: colors.error }}>Cards are not available for this app.</Text>
            )}
            {!loading && provider && !provider.available && (
              <Text style={{ color: colors.error }}>Cards are not available right now.</Text>
            )}

            {/* Step 1: the platform's steps, then the provider sign-up */}
            {!loading && provider && provider.available && stage === 'steps' && (
              <View>
                <Text style={{ color: colors.text, lineHeight: 20 }}>
                  Get a {provider.name} card funded from your wallet. You will verify your identity first; it takes a few
                  minutes.
                </Text>
                {requirements && requirements.total > 0 && (
                  <Text style={noteStyle}>
                    {requirements.completed} of {requirements.total} steps done
                  </Text>
                )}
                {!!blocked && <Text style={{ color: colors.error, marginTop: 8 }}>{blocked}</Text>}
                {primary(
                  busy === 'start' ? 'Starting...' : stepsPending ? 'Continue' : 'Start',
                  () => void start(),
                  busy !== null || !!blocked,
                )}
              </View>
            )}

            {/* Step 2: the provider's own KYC form, when no PROVIDER_REGISTRATION step sends it for the user */}
            {!loading && provider && stage === 'provider-form' && (
              <View>
                <Text style={[styles.section, { color: colors.muted }]}>About you</Text>
                {input(kyc.firstName, (v) => setKyc((k) => ({ ...k, firstName: v })), 'First name')}
                {input(kyc.lastName, (v) => setKyc((k) => ({ ...k, lastName: v })), 'Last name')}
                {input(kyc.birthDate, (v) => setKyc((k) => ({ ...k, birthDate: v })), 'Birth date', {
                  placeholder: 'YYYY-MM-DD',
                })}
                {input(kyc.nationalId, (v) => setKyc((k) => ({ ...k, nationalId: v })), 'ID number')}
                {input(
                  kyc.countryOfIssue,
                  (v) => setKyc((k) => ({ ...k, countryOfIssue: v.toUpperCase() })),
                  'ID country (2 letters)',
                  {
                    placeholder: 'AR',
                    maxLength: 2,
                  },
                )}
                {choices(
                  'Occupation',
                  kyc.occupation,
                  occupations.map((o) => ({ value: o.code, label: o.label })),
                  (v) => setKyc((k) => ({ ...k, occupation: v })),
                )}
                {input(kyc.phoneCountryCode, (v) => setKyc((k) => ({ ...k, phoneCountryCode: v })), 'Phone country code', {
                  placeholder: '54',
                  keyboardType: 'numeric',
                })}
                {input(kyc.phoneNumber, (v) => setKyc((k) => ({ ...k, phoneNumber: v })), 'Phone number', {
                  placeholder: '91155551234',
                  keyboardType: 'numeric',
                })}
                {choices('Annual income', kyc.annualSalary, INCOME_RANGES, (v) => setKyc((k) => ({ ...k, annualSalary: v })))}
                {choices('Expected monthly spend', kyc.expectedMonthlyVolume, INCOME_RANGES, (v) =>
                  setKyc((k) => ({ ...k, expectedMonthlyVolume: v })),
                )}
                {input(
                  kyc.accountPurpose,
                  (v) => setKyc((k) => ({ ...k, accountPurpose: v })),
                  'What will you use the card for?',
                )}

                <Text style={[styles.section, { color: colors.muted }]}>Address</Text>
                {input(
                  kyc.address.line1,
                  (v) => setKyc((k) => ({ ...k, address: { ...k.address, line1: v } })),
                  'Street and number',
                )}
                {input(
                  kyc.address.line2 ?? '',
                  (v) => setKyc((k) => ({ ...k, address: { ...k.address, line2: v } })),
                  'Apartment, floor (optional)',
                )}
                {input(kyc.address.city, (v) => setKyc((k) => ({ ...k, address: { ...k.address, city: v } })), 'City')}
                {input(
                  kyc.address.region,
                  (v) => setKyc((k) => ({ ...k, address: { ...k.address, region: v } })),
                  'State or province',
                )}
                {input(
                  kyc.address.postalCode,
                  (v) => setKyc((k) => ({ ...k, address: { ...k.address, postalCode: v } })),
                  'Postal code',
                )}
                {input(
                  kyc.address.countryCode,
                  (v) => setKyc((k) => ({ ...k, address: { ...k.address, countryCode: v.toUpperCase() } })),
                  'Country (2 letters)',
                  { placeholder: 'AR', maxLength: 2 },
                )}

                <TouchableOpacity
                  style={styles.terms}
                  onPress={() => setTerms((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: terms }}
                >
                  <View
                    style={[
                      styles.box,
                      {
                        borderColor: terms ? accentColor : colors.border,
                        backgroundColor: terms ? accentColor : 'transparent',
                      },
                    ]}
                  >
                    {terms && <Text style={styles.boxMark}>✓</Text>}
                  </View>
                  <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
                    I have read and accept the {provider.name} terms of service.
                  </Text>
                </TouchableOpacity>
                {provider.termsUrl && (
                  <TouchableOpacity onPress={() => openUrl(provider.termsUrl!)}>
                    <Text style={{ color: accentColor, textDecorationLine: 'underline', marginBottom: 8 }}>Read the terms</Text>
                  </TouchableOpacity>
                )}
                {primary(
                  busy === 'kyc' ? 'Sending...' : 'Continue',
                  () => void sendKyc(),
                  busy !== null || !terms || !kycComplete,
                )}
              </View>
            )}

            {/* Step 3: the provider's verification pending */}
            {!loading && holder && holder.kycStatus in KYC_PENDING_COPY && (
              <View>
                <Text style={{ color: colors.text, lineHeight: 20 }}>{KYC_PENDING_COPY[holder.kycStatus]}</Text>
                {!!holder.kycReason && <Text style={noteStyle}>{holder.kycReason}</Text>}
                {holder.verificationLink && primary('Verify my identity', () => openUrl(holder.verificationLink!))}
                {secondary('I am done', () => void loadHolder().catch(() => {}))}
                <Text style={noteStyle}>This screen updates on its own once the verification comes back.</Text>
              </View>
            )}

            {!loading && holder && holder.kycStatus in KYC_FINAL_COPY && (
              <Text style={{ color: colors.error }}>
                {KYC_FINAL_COPY[holder.kycStatus]}
                {holder.kycReason ? ` ${holder.kycReason}` : ''}
              </Text>
            )}

            {/* Step 4: approved, no card yet */}
            {!loading && provider && holder?.kycStatus === 'APPROVED' && cards !== null && !card && (
              <View>
                <Text style={{ color: colors.text, lineHeight: 20 }}>
                  Your identity is verified. Issue your virtual card to start.
                </Text>
                {input(nickname, setNickname, 'Card name (optional)', { placeholder: 'Everyday card', maxLength: 40 })}
                {primary(busy === 'issue' ? 'Issuing...' : 'Issue my card', () => void issue(), busy !== null)}
              </View>
            )}

            {/* Step 5: the card */}
            {!loading && provider && card && panel === 'card' && (
              <View>
                <View style={[styles.visual, { backgroundColor: accentColor }]}>
                  <View style={styles.visualRow}>
                    <Text style={styles.visualSmall}>{provider.name}</Text>
                    <Text style={styles.visualSmall}>{card.status.toLowerCase()}</Text>
                  </View>
                  <Text style={styles.visualNumber}>
                    {secrets ? groupPan(secrets.pan) : `**** **** **** ${card.last4 ?? '****'}`}
                  </Text>
                  <View style={styles.visualRow}>
                    <Text style={styles.visualSmall}>
                      EXP {card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear.slice(-2)}` : '--/--'}
                    </Text>
                    <Text style={styles.visualSmall}>CVC {secrets ? secrets.cvc : '***'}</Text>
                    <Text style={styles.visualSmall}>{card.currency}</Text>
                  </View>
                </View>

                <View style={styles.balanceRow}>
                  {[
                    ['Available', usd(balance?.spendingPowerCents)],
                    ['Limit', usd(balance?.creditLimitCents)],
                    ['To pay', usd(balance?.balanceDueCents)],
                  ].map(([label, value]) => (
                    <View key={label} style={[styles.balanceCell, { backgroundColor: colors.panel }]}>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>{value}</Text>
                    </View>
                  ))}
                </View>

                {provider.supports.revealSecrets &&
                  (secrets
                    ? secondary('Hide details', () => setSecrets(null))
                    : secondary(busy === 'reveal' ? 'Loading...' : 'Show details', () => void reveal(), busy !== null))}
                {primary('Add funds', () => void openFund(), busy !== null)}
                {secrets && <Text style={noteStyle}>The details hide on their own in 30 seconds. Do not share them.</Text>}

                <Text style={[styles.section, { color: colors.muted }]}>Recent activity</Text>
                {transactions === null && <Text style={noteStyle}>Loading...</Text>}
                {transactions?.length === 0 && <Text style={noteStyle}>No movements yet.</Text>}
                {transactions?.map((tx) => (
                  <View key={tx.id} style={[styles.txRow, { borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 13 }}>
                        {tx.merchantName ?? TX_LABELS[tx.type] ?? tx.type}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>{new Date(tx.occurredAt).toLocaleDateString()}</Text>
                    </View>
                    <Text style={{ color: tx.direction === 'credit' ? '#15803d' : colors.text, fontSize: 13 }}>
                      {tx.direction === 'credit' ? '+' : tx.direction === 'debit' ? '-' : ''}
                      {money(tx.amount, tx.currency)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Funding */}
            {!loading && provider && card && panel === 'fund' && (
              <View>
                <Text style={{ color: colors.text, lineHeight: 20 }}>
                  Move {provider.fundingAssets.join(' or ') || 'USDC'} from your wallet to your card. It takes a few minutes to
                  cross to the card network.
                </Text>
                {input(fundAmount, (v) => setFundAmount(v.replace(/[^0-9.]/g, '')), 'Amount (USDC)', {
                  placeholder: '10',
                  keyboardType: 'decimal-pad',
                })}
                {primary(
                  busy === 'fund-send' ? 'Sending...' : 'Fund from my wallet',
                  () => void fund(),
                  busy !== null || !(Number(fundAmount) >= 1),
                )}

                {fundings && fundings.length > 0 && (
                  <View>
                    <Text style={[styles.section, { color: colors.muted }]}>Your fundings</Text>
                    {fundings.map((f) => (
                      <View key={f.id} style={[styles.txRow, { borderTopColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 13 }}>{FUNDING_COPY[f.status] ?? f.status}</Text>
                          <Text style={{ color: colors.muted, fontSize: 11 }}>
                            {new Date(f.createdAt).toLocaleString()}
                            {f.status === 'FAILED' && f.error ? ` ${f.error}` : ''}
                          </Text>
                        </View>
                        <Text style={{ color: f.status === 'CREDITED' ? '#15803d' : colors.text, fontSize: 13 }}>
                          {money(f.amount, 'USD')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {!showManual && (
                  <TouchableOpacity onPress={() => void showManualAddress()} disabled={busy !== null}>
                    <Text style={{ color: accentColor, textDecorationLine: 'underline', marginTop: 12 }}>
                      Prefer to send from another wallet? Show the deposit address
                    </Text>
                  </TouchableOpacity>
                )}
                {showManual &&
                  deposit?.map((d) => (
                    <View key={d.network} style={[styles.depositBox, { backgroundColor: colors.panel }]}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>
                        {d.network} (chain {d.chainId})
                      </Text>
                      <Text selectable style={{ color: colors.text, fontSize: 12, marginVertical: 6 }}>
                        {d.address}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        Send only {d.tokens.map((t) => (t.currency ?? 'token').toUpperCase()).join(' or ')} on {d.network};
                        anything else can be lost.
                      </Text>
                    </View>
                  ))}
                {showManual && deposit?.length === 0 && (
                  <Text style={{ color: colors.error }}>The provider returned no deposit address.</Text>
                )}
              </View>
            )}

            {!!error && (
              <Text style={{ color: colors.error, marginTop: 12 }} accessibilityRole="alert">
                {error}
              </Text>
            )}
          </ScrollView>
          <PollarModalFooter />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 50,
  },
  modalWrapper: { width: '100%', maxWidth: 420 },
  card: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  headerBtn: { padding: 6 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  loadingBox: { paddingVertical: 32, alignItems: 'center' },
  section: { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  field: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  terms: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginVertical: 10 },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  primaryBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondaryBtn: { borderRadius: 10, borderWidth: 1, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  visual: { borderRadius: 16, padding: 18, marginBottom: 12, aspectRatio: 1.586, justifyContent: 'space-between' },
  visualRow: { flexDirection: 'row', justifyContent: 'space-between' },
  visualSmall: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  visualNumber: { color: '#fff', fontSize: 20, letterSpacing: 2, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  balanceCell: { flex: 1, borderRadius: 10, padding: 10 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1 },
  depositBox: { borderRadius: 10, padding: 12, marginTop: 10 },
});
