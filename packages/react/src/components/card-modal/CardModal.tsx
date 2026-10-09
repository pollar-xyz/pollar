'use client';

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
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { CopyButton, PollarModalFooter } from '../commons';
import { KycModal } from '../kyc-modal/KycModal';
import { buildModalCssVars, modalChrome } from '../modal-theme';
import { ProviderRegistrationModal } from '../provider-registration-modal/ProviderRegistrationModal';
import { RegistryCheckModal } from '../registry-check-modal/RegistryCheckModal';
import { RequirementFormModal } from '../requirement-form-modal/RequirementFormModal';
import { blockedStepMessage, cardStage, pendingFromRequirement, requiredCardStep, type PendingCardStep } from './card-kyc';
import '../shared.css';
import '../send-modal/SendModal.css';
import './CardModal.css';

interface CardModalProps {
  onClose: () => void;
}

/** How often the holder is re-read while the provider's identity verification is pending. */
const KYC_POLL_MS = 5000;
/** How long the revealed number stays on screen. */
const REVEAL_MS = 30_000;
const TX_LIMIT = 10;
/** How often fundings in flight are re-read while the funding panel is open. */
const FUNDING_POLL_MS = 5_000;
const FUNDING_INFLIGHT = new Set(['CREATED', 'BURNED', 'ATTESTED', 'MINTED']);

