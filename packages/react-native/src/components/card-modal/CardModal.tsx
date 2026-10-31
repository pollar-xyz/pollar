import {
  isPollarApiError,
  type CardBalance,
  type CardDepositAddress,
  type CardFunding,
  type CardFundingChain,
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
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { useWalletAvailable } from '../../useWalletAvailable';
import { AmountField } from '../AmountField';
import { COMMONS_COPY } from '../commons-copy';
import { PollarModalFooter } from '../commons';
import { KycModal } from '../kyc-modal/KycModal';
import { ProviderRegistrationModal } from '../provider-registration-modal/ProviderRegistrationModal';
import { RegistryCheckModal } from '../registry-check-modal/RegistryCheckModal';
import { RequirementFormModal } from '../requirement-form-modal/RequirementFormModal';
import { CARD_COPY, CREDIT_DELAYED, fundingProblemText, type CardCopy } from './card-copy';
import { blockedStepMessage, cardStage, pendingFromRequirement, requiredCardStep, type PendingCardStep } from './card-kyc';

/** Where the card modal opens: a starting point the user can change, never a lock. */
export interface CardModalOptions {
  /** 'fund' opens the funding panel once the user's card has loaded; a user without a card stays where they are. */
  panel?: 'fund';
  amount?: string;
  /** Used only when the user can fund the card from that chain. */
  chain?: CardFundingChain;
  /** Called with each funding the modal creates. */
  onFunded?: (funding: CardFunding) => void;
}

export interface CardModalProps {
  onClose: () => void;
  initial?: CardModalOptions | undefined;
}

/** How often the holder is re-read while the provider's identity verification is pending. */
const KYC_POLL_MS = 5000;
/** How long the revealed number stays on screen. */
const REVEAL_MS = 30_000;
const TX_LIMIT = 10;
/** How often fundings in flight are re-read while the funding panel is open. */
const FUNDING_POLL_MS = 5_000;
const FUNDING_INFLIGHT = new Set(['CREATED', 'SENT', 'BURNED', 'ATTESTED', 'MINTED']);

/** Only unique among the user's fundings, which is all the server compares it against; not a secret. */
function newFundingKey(): string {
  return `fund-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The states a funding in flight goes through, by the chain it is paid from: the step is the position. */
const FUNDING_STEPS: Record<CardFundingChain, string[]> = {
  STELLAR: ['CREATED', 'BURNED', 'ATTESTED', 'MINTED'],
  SOLANA: ['CREATED', 'SENT'],
};
/** The chains a card can be funded from, with their names. */
const FUNDING_CHAINS: { value: CardFundingChain; label: string }[] = [
  { value: 'STELLAR', label: 'Stellar' },
  { value: 'SOLANA', label: 'Solana' },
];
const isFundingChain = (chain: string): chain is CardFundingChain => FUNDING_CHAINS.some((c) => c.value === chain);

const INCOME_RANGES: CardIncomeRange[] = ['0-1000', '1000-5000', '5000-10000', '10000+'];

const KYC_PENDING = new Set(['PENDING', 'NEEDS_ACTION', 'IN_REVIEW']);
const KYC_FINAL = new Set(['DENIED', 'LOCKED', 'CANCELED']);

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
function errorText(e: unknown, fallback: string, copy: CardCopy): string {
  if (isPollarApiError(e)) {
    const known = copy.errors[e.code];
    if (known) return known;
    // A funding custody refused or the wallet cannot pay: its reason, not custody's sentence.
    if (e.code === 'SDK_CARDS_FUNDING_WALLET_NOT_READY') {
      const { reason, code, message } = e.body;
      if (reason === 'insufficient_usdc') return copy.fundingProblem.noBalance;
      if (reason === 'build_failed' || reason === 'payment_rejected') {
        return fundingProblemText(
          `${typeof code === 'string' ? code : ''}: ${typeof message === 'string' ? message : ''}`,
          copy,
        );
      }
    }
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
/** A copy control on the card art: white like the art's text, "Copied" for a moment after a tap. */
function CardCopyButton({
  value,
  label,
  copy,
  text,
}: {
  value: string;
  label: string;
  copy: (text: string) => Promise<void>;
  text: Pick<CardCopy, 'copy' | 'copied'>;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() =>
        void copy(value).then(() => {
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      <Text style={styles.copyLabel}>{copied ? text.copied : text.copy}</Text>
    </TouchableOpacity>
  );
}

export function CardModal({ onClose, initial }: CardModalProps) {
  const { getClient, copyText, styles: pollarStyles, wallets, appConfig } = usePollar();
  const language = useModalLanguage();
  const copy = CARD_COPY[language];
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
  const [fundAmount, setFundAmount] = useState(
    /^\d+(\.\d+)?$/.test(initial?.amount?.trim() ?? '') ? initial!.amount!.trim() : '',
  );
  // One key per funding the user means to make: a double click or a retry after
  // a lost response gets that funding back instead of paying twice.
  const fundKey = useRef<string | null>(null);
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
  const fundingAsset = provider?.fundingAssets[0] ?? 'USDC';
  // The chains the user holds a wallet on that a card can be funded from, in the app's order.
  const appChains = (appConfig?.application?.chains ?? []) as string[];
  const fundChains = FUNDING_CHAINS.filter(
    (c) => wallets.some((w) => (w.chain ?? 'STELLAR') === c.value) && (appChains.length === 0 || appChains.includes(c.value)),
  ).sort((a, b) => appChains.indexOf(a.value) - appChains.indexOf(b.value));
  const [fundChain, setFundChain] = useState<CardFundingChain | null>(null);
  const seededChain = fundChains.some((c) => c.value === initial?.chain) ? initial?.chain : undefined;
  const selectedFundChain = fundChain ?? seededChain ?? fundChains[0]?.value ?? 'STELLAR';
  const fundAvailable = useWalletAvailable(panel === 'fund' ? { chain: selectedFundChain, code: fundingAsset } : null);
  const card = cards?.[0] ?? null;
  const expiry = card?.expMonth && card.expYear ? `${card.expMonth}/${card.expYear.slice(-2)}` : null;

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
    if (list.length === 0) {
      setCards(list);
      return;
    }
    // The card, its balance and its movements land together: no card shown with an empty balance first.
    const [b, tx] = await Promise.all([client.getCardBalance(), client.getCardTransactions({ limit: TX_LIMIT })]);
    if (!mounted.current) return;
    setBalance(b);
    setTransactions(tx.transactions);
    setCards(list);
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
        setError(errorText(e, copy.failed.load, copy));
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

  const kycPending = holder ? KYC_PENDING.has(holder.kycStatus) : false;
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
      else setError(errorText(e, fallback, copy));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function afterStep() {
    if (!provider) return;
    const [h, r] = await Promise.all([loadHolder(), loadRequirements(provider.id)]);
    if (h?.kycStatus === 'APPROVED') await loadCardData();
    if (r?.next && !blockedStepMessage(r.next, copy.blocked)) openStep(pendingFromRequirement(provider.id, r.next));
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
      copy.failed.start,
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
      copy.failed.submit,
    );

  const issue = () =>
    run(
      'issue',
      async () => {
        await getClient().issueCard(nickname.trim() ? { nickname: nickname.trim() } : {});
        await loadCardData();
      },
      copy.failed.issue,
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
      copy.failed.reveal,
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
      copy.failed.loadFundings,
    );

  // Opens the funding panel the first time the user's card is on screen.
  const fundSeed = useRef(initial?.panel === 'fund');
  useEffect(() => {
    if (!fundSeed.current || !card) return;
    fundSeed.current = false;
    void openFund();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);

  const fund = () =>
    run(
      'fund-send',
      async () => {
        fundKey.current ??= newFundingKey();
        let outcome;
        try {
          outcome = await getClient().fundCard({
            amount: fundAmount.trim(),
            chain: selectedFundChain,
            idempotencyKey: fundKey.current,
          });
        } catch (e) {
          // The server answered, so the next attempt is a new funding; without an answer it keeps the key.
          if (isPollarApiError(e)) fundKey.current = null;
          throw e;
        }
        fundKey.current = null;
        if (!mounted.current) return;
        if (outcome.status === 'cancelled') {
          setError(copy.notSigned);
          return;
        }
        setFundings((cur) => [outcome.funding, ...(cur ?? []).filter((f) => f.id !== outcome.funding.id)]);
        setFundAmount('');
        initial?.onFunded?.(outcome.funding);
      },
      copy.failed.fund,
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
      copy.failed.loadDeposit,
    );

  const fundingsInflight = (fundings ?? []).some((f) => FUNDING_INFLIGHT.has(f.status));
  useEffect(() => {
    if (panel !== 'fund' || !fundingsInflight) return;
    const id = setInterval(() => {
      getClient()
        .listCardFundings()
        .then((next) => {
          if (!mounted.current) return;
          setFundings((previous) => {
            // A funding that just got credited moves the card's balance: re-read it.
            const credited = next.some(
              (f) => f.status === 'CREDITED' && previous?.find((p) => p.id === f.id)?.status !== 'CREDITED',
            );
            if (credited) void loadCardData().catch(() => {});
            return next;
          });
        })
        .catch(() => {
          /* transient; the next tick retries */
        });
    }, FUNDING_POLL_MS);
    return () => clearInterval(id);
  }, [panel, fundingsInflight, getClient, loadCardData]);

  function openUrl(url: string) {
    Linking.openURL(url).catch(() => setError(copy.failed.openPage));
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
  // An approved holder also waits for its card data, so the modal never shows blank between the holder and the card.
  const loading =
    providers === null ||
    (providers.length > 0 && (holder === undefined || requirements === undefined)) ||
    (holder?.kycStatus === 'APPROVED' && cards === null && !error);
  const blocked = requirements?.next ? blockedStepMessage(requirements.next, copy.blocked) : null;
  const stepsPending = !!requirements?.next;
  const title = panel === 'fund' ? copy.title.addFunds : card ? (card.nickname ?? copy.title.yourCard) : copy.title.getCard;
  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.border }];
  const noteStyle = { color: colors.muted, fontSize: 12, marginTop: 8 };
  const incomeRanges = INCOME_RANGES.map((value) => ({ value, label: copy.incomeRanges[value] }));

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
              <TouchableOpacity onPress={() => setPanel('card')} accessibilityLabel={copy.back} style={styles.headerBtn}>
                <Text style={{ color: colors.muted, fontSize: 16 }}>{'<'}</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel={copy.close} style={styles.headerBtn}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
            {loading && (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={accentColor} />
              </View>
            )}

            {!loading && providers?.length === 0 && <Text style={{ color: colors.error }}>{copy.unavailableForApp}</Text>}
            {!loading && provider && !provider.available && <Text style={{ color: colors.error }}>{copy.unavailableNow}</Text>}

            {/* Step 1: the platform's steps, then the provider sign-up */}
            {!loading && provider && provider.available && stage === 'steps' && (
              <View>
                <Text style={{ color: colors.text, lineHeight: 20 }}>
                  {copy.intro(provider.cardLabel ?? copy.defaultCardName(provider.name), true)}
                </Text>
                {requirements && requirements.total > 0 && (
                  <Text style={noteStyle}>{copy.stepsDone(requirements.completed, requirements.total)}</Text>
                )}
                {!!blocked && <Text style={{ color: colors.error, marginTop: 8 }}>{blocked}</Text>}
                {primary(
                  busy === 'start' ? copy.starting : stepsPending ? copy.continue : copy.start,
                  () => void start(),
                  busy !== null || !!blocked,
                )}
              </View>
            )}

            {/* Step 2: the provider's own KYC form, when no PROVIDER_REGISTRATION step sends it for the user */}
            {!loading && provider && stage === 'provider-form' && (
              <View>
                <Text style={[styles.section, { color: colors.muted }]}>{copy.aboutYou}</Text>
                {input(kyc.firstName, (v) => setKyc((k) => ({ ...k, firstName: v })), copy.firstName)}
                {input(kyc.lastName, (v) => setKyc((k) => ({ ...k, lastName: v })), copy.lastName)}
                {input(kyc.birthDate, (v) => setKyc((k) => ({ ...k, birthDate: v })), copy.birthDate, {
                  placeholder: copy.datePlaceholder,
                })}
                {input(kyc.nationalId, (v) => setKyc((k) => ({ ...k, nationalId: v })), copy.nationalId)}
                {input(kyc.countryOfIssue, (v) => setKyc((k) => ({ ...k, countryOfIssue: v.toUpperCase() })), copy.idCountry, {
                  placeholder: 'AR',
                  maxLength: 2,
                })}
                {choices(
                  copy.occupation,
                  kyc.occupation,
                  occupations.map((o) => ({ value: o.code, label: o.label })),
                  (v) => setKyc((k) => ({ ...k, occupation: v })),
                )}
                {input(kyc.phoneCountryCode, (v) => setKyc((k) => ({ ...k, phoneCountryCode: v })), copy.phoneCountryCode, {
                  placeholder: '54',
                  keyboardType: 'numeric',
                })}
                {input(kyc.phoneNumber, (v) => setKyc((k) => ({ ...k, phoneNumber: v })), copy.phoneNumber, {
                  placeholder: '91155551234',
                  keyboardType: 'numeric',
                })}
                {choices(copy.annualIncome, kyc.annualSalary, incomeRanges, (v) => setKyc((k) => ({ ...k, annualSalary: v })))}
                {choices(copy.monthlySpend, kyc.expectedMonthlyVolume, incomeRanges, (v) =>
                  setKyc((k) => ({ ...k, expectedMonthlyVolume: v })),
                )}
                {input(kyc.accountPurpose, (v) => setKyc((k) => ({ ...k, accountPurpose: v })), copy.accountPurpose)}

                <Text style={[styles.section, { color: colors.muted }]}>{copy.address}</Text>
                {input(kyc.address.line1, (v) => setKyc((k) => ({ ...k, address: { ...k.address, line1: v } })), copy.line1)}
                {input(
                  kyc.address.line2 ?? '',
                  (v) => setKyc((k) => ({ ...k, address: { ...k.address, line2: v } })),
                  copy.line2,
                )}
                {input(kyc.address.city, (v) => setKyc((k) => ({ ...k, address: { ...k.address, city: v } })), copy.city)}
                {input(kyc.address.region, (v) => setKyc((k) => ({ ...k, address: { ...k.address, region: v } })), copy.region)}
                {input(
                  kyc.address.postalCode,
                  (v) => setKyc((k) => ({ ...k, address: { ...k.address, postalCode: v } })),
                  copy.postalCode,
                )}
                {input(
                  kyc.address.countryCode,
                  (v) => setKyc((k) => ({ ...k, address: { ...k.address, countryCode: v.toUpperCase() } })),
                  copy.country,
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
                    {copy.termsPrefix}
                    {copy.termsLink(provider.name)}.
                  </Text>
                </TouchableOpacity>
                {provider.termsUrl && (
                  <TouchableOpacity onPress={() => openUrl(provider.termsUrl!)}>
                    <Text style={{ color: accentColor, textDecorationLine: 'underline', marginBottom: 8 }}>
                      {copy.readTerms}
                    </Text>
                  </TouchableOpacity>
                )}
                {primary(
                  busy === 'kyc' ? copy.sending : copy.continue,
                  () => void sendKyc(),
                  busy !== null || !terms || !kycComplete,
                )}
              </View>
            )}

            {/* Step 3: the provider's verification pending */}
            {!loading && holder && KYC_PENDING.has(holder.kycStatus) && (
              <View>
                <Text style={{ color: colors.text, lineHeight: 20 }}>{copy.kycPending[holder.kycStatus]}</Text>
                {!!holder.kycReason && <Text style={noteStyle}>{holder.kycReason}</Text>}
                {holder.verificationLink && primary(copy.verifyIdentity, () => openUrl(holder.verificationLink!))}
                {secondary(copy.done, () => void loadHolder().catch(() => {}))}
                <Text style={noteStyle}>{copy.autoUpdate}</Text>
              </View>
            )}

            {!loading && holder && KYC_FINAL.has(holder.kycStatus) && (
              <Text style={{ color: colors.error }}>
                {copy.kycFinal[holder.kycStatus]}
                {holder.kycReason ? ` ${holder.kycReason}` : ''}
              </Text>
            )}

            {/* Step 4: approved, no card yet */}
            {!loading && provider && holder?.kycStatus === 'APPROVED' && cards !== null && !card && (
              <View>
                <Text style={{ color: colors.text, lineHeight: 20 }}>{copy.verified}</Text>
                {input(nickname, setNickname, copy.cardName, { placeholder: copy.cardNamePlaceholder, maxLength: 40 })}
                {primary(busy === 'issue' ? copy.issuing : copy.issueCard, () => void issue(), busy !== null)}
              </View>
            )}

            {/* Step 5: the card */}
            {!loading && provider && card && panel === 'card' && (
              <View>
                <View style={[styles.visual, { backgroundColor: accentColor }]}>
                  <View style={styles.visualRow}>
                    <View style={styles.visualBrand}>
                      {pollarStyles.logoUrl ? (
                        <Image source={{ uri: pollarStyles.logoUrl }} style={styles.visualLogo} resizeMode="contain" />
                      ) : null}
                      <Text style={styles.visualSmall}>{provider.cardLabel ?? provider.name}</Text>
                    </View>
                    <Text style={styles.visualSmall}>{card.status.toLowerCase()}</Text>
                  </View>
                  <View style={styles.copyRow}>
                    <Text style={styles.visualNumber}>
                      {secrets ? groupPan(secrets.pan) : `**** **** **** ${card.last4 ?? '****'}`}
                    </Text>
                    {secrets && <CardCopyButton value={secrets.pan} label={copy.copyCardNumber} copy={copyText} text={copy} />}
                  </View>
                  <View style={styles.visualRow}>
                    <View style={styles.copyRow}>
                      <Text style={styles.visualSmall}>
                        {copy.expShort} {expiry ?? '--/--'}
                      </Text>
                      {expiry && <CardCopyButton value={expiry} label={copy.copyExpiry} copy={copyText} text={copy} />}
                    </View>
                    <View style={styles.copyRow}>
                      <Text style={styles.visualSmall}>CVC {secrets ? secrets.cvc : '***'}</Text>
                      {secrets && <CardCopyButton value={secrets.cvc} label={copy.copyCvc} copy={copyText} text={copy} />}
                    </View>
                    <Text style={styles.visualSmall}>{card.currency}</Text>
                  </View>
                </View>

                <View style={styles.balanceRow}>
                  {[
                    [copy.available, usd(balance?.spendingPowerCents)],
                    [copy.limit, usd(balance?.creditLimitCents)],
                    [copy.toPay, usd(balance?.balanceDueCents)],
                  ].map(([label, value]) => (
                    <View key={label} style={[styles.balanceCell, { backgroundColor: colors.panel }]}>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>{value}</Text>
                    </View>
                  ))}
                </View>

                {provider.supports.revealSecrets &&
                  (secrets
                    ? secondary(copy.hideDetails, () => setSecrets(null))
                    : secondary(busy === 'reveal' ? copy.loading : copy.showDetails, () => void reveal(), busy !== null))}
                {primary(copy.addFunds, () => void openFund(), busy !== null)}
                {secrets && <Text style={noteStyle}>{copy.detailsHide}</Text>}

                <Text style={[styles.section, { color: colors.muted }]}>{copy.recentActivity}</Text>
                {transactions === null && <Text style={noteStyle}>{copy.loading}</Text>}
                {transactions?.length === 0 && <Text style={noteStyle}>{copy.noMovements}</Text>}
                {transactions?.map((tx) => (
                  <View key={tx.id} style={[styles.txRow, { borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 13 }}>
                        {tx.merchantName ?? copy.txLabels[tx.type] ?? tx.type}
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
                  {copy.fundIntro(provider.fundingAssets.join(` ${copy.or} `) || 'USDC')}
                </Text>
                {fundChains.length > 1 &&
                  choices(COMMONS_COPY[language].network, selectedFundChain, fundChains, (chain) => setFundChain(chain))}
                <AmountField
                  theme={theme}
                  accentColor={accentColor}
                  label={copy.amount}
                  value={fundAmount}
                  onChange={(v) => setFundAmount(v.replace(/[^0-9.]/g, ''))}
                  unit={fundingAsset}
                  available={fundAvailable}
                  placeholder="10"
                  language={language}
                />
                {primary(
                  busy === 'fund-send' ? copy.sending : copy.fundFromWallet,
                  () => void fund(),
                  busy !== null || !(Number(fundAmount) >= 1),
                )}

                {fundings && fundings.length > 0 && (
                  <View>
                    <Text style={[styles.section, { color: colors.muted }]}>{copy.yourFundings}</Text>
                    {fundings.map((f) => {
                      const state = (f.chain === 'SOLANA' ? copy.fundingSolana[f.status] : undefined) ?? copy.funding[f.status];
                      const steps = FUNDING_STEPS[isFundingChain(f.chain) ? f.chain : 'STELLAR'];
                      const step = steps.indexOf(f.status) + 1;
                      const inflight = FUNDING_INFLIGHT.has(f.status);
                      return (
                        <View key={f.id} style={[styles.txRow, { borderTopColor: colors.border }]}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {inflight && <ActivityIndicator size="small" color={accentColor} />}
                              <Text style={{ color: colors.text, fontSize: 13 }}>{state?.title ?? f.status}</Text>
                            </View>
                            {inflight && step > 0 && (
                              <Text style={{ color: colors.muted, fontSize: 11 }} accessibilityLiveRegion="polite">
                                {copy.stepOf(step, steps.length)} ·{' '}
                                {f.error === CREDIT_DELAYED ? copy.fundingProblem.delayed : state?.hint}
                              </Text>
                            )}
                            <Text style={{ color: colors.muted, fontSize: 11 }}>
                              {new Date(f.createdAt).toLocaleString()}
                              {f.status === 'FAILED' ? ` ${fundingProblemText(f.error, copy)}` : ''}
                            </Text>
                          </View>
                          <Text style={{ color: f.status === 'CREDITED' ? '#15803d' : colors.text, fontSize: 13 }}>
                            {money(f.amount, 'USD')}
                          </Text>
                        </View>
                      );
                    })}
                    {fundingsInflight && (
                      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>{copy.canClose}</Text>
                    )}
                  </View>
                )}

                {!showManual && (
                  <TouchableOpacity onPress={() => void showManualAddress()} disabled={busy !== null}>
                    <Text style={{ color: accentColor, textDecorationLine: 'underline', marginTop: 12 }}>
                      {copy.preferOtherWallet} {copy.showDeposit}
                    </Text>
                  </TouchableOpacity>
                )}
                {showManual &&
                  deposit?.map((d) => (
                    <View key={d.network} style={[styles.depositBox, { backgroundColor: colors.panel }]}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>
                        {d.network} ({copy.chain(d.chainId)})
                      </Text>
                      <Text selectable style={{ color: colors.text, fontSize: 12, marginVertical: 6 }}>
                        {d.address}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        {copy.sendOnly(
                          d.tokens.map((t) => (t.currency ?? 'token').toUpperCase()).join(` ${copy.or} `),
                          d.network,
                        )}
                      </Text>
                    </View>
                  ))}
                {showManual && deposit?.length === 0 && <Text style={{ color: colors.error }}>{copy.noDeposit}</Text>}
                {showManual && (
                  <TouchableOpacity onPress={() => setShowManual(false)}>
                    <Text style={{ color: accentColor, textDecorationLine: 'underline', marginTop: 12 }}>
                      {copy.hideDeposit}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {!!error && (
              <Text style={{ color: colors.error, marginTop: 12 }} accessibilityRole="alert">
                {error}
              </Text>
            )}
          </ScrollView>
          <PollarModalFooter language={language} />
        </View>
      </View>
    </View>
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
  visualBrand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  visualLogo: { width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(255, 255, 255, 0.9)' },
  visualSmall: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copyLabel: { color: '#fff', fontSize: 11, fontWeight: '700', textDecorationLine: 'underline' },
  visualNumber: { color: '#fff', fontSize: 20, letterSpacing: 2, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  balanceCell: { flex: 1, borderRadius: 10, padding: 10 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1 },
  depositBox: { borderRadius: 10, padding: 12, marginTop: 10 },
});
