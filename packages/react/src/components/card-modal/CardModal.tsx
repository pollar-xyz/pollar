'use client';

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
  type PollarLanguage,
} from '@pollar/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { useChains } from '../../useChains';
import { useWalletAvailable } from '../../useWalletAvailable';
import { AmountField } from '../AmountField';
import { ChainSelect } from '../ChainSelect';
import { CopyButton, PollarModalFooter } from '../commons';
import { KycModal } from '../kyc-modal/KycModal';
import { buildModalCssVars, modalChrome } from '../modal-theme';
import { ProviderRegistrationModal } from '../provider-registration-modal/ProviderRegistrationModal';
import { RegistryCheckModal } from '../registry-check-modal/RegistryCheckModal';
import { RequirementFormModal } from '../requirement-form-modal/RequirementFormModal';
import { CARD_COPY, type CardCopy } from './card-copy';
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
/** The chains a card can be funded from. */
const FUNDING_CHAINS: readonly CardFundingChain[] = ['STELLAR', 'SOLANA'];
const isFundingChain = (chain: string): chain is CardFundingChain => (FUNDING_CHAINS as readonly string[]).includes(chain);

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

function usd(cents: number | null | undefined, language: PollarLanguage): string {
  if (cents === null || cents === undefined) return '-';
  return (cents / 100).toLocaleString(language, { style: 'currency', currency: 'USD' });
}