/** What each funding state means to the user: a title, and for one in flight its step and what it waits on. */
const FUNDING_COPY: Record<string, { title: string; step?: number; hint?: string }> = {
  CREATED: {
    title: 'Confirming your payment',
    step: 1,
    hint: 'Your USDC payment is being confirmed on Stellar. This takes a few seconds.',
  },
  BURNED: {
    title: 'Sending it to the card network',
    step: 2,
    hint: 'Your USDC left Stellar. Circle is confirming the transfer, usually in about a minute.',
  },
  ATTESTED: {
    title: 'Crossing to the card network',
    step: 3,
    hint: 'Transfer confirmed. Delivering the USDC to the card network.',
  },
  MINTED: {
    title: 'Arrived, crediting your card',
    step: 4,
    hint: 'The USDC reached the card provider, which is adding it to your card. This can take a few minutes.',
  },
  CREDITED: { title: 'Credited to your card' },
  FAILED: { title: 'Failed' },
};
const FUNDING_STEPS = 4;

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
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function money(amount: string, currency: string): string {
  const n = Number(amount);
  try {
    return n.toLocaleString('en-US', { style: 'currency', currency });
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function groupPan(pan: string): string {
  return pan
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/** The provider's own words when it rejected something; our code otherwise. */
/** Errors whose cause the user can act on, said plainly instead of the provider's raw message. */
const CARD_ERROR_COPY: Record<string, string> = {
  SDK_CARDS_PROVIDER_ERROR: 'The card provider is not responding right now. Please try again in a few minutes.',
  SDK_CARDS_IP_NOT_SUPPORTED:
    'The card provider cannot accept your current connection (IPv6). Please try again from another network, for example Wi-Fi.',
};

function errorText(e: unknown, fallback: string): string {
  if (isPollarApiError(e)) {
    const known = CARD_ERROR_COPY[e.code];
    if (known) return known;
    const providerMessage = e.body.providerMessage;
    if (typeof providerMessage === 'string' && providerMessage) return providerMessage;
    const message = e.body.message;
    if (typeof message === 'string' && message) return message;
    return e.code;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

export function CardModal({ onClose }: CardModalProps) {
  const { getClient, styles, wallet } = usePollar();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);

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

  const provider = providers?.[0] ?? null;
  const card = cards?.[0] ?? null;

  // --- Loading ----------------------------------------------------------------
  const loadHolder = useCallback(async () => {
    const h = await getClient().getCardHolder();
    setHolder(h);
    return h;
  }, [getClient]);

  /** The platform's steps for the provider. Null for a provider without any, and for a server without the route. */
  const loadRequirements = useCallback(
    async (cardProviderId: string) => {
      try {
        const r = await getClient().getCardRequirements({ cardProviderId });
        setRequirements(r);
        return r;
      } catch {
        setRequirements(null);
        return null;
      }
    },
    [getClient],
  );

  const loadCardData = useCallback(async () => {
    const client = getClient();
    const list = await client.getCards();
    if (list.length === 0) {
      setCards(list);
      return;
    }
    // The card, its balance and its movements land together: no card shown with an empty balance first.
    const [b, tx] = await Promise.all([client.getCardBalance(), client.getCardTransactions({ limit: TX_LIMIT })]);
    setBalance(b);
    setTransactions(tx.transactions);
    setCards(list);
  }, [getClient]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ps = await getClient().getCardProviders();
        if (cancelled) return;
        setProviders(ps);
        if (ps.length === 0) return;
        const [h] = await Promise.all([loadHolder(), loadRequirements(ps[0]!.id)]);
        if (cancelled) return;
        if (h?.kycStatus === 'APPROVED') await loadCardData();
      } catch (e) {
        if (!cancelled) {
          setProviders((cur) => cur ?? []);
          setError(errorText(e, 'Could not load your card'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getClient, loadHolder, loadRequirements, loadCardData]);

  const stage = cardStage(holder, requirements);

  // Prefill the provider's own KYC form from the session profile when it is the next step.
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
      .then(setOccupations)
      .catch(() => setOccupations([]));
  }, [stage, getClient]);

  // The provider's verification in progress: re-read the holder until it settles.
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

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );

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
      // A step the platform asks for opens in place of the modal; anything else is shown.
      const step = requiredCardStep(e);
      if (step) openStep(step);
      else setError(errorText(e, fallback));
    } finally {
      setBusy(null);
    }
  }

  /** After a step: re-read where the user stands and, when the provider registered them, their holder. */
  async function afterStep() {
    if (!provider) return;
    const [h, r] = await Promise.all([loadHolder(), loadRequirements(provider.id)]);
    if (h?.kycStatus === 'APPROVED') await loadCardData();
    if (r?.next && !blockedStepMessage(r.next)) openStep(pendingFromRequirement(provider.id, r.next));
  }

  /** The user's first move: the next platform step when one is pending, else the provider sign-up. */
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
        setHolder(await getClient().createCardHolder());
      },
      'Could not start your card application',
    );

  const sendKyc = () =>
    run(
      'kyc',
      async () => {
        const address = { ...kyc.address };
        if (!address.line2) delete address.line2;
        setHolder(await getClient().submitCardKyc({ termsAccepted: terms, kyc: { ...kyc, address } }));
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

  const refresh = () =>
    run(
      'refresh',
      async () => {
        await loadCardData();
      },
      'Could not refresh your card',
    );

  const reveal = () =>
    run(
      'reveal',
      async () => {
        if (!card) return;
        const s = await getClient().revealCardSecrets(card.id);
        setSecrets(s);
        if (revealTimer.current) clearTimeout(revealTimer.current);
        revealTimer.current = setTimeout(() => setSecrets(null), REVEAL_MS);
      },
      'Could not show the card details',
    );

  const openFund = () =>
    run(
      'fund',
      async () => {
        setFundings(await getClient().listCardFundings());
        setPanel('fund');
      },
      'Could not load your fundings',
    );

  const fund = () =>
    run(
      'fund-send',
      async () => {
        const outcome = await getClient().fundCard({ amount: fundAmount.trim() });
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
        if (!deposit) setDeposit(await getClient().getCardDepositAddresses());
        setShowManual(true);
      },
      'Could not load the deposit address',
    );

  // Fundings move on their own server-side; keep the panel honest while any is in flight.
  const fundingsInflight = (fundings ?? []).some((f) => FUNDING_INFLIGHT.has(f.status));
  useEffect(() => {
    if (panel !== 'fund' || !fundingsInflight) return;
    const id = setInterval(() => {
      getClient()
        .listCardFundings()
        .then((next) => {
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

  const field = (
    key: keyof Omit<CardKycInput, 'address' | 'email'>,
    label: string,
    extra: Partial<JSX.IntrinsicElements['input']> = {},
  ) => (
    <label className="pollar-send-field">
      <span className="pollar-send-label">{label}</span>
      <input
        className="pollar-input"
        value={kyc[key] as string}
        onChange={(e) => setKyc((k) => ({ ...k, [key]: e.target.value }))}
        {...extra}
      />
    </label>
  );

  const addressField = (
    key: keyof CardKycInput['address'],
    label: string,
    extra: Partial<JSX.IntrinsicElements['input']> = {},
  ) => (
    <label className="pollar-send-field">
      <span className="pollar-send-label">{label}</span>
      <input
        className="pollar-input"
        value={kyc.address[key] ?? ''}
        onChange={(e) => setKyc((k) => ({ ...k, address: { ...k.address, [key]: e.target.value } }))}
        {...extra}
      />
    </label>
  );

  const rangeField = (key: 'annualSalary' | 'expectedMonthlyVolume', label: string) => (
    <label className="pollar-send-field">
      <span className="pollar-send-label">{label}</span>
      <select
        className="pollar-input pollar-send-select"
        value={kyc[key]}
        onChange={(e) => setKyc((k) => ({ ...k, [key]: e.target.value as CardIncomeRange }))}
      >
        {INCOME_RANGES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );

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
  // The modal's state stays while a step is open, so cancelling returns to the same screen.
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
    const progress = pendingStep.progress ? { progress: pendingStep.progress } : {};
    if (pendingStep.type === 'FORM') {
      return <RequirementFormModal formId={pendingStep.optionId} {...progress} onClose={close} onSubmitted={done} />;
    }
    if (pendingStep.type === 'REGISTRY_CHECK') {
      return <RegistryCheckModal optionId={pendingStep.optionId} {...progress} onClose={close} onApproved={done} />;
    }
    if (pendingStep.type === 'PROVIDER_REGISTRATION') {
      return (
        <ProviderRegistrationModal
          cardProviderId={pendingStep.cardProviderId}
          {...progress}
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
  const blocked = requirements?.next ? blockedStepMessage(requirements.next) : null;
  const stepsPending = !!requirements?.next;
  const title = panel === 'fund' ? 'Add funds' : card ? (card.nickname ?? 'Your card') : 'Get a card';

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={onClose}>
      <div
        className="pollar-modal-card pollar-card-modal"
        data-theme={theme}
        style={cssVars}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pollar-modal-header">
          <div className="pollar-send-header-left">
            {panel === 'fund' && (
              <button type="button" className="pollar-modal-close" onClick={() => setPanel('card')} aria-label="Back">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <h2 className="pollar-modal-title">{title}</h2>
          </div>
          <div className="pollar-modal-header-actions">
            {card && panel === 'card' && (
              <button
                type="button"
                className="pollar-modal-close"
                onClick={() => void refresh()}
                disabled={busy !== null}
                aria-label="Refresh"
              >
                <svg
                  className={busy === 'refresh' ? 'pollar-modal-refresh-icon pollar-spinning' : 'pollar-modal-refresh-icon'}
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
            )}
            <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {loading && (
          <div className="pollar-loading-block">
            <div className="pollar-spinner" />
          </div>
        )}

        {!loading && providers?.length === 0 && <div className="pollar-modal-error">Cards are not available for this app.</div>}
        {!loading && provider && !provider.available && (
          <div className="pollar-modal-error">Cards are not available right now.</div>
        )}

        {/* Step 1: the platform's steps, then the provider sign-up */}
        {!loading && provider && provider.available && stage === 'steps' && (
          <>
            <p>
              Get {provider.cardLabel ?? `a ${provider.name} card`} funded from your wallet{wallet ? '' : ' once you sign in'}.
              You will verify your identity first; it takes a few minutes.
            </p>
            {requirements && requirements.total > 0 && (
              <p className="pollar-card-note">
                {requirements.completed} of {requirements.total} steps done
              </p>
            )}
            {blocked && <div className="pollar-modal-error">{blocked}</div>}
            <div className="pollar-modal-actions">
              <button
                type="button"
                className="pollar-btn-primary"
                onClick={() => void start()}
                disabled={busy !== null || !wallet || !!blocked}
              >
                {busy === 'start' ? 'Starting...' : stepsPending ? 'Continue' : 'Start'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: the provider's own KYC form, when no PROVIDER_REGISTRATION step sends it for the user */}
        {!loading && provider && stage === 'provider-form' && (
          <>
            <p className="pollar-card-section-title">About you</p>
            <div className="pollar-card-grid">
              {field('firstName', 'First name', { autoComplete: 'given-name' })}
              {field('lastName', 'Last name', { autoComplete: 'family-name' })}
              {field('birthDate', 'Birth date', { placeholder: 'YYYY-MM-DD', autoComplete: 'bday' })}
              {field('nationalId', 'ID number')}
              {field('countryOfIssue', 'ID country (2 letters)', { maxLength: 2, placeholder: 'AR' })}
              <label className="pollar-send-field">
                <span className="pollar-send-label">Occupation</span>
                <select
                  className="pollar-input pollar-send-select"
                  value={kyc.occupation}
                  onChange={(e) => setKyc((k) => ({ ...k, occupation: e.target.value }))}
                >
                  <option value="">Select...</option>
                  {occupations.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {field('phoneCountryCode', 'Phone country code', { placeholder: '54', inputMode: 'numeric' })}
              {field('phoneNumber', 'Phone number', { placeholder: '91155551234', inputMode: 'numeric' })}
              {rangeField('annualSalary', 'Annual income')}
              {rangeField('expectedMonthlyVolume', 'Expected monthly spend')}
              <div className="pollar-card-grid-full">{field('accountPurpose', 'What will you use the card for?')}</div>
            </div>

            <p className="pollar-card-section-title">Address</p>
            <div className="pollar-card-grid">
              <div className="pollar-card-grid-full">
                {addressField('line1', 'Street and number', { autoComplete: 'address-line1' })}
              </div>
              <div className="pollar-card-grid-full">
                {addressField('line2', 'Apartment, floor (optional)', { autoComplete: 'address-line2' })}
              </div>
              {addressField('city', 'City', { autoComplete: 'address-level2' })}
              {addressField('region', 'State or province', { autoComplete: 'address-level1' })}
              {addressField('postalCode', 'Postal code', { autoComplete: 'postal-code' })}
              {addressField('countryCode', 'Country (2 letters)', { maxLength: 2, placeholder: 'AR' })}
            </div>

            <label className="pollar-card-terms">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>
                I have read and accept the{' '}
                <a className="pollar-card-link" href={provider.termsUrl ?? '#'} target="_blank" rel="noreferrer">
                  {provider.name} terms of service
                </a>
                {provider.termsUrl ? '' : ' (demo: the final terms link is pending)'}.
              </span>
            </label>

            <div className="pollar-modal-actions">
              <button
                type="button"
                className="pollar-btn-primary"
                onClick={() => void sendKyc()}
                disabled={busy !== null || !terms || !kycComplete}
              >
                {busy === 'kyc' ? 'Sending...' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {/* Step 3: the provider's verification pending */}
        {!loading && holder && holder.kycStatus in KYC_PENDING_COPY && (
          <>
            <p>{KYC_PENDING_COPY[holder.kycStatus]}</p>
            {holder.kycReason && <p className="pollar-card-note">{holder.kycReason}</p>}
            <div className="pollar-modal-actions">
              {holder.verificationLink && (
                <a className="pollar-btn-primary" href={holder.verificationLink} target="_blank" rel="noreferrer">
                  Verify my identity
                </a>
              )}
              <button type="button" className="pollar-btn-secondary" onClick={() => void loadHolder().catch(() => {})}>
                I am done
              </button>
            </div>
            <p className="pollar-card-note">This screen updates on its own once the verification comes back.</p>
          </>
        )}

        {/* Terminal failures */}
        {!loading && holder && holder.kycStatus in KYC_FINAL_COPY && (
          <div className="pollar-modal-error">
            {KYC_FINAL_COPY[holder.kycStatus]}
            {holder.kycReason ? ` ${holder.kycReason}` : ''}
          </div>
        )}

        {/* Step 4: approved, no card yet */}
        {!loading && provider && holder?.kycStatus === 'APPROVED' && cards !== null && !card && (
          <>
            <p>Your identity is verified. Issue your virtual card to start.</p>
            <label className="pollar-send-field">
              <span className="pollar-send-label">Card name (optional)</span>
              <input
                className="pollar-input"
                value={nickname}
                maxLength={40}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Everyday card"
              />
            </label>
            <div className="pollar-modal-actions">
              <button type="button" className="pollar-btn-primary" onClick={() => void issue()} disabled={busy !== null}>
                {busy === 'issue' ? 'Issuing...' : 'Issue my card'}
              </button>
            </div>
          </>
        )}

        {/* Step 5: the card */}
        {!loading && provider && card && panel === 'card' && (
          <>
            <div className="pollar-card-visual">
              <div className="pollar-card-visual-top">
                <span className="pollar-card-brand">
                  {styles.logoUrl && <img src={styles.logoUrl} alt="" className="pollar-card-brand-logo" />}
                  <span>{provider.cardLabel ?? provider.name}</span>
                </span>
                <span className="pollar-card-status">{card.status.toLowerCase()}</span>
              </div>
              <div className="pollar-card-visual-chip" />
              <div className="pollar-card-visual-number">
                {secrets ? groupPan(secrets.pan) : `•••• •••• •••• ${card.last4 ?? '••••'}`}
              </div>
              <div className="pollar-card-visual-bottom">
                <div>
                  <span>Expires</span>
                  <strong>{card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear.slice(-2)}` : '--/--'}</strong>
                </div>
                <div>
                  <span>CVC</span>
                  <strong>{secrets ? secrets.cvc : '•••'}</strong>
                </div>
                <div>
                  <span>{card.type.toLowerCase()}</span>
                  <strong>{card.currency}</strong>
                </div>
              </div>
            </div>

            <div className="pollar-card-balance">
              <div>
                <span>Available</span>
                <strong>{usd(balance?.spendingPowerCents)}</strong>
              </div>
              <div>
                <span>Limit</span>
                <strong>{usd(balance?.creditLimitCents)}</strong>
              </div>
              <div>
                <span>To pay</span>
                <strong>{usd(balance?.balanceDueCents)}</strong>
              </div>
            </div>

            <div className="pollar-modal-actions">
              {provider.supports.revealSecrets &&
                (secrets ? (
                  <button type="button" className="pollar-btn-secondary" onClick={() => setSecrets(null)}>
                    Hide details
                  </button>
                ) : (
                  <button type="button" className="pollar-btn-secondary" onClick={() => void reveal()} disabled={busy !== null}>
                    {busy === 'reveal' ? 'Loading...' : 'Show details'}
                  </button>
                ))}
              <button type="button" className="pollar-btn-primary" onClick={() => void openFund()} disabled={busy !== null}>
                Add funds
              </button>
            </div>
            {secrets && <p className="pollar-card-note">The details hide on their own in 30 seconds. Do not share them.</p>}

            <p className="pollar-card-section-title">Recent activity</p>
            {transactions === null && <p className="pollar-card-note">Loading...</p>}
            {transactions?.length === 0 && <p className="pollar-card-note">No movements yet.</p>}
            {transactions?.map((tx) => {
              const purchase = tx.purchase as {
                localAmount?: number | null;
                localCurrency?: string | null;
                status?: string;
              } | null;
              const local =
                purchase?.localAmount && purchase.localCurrency && purchase.localCurrency !== 'USD'
                  ? money(String(purchase.localAmount), purchase.localCurrency)
                  : null;
              return (
                <div key={tx.id} className="pollar-card-tx">
                  <div>
                    {tx.merchantName ?? TX_LABELS[tx.type] ?? tx.type}
                    <span className="pollar-card-tx-meta">
                      {new Date(tx.occurredAt).toLocaleDateString()}
                      {tx.merchantName ? ` · ${TX_LABELS[tx.type] ?? tx.type}` : ''}
                      {purchase?.status && purchase.status !== 'completed' ? ` · ${purchase.status}` : ''}
                    </span>
                  </div>
                  <div className="pollar-card-tx-amount" data-direction={tx.direction ?? undefined}>
                    {tx.direction === 'credit' ? '+' : tx.direction === 'debit' ? '-' : ''}
                    {money(tx.amount, tx.currency)}
                    {local && <span className="pollar-card-tx-meta">{local}</span>}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Funding */}
        {!loading && provider && card && panel === 'fund' && (
          <>
            <p>
              Move {provider.fundingAssets.join(' or ') || 'USDC'} from your wallet to your card. It takes a few minutes to
              cross to the card network.
            </p>
            <label className="pollar-send-field">
              <span className="pollar-send-label">Amount (USDC)</span>
              <input
                className="pollar-input"
                inputMode="decimal"
                placeholder="10"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              />
            </label>
            <div className="pollar-modal-actions">
              <button
                type="button"
                className="pollar-btn-primary"
                onClick={() => void fund()}
                disabled={busy !== null || !(Number(fundAmount) >= 1)}
              >
                {busy === 'fund-send' ? 'Sending...' : 'Fund from my wallet'}
              </button>
            </div>

            {fundings && fundings.length > 0 && (
              <>
                <p className="pollar-card-section-title">Your fundings</p>
                {fundings.map((f) => {
                  const copy = FUNDING_COPY[f.status];
                  const inflight = FUNDING_INFLIGHT.has(f.status);
                  return (
                    <div key={f.id} className="pollar-card-tx" aria-busy={inflight}>
                      <div>
                        <span className="pollar-card-funding-title">
                          {inflight && <span className="pollar-spinner pollar-spinner-sm" aria-hidden />}
                          {copy?.title ?? f.status}
                        </span>
                        {inflight && copy?.step && (
                          <span className="pollar-card-tx-meta" role="status">
                            Step {copy.step} of {FUNDING_STEPS} · {copy.hint}
                          </span>
                        )}
                        <span className="pollar-card-tx-meta">
                          {new Date(f.createdAt).toLocaleString()}
                          {f.status === 'FAILED' && f.error ? ` · ${f.error}` : ''}
                        </span>
                      </div>
                      <div className="pollar-card-tx-amount" data-direction={f.status === 'CREDITED' ? 'credit' : undefined}>
                        {money(f.amount, 'USD')}
                      </div>
                    </div>
                  );
                })}
                {fundingsInflight && (
                  <p className="pollar-card-note">
                    You can close this window: the funding keeps going and your card is credited when it finishes.
                  </p>
                )}
              </>
            )}

            {!showManual && (
              <p className="pollar-card-note">
                Prefer to send from another wallet?{' '}
                <button
                  type="button"
                  className="pollar-card-link"
                  onClick={() => void showManualAddress()}
                  disabled={busy !== null}
                >
                  Show the deposit address
                </button>
              </p>
            )}
            {showManual &&
              deposit?.map((d) => (
                <div key={d.network} className="pollar-card-deposit">
                  <strong>{d.network}</strong> (chain {d.chainId})<code>{d.address}</code>
                  <CopyButton value={d.address} label="Copy address" />
                  <p className="pollar-card-note">
                    Send only {d.tokens.map((t) => (t.currency ?? 'token').toUpperCase()).join(' or ')} on {d.network}; anything
                    else can be lost.
                  </p>
                </div>
              ))}
            {showManual && deposit?.length === 0 && (
              <div className="pollar-modal-error">The provider returned no deposit address.</div>
            )}
            {showManual && (
              <p className="pollar-card-note">
                <button type="button" className="pollar-card-link" onClick={() => setShowManual(false)}>
                  Hide the deposit address
                </button>
              </p>
            )}
          </>
        )}

        {error && <div className="pollar-modal-error">{error}</div>}

        <PollarModalFooter />
      </div>
    </div>
  );
}
