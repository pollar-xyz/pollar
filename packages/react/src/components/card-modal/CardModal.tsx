'use client';

import {
  isPollarApiError,
  type CardBalance,
  type CardHolder,
  type CardIncomeRange,
  type CardInfo,
  type CardKycInput,
  type CardOccupation,
  type CardProvider,
  type CardSecrets,
  type CardTransaction,
  type CardDepositAddress,
} from '@pollar/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { CopyButton, PollarModalFooter } from '../commons';
import { buildModalCssVars, modalChrome } from '../modal-theme';
import '../shared.css';
import '../send-modal/SendModal.css';
import './CardModal.css';

interface CardModalProps {
  onClose: () => void;
}

/** How often the holder is re-read while identity verification is pending. */
const KYC_POLL_MS = 5000;
/** How long the revealed number stays on screen. */
const REVEAL_MS = 30_000;
const TX_LIMIT = 10;

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
  NEEDS_ACTION: 'Finish verifying your identity: you will be asked for a photo of your document and a selfie.',
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

export function CardModal({ onClose }: CardModalProps) {
  const { getClient, styles, wallet } = usePollar();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);

  const [providers, setProviders] = useState<CardProvider[] | null>(null);
  const [holder, setHolder] = useState<CardHolder | null | undefined>(undefined);
  const [cards, setCards] = useState<CardInfo[] | null>(null);
  const [balance, setBalance] = useState<CardBalance | null>(null);
  const [transactions, setTransactions] = useState<CardTransaction[] | null>(null);
  const [deposit, setDeposit] = useState<CardDepositAddress[] | null>(null);
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
    const client = getClient();
    const h = await client.getCardHolder();
    setHolder(h);
    return h;
  }, [getClient]);

  const loadCardData = useCallback(async () => {
    const client = getClient();
    const list = await client.getCards();
    setCards(list);
    if (list.length === 0) return;
    const [b, tx] = await Promise.all([client.getCardBalance(), client.getCardTransactions({ limit: TX_LIMIT })]);
    setBalance(b);
    setTransactions(tx.transactions);
  }, [getClient]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ps = await getClient().getCardProviders();
        if (cancelled) return;
        setProviders(ps);
        if (ps.length === 0) return;
        const h = await loadHolder();
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
  }, [getClient, loadHolder, loadCardData]);

  // Prefill the KYC form from the session profile once the form is the next step.
  useEffect(() => {
    if (holder?.kycStatus !== 'NOT_STARTED') return;
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
  }, [holder?.kycStatus, getClient]);

  // Verification in progress: re-read the holder until it settles.
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
  async function run(key: string, work: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(null);
    }
  }

  const signUp = () =>
    run(
      'signup',
      async () => {
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
        if (!deposit) setDeposit(await getClient().getCardDepositAddresses());
        setPanel('fund');
      },
      'Could not load the deposit address',
    );

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

  // --- Render -------------------------------------------------------------------
  const loading = providers === null || (providers.length > 0 && holder === undefined);
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

        {/* Step 1: sign up */}
        {!loading && provider && holder === null && (
          <>
            <p>
              Get a {provider.name} card funded from your wallet{wallet ? '' : ' once you sign in'}. You will verify your
              identity first; it takes a few minutes.
            </p>
            <div className="pollar-modal-actions">
              <button
                type="button"
                className="pollar-btn-primary"
                onClick={() => void signUp()}
                disabled={busy !== null || !wallet}
              >
                {busy === 'signup' ? 'Starting...' : 'Start'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: KYC form */}
        {!loading && provider && holder?.kycStatus === 'NOT_STARTED' && (
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

        {/* Step 3: verification pending */}
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
                <span>{provider.name}</span>
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
              Your card is backed by the {provider.fundingAssets.join(' or ') || 'stablecoins'} you deposit. Send only the
              tokens listed, on the network listed; anything else can be lost.
            </p>
            {deposit?.map((d) => (
              <div key={d.network} className="pollar-card-deposit">
                <strong>{d.network}</strong> (chain {d.chainId})<code>{d.address}</code>
                <CopyButton value={d.address} label="Copy address" />
                <p className="pollar-card-note">
                  Accepts: {d.tokens.map((t) => (t.currency ?? 'token').toUpperCase()).join(', ')}
                </p>
              </div>
            ))}
            {deposit?.length === 0 && <div className="pollar-modal-error">The provider returned no deposit address.</div>}
            <p className="pollar-card-note">
              Funding straight from your Pollar wallet is coming next; for now, transfer to the address above.
            </p>
          </>
        )}

        {error && <div className="pollar-modal-error">{error}</div>}

        <PollarModalFooter />
      </div>
    </div>
  );
}