function money(amount: string, currency: string, language: PollarLanguage): string {
  const n = Number(amount);
  try {
    return n.toLocaleString(language, { style: 'currency', currency });
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
function errorText(e: unknown, fallback: string, copy: CardCopy): string {
  if (isPollarApiError(e)) {
    const known = copy.errors[e.code];
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
  const language = useModalLanguage();
  const copy = CARD_COPY[language];
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
  // One key per funding the user means to make: a double click or a retry after
  // a lost response gets that funding back instead of paying twice.
  const fundKey = useRef<string | null>(null);
  const [fundChain, setFundChain] = useState<CardFundingChain | null>(null);
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
  const fundingAsset = provider?.fundingAssets[0] ?? 'USDC';
  // The chains the user holds a wallet on that a card can be funded from, in the app's order.
  const fundChains = useChains().chains.filter(isFundingChain);
  const selectedFundChain = fundChain ?? fundChains[0] ?? 'STELLAR';
  const fundAvailable = useWalletAvailable(panel === 'fund' ? { chain: selectedFundChain, code: fundingAsset } : null);
  const card = cards?.[0] ?? null;
  const expiry = card?.expMonth && card.expYear ? `${card.expMonth}/${card.expYear.slice(-2)}` : null;

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
          setError(errorText(e, copy.failed.load, copy));
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
      else setError(errorText(e, fallback, copy));
    } finally {
      setBusy(null);
    }
  }

  /** After a step: re-read where the user stands and, when the provider registered them, their holder. */
  async function afterStep() {
    if (!provider) return;
    const [h, r] = await Promise.all([loadHolder(), loadRequirements(provider.id)]);
    if (h?.kycStatus === 'APPROVED') await loadCardData();
    if (r?.next && !blockedStepMessage(r.next, copy.blocked)) openStep(pendingFromRequirement(provider.id, r.next));
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
      copy.failed.start,
    );

  const sendKyc = () =>
    run(
      'kyc',
      async () => {
        const address = { ...kyc.address };
        if (!address.line2) delete address.line2;
        setHolder(await getClient().submitCardKyc({ termsAccepted: terms, kyc: { ...kyc, address } }));
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

  const refresh = () =>
    run(
      'refresh',
      async () => {
        await loadCardData();
      },
      copy.failed.refresh,
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
      copy.failed.reveal,
    );

  const openFund = () =>
    run(
      'fund',
      async () => {
        setFundings(await getClient().listCardFundings());
        setPanel('fund');
      },
      copy.failed.loadFundings,
    );

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
        if (outcome.status === 'cancelled') {
          setError(copy.notSigned);
          return;
        }
        setFundings((cur) => [outcome.funding, ...(cur ?? []).filter((f) => f.id !== outcome.funding.id)]);
        setFundAmount('');
      },
      copy.failed.fund,
    );

  const showManualAddress = () =>
    run(
      'fund-manual',
      async () => {
        if (!deposit) setDeposit(await getClient().getCardDepositAddresses());
        setShowManual(true);
      },
      copy.failed.loadDeposit,
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
        {INCOME_RANGES.map((range) => (
          <option key={range} value={range}>
            {copy.incomeRanges[range]}
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
  const blocked = requirements?.next ? blockedStepMessage(requirements.next, copy.blocked) : null;
  const stepsPending = !!requirements?.next;
  const title = panel === 'fund' ? copy.title.addFunds : card ? (card.nickname ?? copy.title.yourCard) : copy.title.getCard;

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
              <button type="button" className="pollar-modal-close" onClick={() => setPanel('card')} aria-label={copy.back}>
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
                aria-label={copy.refresh}
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
            <button type="button" className="pollar-modal-close" onClick={onClose} aria-label={copy.close}>
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

        {!loading && providers?.length === 0 && <div className="pollar-modal-error">{copy.unavailableForApp}</div>}
        {!loading && provider && !provider.available && <div className="pollar-modal-error">{copy.unavailableNow}</div>}

        {/* Step 1: the platform's steps, then the provider sign-up */}
        {!loading && provider && provider.available && stage === 'steps' && (
          <>
            <p>{copy.intro(provider.cardLabel ?? copy.defaultCardName(provider.name), !!wallet)}</p>
            {requirements && requirements.total > 0 && (
              <p className="pollar-card-note">{copy.stepsDone(requirements.completed, requirements.total)}</p>
            )}
            {blocked && <div className="pollar-modal-error">{blocked}</div>}
            <div className="pollar-modal-actions">
              <button
                type="button"
                className="pollar-btn-primary"
                onClick={() => void start()}
                disabled={busy !== null || !wallet || !!blocked}
              >
                {busy === 'start' ? copy.starting : stepsPending ? copy.continue : copy.start}
              </button>
            </div>
          </>
        )}

        {/* Step 2: the provider's own KYC form, when no PROVIDER_REGISTRATION step sends it for the user */}
        {!loading && provider && stage === 'provider-form' && (
          <>
            <p className="pollar-card-section-title">{copy.aboutYou}</p>
            <div className="pollar-card-grid">
              {field('firstName', copy.firstName, { autoComplete: 'given-name' })}
              {field('lastName', copy.lastName, { autoComplete: 'family-name' })}
              {field('birthDate', copy.birthDate, { placeholder: copy.datePlaceholder, autoComplete: 'bday' })}
              {field('nationalId', copy.nationalId)}
              {field('countryOfIssue', copy.idCountry, { maxLength: 2, placeholder: 'AR' })}
              <label className="pollar-send-field">
                <span className="pollar-send-label">{copy.occupation}</span>
                <select
                  className="pollar-input pollar-send-select"
                  value={kyc.occupation}
                  onChange={(e) => setKyc((k) => ({ ...k, occupation: e.target.value }))}
                >
                  <option value="">{copy.selectOccupation}</option>
                  {occupations.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {field('phoneCountryCode', copy.phoneCountryCode, { placeholder: '54', inputMode: 'numeric' })}
              {field('phoneNumber', copy.phoneNumber, { placeholder: '91155551234', inputMode: 'numeric' })}
              {rangeField('annualSalary', copy.annualIncome)}
              {rangeField('expectedMonthlyVolume', copy.monthlySpend)}
              <div className="pollar-card-grid-full">{field('accountPurpose', copy.accountPurpose)}</div>
            </div>

            <p className="pollar-card-section-title">{copy.address}</p>
            <div className="pollar-card-grid">
              <div className="pollar-card-grid-full">
                {addressField('line1', copy.line1, { autoComplete: 'address-line1' })}
              </div>
              <div className="pollar-card-grid-full">
                {addressField('line2', copy.line2, { autoComplete: 'address-line2' })}
              </div>
              {addressField('city', copy.city, { autoComplete: 'address-level2' })}
              {addressField('region', copy.region, { autoComplete: 'address-level1' })}
              {addressField('postalCode', copy.postalCode, { autoComplete: 'postal-code' })}
              {addressField('countryCode', copy.country, { maxLength: 2, placeholder: 'AR' })}
            </div>

            <label className="pollar-card-terms">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>
                {copy.termsPrefix}
                <a className="pollar-card-link" href={provider.termsUrl ?? '#'} target="_blank" rel="noreferrer">
                  {copy.termsLink(provider.name)}
                </a>
                {provider.termsUrl ? '' : copy.termsPending}.
              </span>
            </label>

            <div className="pollar-modal-actions">
              <button
                type="button"
                className="pollar-btn-primary"
                onClick={() => void sendKyc()}
                disabled={busy !== null || !terms || !kycComplete}
              >
                {busy === 'kyc' ? copy.sending : copy.continue}
              </button>
            </div>
          </>
        )}

        {/* Step 3: the provider's verification pending */}
        {!loading && holder && KYC_PENDING.has(holder.kycStatus) && (
          <>
            <p>{copy.kycPending[holder.kycStatus]}</p>
            {holder.kycReason && <p className="pollar-card-note">{holder.kycReason}</p>}
            <div className="pollar-modal-actions">
              {holder.verificationLink && (
                <a className="pollar-btn-primary" href={holder.verificationLink} target="_blank" rel="noreferrer">
                  {copy.verifyIdentity}
                </a>
              )}
              <button type="button" className="pollar-btn-secondary" onClick={() => void loadHolder().catch(() => {})}>
                {copy.done}
              </button>
            </div>
            <p className="pollar-card-note">{copy.autoUpdate}</p>
          </>
        )}

        {/* Terminal failures */}
        {!loading && holder && KYC_FINAL.has(holder.kycStatus) && (
          <div className="pollar-modal-error">
            {copy.kycFinal[holder.kycStatus]}
            {holder.kycReason ? ` ${holder.kycReason}` : ''}
          </div>
        )}

        {/* Step 4: approved, no card yet */}
        {!loading && provider && holder?.kycStatus === 'APPROVED' && cards !== null && !card && (
          <>
            <p>{copy.verified}</p>
            <label className="pollar-send-field">
              <span className="pollar-send-label">{copy.cardName}</span>
              <input
                className="pollar-input"
                value={nickname}
                maxLength={40}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={copy.cardNamePlaceholder}
              />
            </label>
            <div className="pollar-modal-actions">
              <button type="button" className="pollar-btn-primary" onClick={() => void issue()} disabled={busy !== null}>
                {busy === 'issue' ? copy.issuing : copy.issueCard}
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
              <div className="pollar-card-visual-number pollar-card-copy-row">
                {secrets ? groupPan(secrets.pan) : `•••• •••• •••• ${card.last4 ?? '••••'}`}
                {secrets && (
                  <CopyButton
                    value={secrets.pan}
                    label={copy.copyCardNumber}
                    className="pollar-copy-btn-sm pollar-card-copy"
                    language={language}
                  />
                )}
              </div>
              <div className="pollar-card-visual-bottom">
                <div>
                  <span>{copy.expires}</span>
                  <div className="pollar-card-copy-row">
                    <strong>{expiry ?? '--/--'}</strong>
                    {expiry && (
                      <CopyButton
                        value={expiry}
                        label={copy.copyExpiry}
                        className="pollar-copy-btn-sm pollar-card-copy"
                        language={language}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <span>CVC</span>
                  <div className="pollar-card-copy-row">
                    <strong>{secrets ? secrets.cvc : '•••'}</strong>
                    {secrets && (
                      <CopyButton
                        value={secrets.cvc}
                        label={copy.copyCvc}
                        className="pollar-copy-btn-sm pollar-card-copy"
                        language={language}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <span>{card.type.toLowerCase()}</span>
                  <strong>{card.currency}</strong>
                </div>
              </div>
            </div>

            <div className="pollar-card-balance">
              <div>
                <span>{copy.available}</span>
                <strong>{usd(balance?.spendingPowerCents, language)}</strong>
              </div>
              <div>
                <span>{copy.limit}</span>
                <strong>{usd(balance?.creditLimitCents, language)}</strong>
              </div>
              <div>
                <span>{copy.toPay}</span>
                <strong>{usd(balance?.balanceDueCents, language)}</strong>
              </div>
            </div>

            <div className="pollar-modal-actions">
              {provider.supports.revealSecrets &&
                (secrets ? (
                  <button type="button" className="pollar-btn-secondary" onClick={() => setSecrets(null)}>
                    {copy.hideDetails}
                  </button>
                ) : (
                  <button type="button" className="pollar-btn-secondary" onClick={() => void reveal()} disabled={busy !== null}>
                    {busy === 'reveal' ? copy.loading : copy.showDetails}
                  </button>
                ))}
              <button type="button" className="pollar-btn-primary" onClick={() => void openFund()} disabled={busy !== null}>
                {copy.addFunds}
              </button>
            </div>
            {secrets && <p className="pollar-card-note">{copy.detailsHide}</p>}

            <p className="pollar-card-section-title">{copy.recentActivity}</p>
            {transactions === null && <p className="pollar-card-note">{copy.loading}</p>}
            {transactions?.length === 0 && <p className="pollar-card-note">{copy.noMovements}</p>}
            {transactions?.map((tx) => {
              // `purchase` is the provider's own record, passed through as is.
              const localAmount = typeof tx.purchase?.localAmount === 'number' ? tx.purchase.localAmount : null;
              const localCurrency = typeof tx.purchase?.localCurrency === 'string' ? tx.purchase.localCurrency : null;
              const purchaseStatus = typeof tx.purchase?.status === 'string' ? tx.purchase.status : null;
              const local =
                localAmount && localCurrency && localCurrency !== 'USD'
                  ? money(String(localAmount), localCurrency, language)
                  : null;
              return (
                <div key={tx.id} className="pollar-card-tx">
                  <div>
                    {tx.merchantName ?? copy.txLabels[tx.type] ?? tx.type}
                    <span className="pollar-card-tx-meta">
                      {new Date(tx.occurredAt).toLocaleDateString()}
                      {tx.merchantName ? ` · ${copy.txLabels[tx.type] ?? tx.type}` : ''}
                      {purchaseStatus && purchaseStatus !== 'completed' ? ` · ${purchaseStatus}` : ''}
                    </span>
                  </div>
                  <div className="pollar-card-tx-amount" data-direction={tx.direction ?? undefined}>
                    {tx.direction === 'credit' ? '+' : tx.direction === 'debit' ? '-' : ''}
                    {money(tx.amount, tx.currency, language)}
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
            <p>{copy.fundIntro(provider.fundingAssets.join(` ${copy.or} `) || 'USDC')}</p>
            <ChainSelect
              value={selectedFundChain}
              options={fundChains}
              onChange={(chain) => setFundChain(chain as CardFundingChain)}
              disabled={busy !== null}
              language={language}
            />
            <AmountField
              id="pollar-card-fund-amount"
              label={copy.amount}
              value={fundAmount}
              onChange={(value) => setFundAmount(value.replace(/[^0-9.]/g, ''))}
              unit={fundingAsset}
              available={fundAvailable}
              placeholder="10"
              language={language}
            />
            <div className="pollar-modal-actions">
              <button
                type="button"
                className="pollar-btn-primary"
                onClick={() => void fund()}
                disabled={busy !== null || !(Number(fundAmount) >= 1)}
              >
                {busy === 'fund-send' ? copy.sending : copy.fundFromWallet}
              </button>
            </div>

            {fundings && fundings.length > 0 && (
              <>
                <p className="pollar-card-section-title">{copy.yourFundings}</p>
                {fundings.map((f) => {
                  const state = (f.chain === 'SOLANA' ? copy.fundingSolana[f.status] : undefined) ?? copy.funding[f.status];
                  const steps = FUNDING_STEPS[isFundingChain(f.chain) ? f.chain : 'STELLAR'];
                  const step = steps.indexOf(f.status) + 1;
                  const inflight = FUNDING_INFLIGHT.has(f.status);
                  return (
                    <div key={f.id} className="pollar-card-tx" aria-busy={inflight}>
                      <div>
                        <span className="pollar-card-funding-title">
                          {inflight && <span className="pollar-spinner pollar-spinner-sm" aria-hidden />}
                          {state?.title ?? f.status}
                        </span>
                        {inflight && step > 0 && (
                          <span className="pollar-card-tx-meta" role="status">
                            {copy.stepOf(step, steps.length)} · {state?.hint}
                          </span>
                        )}
                        <span className="pollar-card-tx-meta">
                          {new Date(f.createdAt).toLocaleString()}
                          {f.status === 'FAILED' && f.error ? ` · ${f.error}` : ''}
                        </span>
                      </div>
                      <div className="pollar-card-tx-amount" data-direction={f.status === 'CREDITED' ? 'credit' : undefined}>
                        {money(f.amount, 'USD', language)}
                      </div>
                    </div>
                  );
                })}
                {fundingsInflight && <p className="pollar-card-note">{copy.canClose}</p>}
              </>
            )}

            {!showManual && (
              <p className="pollar-card-note">
                {copy.preferOtherWallet}{' '}
                <button
                  type="button"
                  className="pollar-card-link"
                  onClick={() => void showManualAddress()}
                  disabled={busy !== null}
                >
                  {copy.showDeposit}
                </button>
              </p>
            )}
            {showManual &&
              deposit?.map((d) => (
                <div key={d.network} className="pollar-card-deposit">
                  <strong>{d.network}</strong> ({copy.chain(d.chainId)})<code>{d.address}</code>
                  <CopyButton value={d.address} label={copy.copyAddress} language={language} />
                  <p className="pollar-card-note">
                    {copy.sendOnly(d.tokens.map((t) => (t.currency ?? 'token').toUpperCase()).join(` ${copy.or} `), d.network)}
                  </p>
                </div>
              ))}
            {showManual && deposit?.length === 0 && <div className="pollar-modal-error">{copy.noDeposit}</div>}
            {showManual && (
              <p className="pollar-card-note">
                <button type="button" className="pollar-card-link" onClick={() => setShowManual(false)}>
                  {copy.hideDeposit}
                </button>
              </p>
            )}
          </>
        )}

        {error && <div className="pollar-modal-error">{error}</div>}

        <PollarModalFooter language={language} />
      </div>
    </div>
  );
}
