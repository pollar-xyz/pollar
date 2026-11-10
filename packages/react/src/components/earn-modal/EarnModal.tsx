'use client';

import { EarnOpportunity, EarnPosition, EarnProviderId, SolanaEarnOpportunity, SolanaEarnPosition } from '@pollar/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { useWalletAvailable } from '../../useWalletAvailable';
import { AmountField } from '../AmountField';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, modalChrome } from '../modal-theme';
import { TxStatusHeading, TxStatusView, txStatusReview } from '../transaction-modal/TxStatusView';
import { AssetLogo, ChainLogo } from '../tx-review/TxReview';
import { TX_REVIEW_COPY } from '../tx-review/tx-review-copy';
import { earnOutcome, reviewForEarn } from '../tx-review/tx-review-model';
import '../shared.css';
import '../transaction-modal/TransactionModal.css';
import '../send-modal/SendModal.css';
import '../swap-modal/SwapModal.css';
import './EarnModal.css';
import { EARN_COPY } from './earn-copy';
import { oneOf, seededAmount, useSuccessReport } from '../../modal-options';
import { PollarOverlay } from '../PollarOverlay';
import { PollarSelect } from '../PollarSelect';
import { useInlineConfirmation } from '../../useInlineConfirmation';

/** Where the earn modal opens: a starting point the user can change. An option the app does not offer is left out. */
export interface EarnModalOptions {
  /** The network the modal opens on, when the app offers Earn on both. */
  chain?: EarnNetwork;
  provider?: EarnProviderId;
  /** The vault or pool, as `getEarnOpportunities` names it. */
  opportunityId?: string;
  tab?: 'deposit' | 'withdraw';
  amount?: string;
  /** Called once the deposit or withdrawal lands, with its transaction hash. */
  onSuccess?: (result: { hash: string }) => void;
}

interface EarnModalProps {
  onClose: () => void;
  initial?: EarnModalOptions | undefined;
}

/** The networks Earn runs on; the modal shows a selector when the app offers both. */
export type EarnNetwork = 'STELLAR' | 'SOLANA';

/** Poll interval (ms) for the live position + APY. */
const POSITION_POLL_MS = 10000;

const PROVIDER_LABELS: Record<EarnProviderId, string> = {
  blend: 'Blend',
  defindex: 'DeFindex',
};

const IN_FLIGHT_STEPS = [
  'building',
  'signing',
  'submitting',
  'submitted',
  'signing-submitting',
  'building-signing-submitting',
] as const;

function formatAmount(value: string): string {
  const n = parseFloat(value);
  return isNaN(n) ? value : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

/** The deposit or withdrawal the user sent, kept for the result once the form clears. */
interface EarnSubmission {
  action: 'deposit' | 'withdraw';
  chain: EarnNetwork;
  amount: string;
  asset: string;
  name: string | undefined;
  apy: number | undefined;
}

type EarnCopy = (typeof EARN_COPY)['en'];

/** The opportunity and the user's place in it: its name and APY, then what they hold. */
function PositionCard({
  copy,
  assetCode,
  name,
  apy,
  apyLabel,
  rows,
  stale,
}: {
  copy: EarnCopy;
  assetCode: string;
  name: string;
  apy: number | null | undefined;
  apyLabel: string;
  rows: Array<{ label: string; value: string | null | undefined }>;
  stale?: boolean | undefined;
}) {
  return (
    <div className="pollar-swap-quote pollar-earn-card">
      <div className="pollar-earn-card-head">
        {assetCode && <AssetLogo asset={assetCode} small />}
        <strong className="pollar-earn-card-name">{name}</strong>
        {typeof apy === 'number' && <span className="pollar-earn-live">{apy.toFixed(2)}% APY</span>}
      </div>
      {rows.map((row) => (
        <div key={row.label} className="pollar-swap-quote-row">
          <span className="pollar-send-hint">{row.label}</span>
          <span>{row.value == null ? '...' : `${formatAmount(row.value)} ${assetCode}`.trim()}</span>
        </div>
      ))}
      {typeof apy === 'number' && (
        <div className="pollar-swap-quote-row">
          <span className="pollar-send-hint">{apyLabel}</span>
          <span className="pollar-earn-live">{apy.toFixed(2)}%</span>
        </div>
      )}
      {stale && <div className="pollar-send-hint">{copy.stale}</div>}
    </div>
  );
}

export function EarnModal({ onClose, initial }: EarnModalProps) {
  const {
    getEarnProviders,
    getEarnOpportunities,
    getEarnPosition,
    earnDeposit,
    earnWithdraw,
    getSolanaEarnProviders,
    getSolanaEarnOpportunities,
    getSolanaEarnPosition,
    earnSolanaDeposit,
    earnSolanaWithdraw,
    tx: transaction,
    wallet,
    wallets,
    refreshWalletBalance,
    enabledAssets,
    refreshAssets,
    setTrustline,
    network,
    styles,
  } = usePollar();

  const language = useModalLanguage();
  const copy = EARN_COPY[language];
  const reviewCopy = TX_REVIEW_COPY[language];
  const walletType = wallet?.custody === 'external' ? wallet.provider : null;
  const [earnChain, setEarnChain] = useState<EarnNetwork>(
    () => oneOf<EarnNetwork>(['STELLAR', 'SOLANA'], initial?.chain) ?? 'STELLAR',
  );
  const onSolana = earnChain === 'SOLANA';
  // A smart (C-address) wallet is a Stellar account: it says nothing about Solana.
  const smartUnsupported = !onSolana && wallet?.custody === 'smart';
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);

  const [step, setStep] = useState<'form' | 'tx'>('form');
  // The signature's yes is asked here, under the review, not in a prompt over the modal.
  const confirmation = useInlineConfirmation(step === 'tx');
  const [tab, setTab] = useState<'deposit' | 'withdraw'>(
    () => oneOf<'deposit' | 'withdraw'>(['deposit', 'withdraw'], initial?.tab) ?? 'deposit',
  );
  const [providers, setProviders] = useState<EarnProviderId[] | null>(null); // null = loading
  const [solanaProviders, setSolanaProviders] = useState<string[] | null>(null);
  const [solanaOpportunities, setSolanaOpportunities] = useState<SolanaEarnOpportunity[]>([]);
  const [solanaPosition, setSolanaPosition] = useState<SolanaEarnPosition | null>(null);
  const [provider, setProvider] = useState<EarnProviderId | null>(null);
  const [opportunities, setOpportunities] = useState<EarnOpportunity[]>([]);
  // The opportunity option is kept when the provider's list has it, like a choice the user made.
  const [opportunityId, setOpportunityId] = useState(() => initial?.opportunityId ?? '');
  const [position, setPosition] = useState<EarnPosition | null>(null);
  const [amount, setAmount] = useState(() => seededAmount(initial?.amount));
  const [loadingOpps, setLoadingOpps] = useState(false);
  const [formError, setFormError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showXdr, setShowXdr] = useState(false);
  const [submission, setSubmission] = useState<EarnSubmission | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Providers ------------------------------------------------------------
  const loadProviders = useCallback(() => {
    setProviders(null);
    setSolanaProviders(null);
    return Promise.all([
      getEarnProviders()
        .then((ps) => {
          setProviders(ps);
          setProvider((cur) => cur ?? oneOf(ps, initial?.provider) ?? ps[0] ?? null);
        })
        .catch(() => setProviders([])),
      getSolanaEarnProviders()
        .then(setSolanaProviders)
        .catch(() => setSolanaProviders([])),
    ]);
  }, [getEarnProviders, getSolanaEarnProviders, initial?.provider]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  // The wallet balance drives the Deposit tab's "In your wallet" row + Max; the
  // enabled assets drive the deposit-asset trustline check.
  useEffect(() => {
    void refreshWalletBalance();
    void refreshAssets();
  }, [refreshWalletBalance, refreshAssets]);

  // --- Opportunities (per provider) -------------------------------------------
  useEffect(() => {
    if (!provider || onSolana) return;
    let cancelled = false;
    setLoadingOpps(true);
    getEarnOpportunities(provider)
      .then((opps) => {
        if (cancelled) return;
        setOpportunities(opps);
        setOpportunityId((cur) => (opps.some((o) => o.id === cur) ? cur : (opps[0]?.id ?? '')));
      })
      .catch(() => {
        if (!cancelled) setOpportunities([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingOpps(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, onSolana, getEarnOpportunities]);

  const networks = useMemo<EarnNetwork[]>(
    () => [
      ...(providers && providers.length > 0 ? (['STELLAR'] as const) : []),
      ...(solanaProviders && solanaProviders.length > 0 ? (['SOLANA'] as const) : []),
    ],
    [providers, solanaProviders],
  );
  const networksLoading = providers === null || solanaProviders === null;
  // Land on a network the app offers Earn on; Stellar first when it offers both.
  useEffect(() => {
    if (!networksLoading && networks.length > 0 && !networks.includes(earnChain)) setEarnChain(networks[0]!);
  }, [networksLoading, networks, earnChain]);

  // --- Solana opportunities ----------------------------------------------------
  const loadSolanaOpportunities = useCallback(() => {
    setLoadingOpps(true);
    return getSolanaEarnOpportunities()
      .then((opps) => {
        setSolanaOpportunities(opps);
        setOpportunityId((cur) => (opps.some((o) => o.id === cur) ? cur : (opps[0]?.id ?? '')));
      })
      .catch(() => setSolanaOpportunities([]))
      .finally(() => setLoadingOpps(false));
  }, [getSolanaEarnOpportunities]);

  useEffect(() => {
    if (onSolana && solanaProviders && solanaProviders.length > 0) void loadSolanaOpportunities();
  }, [onSolana, solanaProviders, loadSolanaOpportunities]);

  const selectedOpportunity = onSolana ? null : (opportunities.find((o) => o.id === opportunityId) ?? null);
  const selectedSolana = onSolana ? (solanaOpportunities.find((o) => o.id === opportunityId) ?? null) : null;

  // --- Position (live, polled) ------------------------------------------------
  const refreshPosition = useCallback(() => {
    if (!opportunityId || !wallet) return;
    if (onSolana) {
      getSolanaEarnPosition(opportunityId)
        .then(setSolanaPosition)
        .catch(() => {
          /* leave the last snapshot on a transient read error */
        });
      return;
    }
    if (!provider) return;
    getEarnPosition({ provider, opportunity: opportunityId })
      .then(setPosition)
      .catch(() => {
        /* leave the last snapshot on a transient read error */
      });
  }, [onSolana, provider, opportunityId, wallet, getEarnPosition, getSolanaEarnPosition]);

  useEffect(() => {
    setPosition(null);
    setSolanaPosition(null);
    refreshPosition();
  }, [refreshPosition]);

  useEffect(() => {
    if (step !== 'form' || (!onSolana && !provider) || !opportunityId) return;
    const id = setInterval(refreshPosition, POSITION_POLL_MS);
    return () => clearInterval(id);
  }, [step, onSolana, provider, opportunityId, refreshPosition]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  // --- Derived ----------------------------------------------------------------
  const providersLoading = networksLoading;
  const earnUnavailable = !networksLoading && networks.length === 0;
  const withdrawUnit = onSolana ? 'asset' : (position?.withdrawUnit ?? 'asset');
  const assetCode = (onSolana ? selectedSolana?.asset.code : selectedOpportunity?.asset.code) ?? '';
  const amountUnitLabel = tab === 'deposit' ? assetCode : withdrawUnit === 'shares' ? copy.shares : assetCode;
  // What the opportunity takes right now: a paused one may only let funds out, or nothing.
  const actionUnavailable = !!selectedSolana && !selectedSolana.actions.includes(tab);
  const withdrawable = onSolana ? solanaPosition?.withdrawable : position?.withdrawable;

  const walletAvailable = useWalletAvailable(
    selectedSolana
      ? { chain: 'SOLANA', code: assetCode, issuer: selectedSolana.asset.address }
      : selectedOpportunity
        ? { chain: 'STELLAR', code: assetCode, issuer: selectedOpportunity.asset.issuer }
        : null,
  );

  // Depositing an issued asset (e.g. USDC) needs the wallet to trust it first.
  // Native XLM and pure Soroban tokens (no classic issuer) never do; smart
  // (C-address) wallets hold SAC tokens, so no classic trustline applies. When
  // needed, the deposit runs as two signatures: trustline, then deposit.
  const depositAssetRecord = (() => {
    if (!selectedOpportunity?.asset.issuer || enabledAssets.step !== 'loaded') return undefined;
    // Stellar-only: the catalog is multichain now, and Earn (DeFindex/Blend)
    // settles on Stellar. Chain is undefined on the v1 shape, so absent = Stellar.
    return enabledAssets.data.assets.find(
      (a) =>
        (a.chain === undefined || a.chain === 'STELLAR') &&
        a.code === assetCode &&
        a.issuer === selectedOpportunity.asset.issuer,
    );
  })();
  const depositNeedsTrustline =
    !onSolana &&
    tab === 'deposit' &&
    !smartUnsupported &&
    !!selectedOpportunity?.asset.issuer &&
    !depositAssetRecord?.trustlineEstablished;

  const hash = transaction.step === 'success' ? transaction.hash : null;
  useSuccessReport(transaction, step === 'tx', initial?.onSuccess);
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const explorerNetwork = buildData?.summary.network?.toLowerCase().includes('testnet')
    ? 'testnet'
    : buildData
      ? 'public'
      : network === 'testnet'
        ? 'testnet'
        : 'public';
  const explorerUrl = !hash
    ? null
    : onSolana
      ? `https://solscan.io/tx/${hash}${network === 'testnet' ? '?cluster=devnet' : ''}`
      : `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}`;

  // A transaction past its confirmation window is read on in the background: the modal can close meanwhile.
  const isInProgress =
    (IN_FLIGHT_STEPS as readonly string[]).includes(transaction.step) &&
    !(transaction.step === 'submitted' && transaction.slow);
  const showBack = step === 'tx' && (transaction.step === 'error' || transaction.step === 'success') && !isInProgress;

  const txTitle = isInProgress
    ? tab === 'deposit'
      ? copy.depositing
      : copy.withdrawing
    : transaction.step === 'success'
      ? tab === 'deposit'
        ? copy.depositDone
        : copy.withdrawDone
      : transaction.step === 'error'
        ? tab === 'deposit'
          ? copy.depositFailed
          : copy.withdrawFailed
        : copy.confirm;

  // Over-spend guard: deposit can't exceed the wallet's available balance;
  // withdraw can't exceed the position. Skipped while the relevant figure is
  // still unknown (`null`) so a slow balance read doesn't block a valid amount.
  const parsedAmount = parseFloat(amount);
  const exceedsAvailable =
    tab === 'deposit'
      ? walletAvailable != null && parsedAmount > parseFloat(walletAvailable)
      : withdrawable != null && parsedAmount > parseFloat(withdrawable);

  const canSubmit =
    !smartUnsupported &&
    (onSolana || !!provider) &&
    !actionUnavailable &&
    !!opportunityId &&
    !!amount &&
    parsedAmount > 0 &&
    !exceedsAvailable &&
    !providersLoading &&
    !loadingOpps;

  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);

  // --- Actions ----------------------------------------------------------------
  async function handleSubmit() {
    setFormError('');
    if (smartUnsupported) {
      setFormError(copy.smartNotSupported);
      return;
    }
    if ((!onSolana && !provider) || !opportunityId) {
      setFormError(copy.selectOpportunity);
      return;
    }
    if (actionUnavailable) {
      setFormError(copy.actionUnavailable(tab));
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setFormError(copy.invalidAmount);
      return;
    }
    if (tab === 'deposit' && walletAvailable != null && parsed > parseFloat(walletAvailable)) {
      setFormError(copy.exceedsWallet);
      return;
    }
    if (tab === 'withdraw' && withdrawable != null && parsed > parseFloat(withdrawable)) {
      setFormError(copy.exceedsPosition);
      return;
    }
    const chosen = onSolana ? selectedSolana : selectedOpportunity;
    setSubmission({
      action: tab,
      chain: earnChain,
      amount,
      // A DeFindex withdrawal is counted in shares, not in the asset.
      asset: tab === 'withdraw' && withdrawUnit === 'shares' ? copy.shares : assetCode,
      name: chosen?.name,
      apy: onSolana ? (solanaPosition?.apy ?? selectedSolana?.apy ?? undefined) : selectedOpportunity?.apy,
    });
    setStep('tx');

    // Deposit of an issued asset needs its trustline first (native never does).
    // Establish it, then deposit - two signatures, like swap.
    if (tab === 'deposit' && depositNeedsTrustline && selectedOpportunity?.asset.issuer) {
      // Sponsorship is derived automatically from the app config now - no flag.
      const tl = await setTrustline({ code: assetCode, issuer: selectedOpportunity.asset.issuer });
      if (tl.status === 'error') {
        setFormError(copy.trustlineFailed(assetCode, tl.details ?? copy.unknownError));
        setStep('form');
        return;
      }
      await refreshAssets();
    }

    const outcome = await runEarn();
    if (outcome && (outcome.status === 'success' || outcome.status === 'pending')) {
      setAmount('');
      // The result shows the position only once it is read again, never the one from before.
      setPosition(null);
      setSolanaPosition(null);
      refreshPosition();
    }
  }

  function runEarn() {
    if (onSolana) {
      const params = { opportunity: opportunityId, amount };
      return tab === 'deposit' ? earnSolanaDeposit(params) : earnSolanaWithdraw(params);
    }
    if (!provider) return null;
    const params = { provider, opportunity: opportunityId, amount };
    return tab === 'deposit' ? earnDeposit(params) : earnWithdraw(params);
  }

  async function handleRetry() {
    if (transaction.step !== 'error' || !opportunityId) return;
    await runEarn();
  }

  function handleCopyHash() {
    if (!hash) return;
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopied(false);
      }, 2000);
    });
  }

  function handleBack() {
    setStep('form');
    setShowXdr(false);
    setCopied(false);
    refreshPosition();
  }

  // Re-fetch everything the modal shows on demand: the opportunities for the
  // current provider (fresh APYs), the wallet's position, and the wallet balance
  // ("In your wallet" + Max). Leaves the current data in place on a transient
  // read error.
  async function handleRefresh() {
    if (refreshing || (!onSolana && !provider)) return;
    setRefreshing(true);
    try {
      void refreshWalletBalance();
      if (onSolana) {
        await loadSolanaOpportunities();
        refreshPosition();
        return;
      }
      if (!provider) return;
      const opps = await getEarnOpportunities(provider);
      setOpportunities(opps);
      setOpportunityId((cur) => (opps.some((o) => o.id === cur) ? cur : (opps[0]?.id ?? '')));
      refreshPosition();
    } catch {
      /* transient - keep the current snapshot */
    } finally {
      setRefreshing(false);
    }
  }

  const title = step === 'form' ? copy.title : txTitle;

  const submissionReview = submission
    ? reviewForEarn(
        {
          action: submission.action,
          chain: submission.chain,
          network,
          amount: submission.amount,
          asset: submission.asset,
          name: submission.name,
          apy: submission.apy,
          wallet: wallets.find((w) => (w.chain ?? 'STELLAR') === submission.chain)?.address,
        },
        reviewCopy,
      )
    : null;
  // The position read after the operation landed, when the modal has it.
  const resultPosition =
    submission?.chain === 'SOLANA' && selectedSolana && solanaPosition ? (
      <PositionCard
        copy={copy}
        assetCode={assetCode}
        name={copy.positionNow}
        apy={solanaPosition.apy ?? selectedSolana.apy}
        apyLabel={copy.apyAfterFees}
        rows={[
          { label: copy.deposited, value: solanaPosition.principal },
          ...(solanaPosition.profit != null ? [{ label: copy.profit, value: solanaPosition.profit }] : []),
          { label: copy.yourPosition, value: solanaPosition.balance },
        ]}
      />
    ) : submission?.chain === 'STELLAR' && selectedOpportunity && position ? (
      <PositionCard
        copy={copy}
        assetCode={assetCode}
        name={copy.positionNow}
        apy={selectedOpportunity.apy}
        apyLabel="APY"
        rows={[{ label: copy.yourPosition, value: position.balance }]}
      />
    ) : null;

  return (
    <PollarOverlay style={overlayStyle} onClick={step !== 'tx' && !isInProgress ? onClose : undefined}>
      <div
        className="pollar-modal-card pollar-send-modal"
        data-theme={theme}
        style={cssVars}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pollar-modal-header">
          <div className="pollar-send-header-left">
            {showBack && (
              <button type="button" className="pollar-modal-close" onClick={handleBack} aria-label={copy.back}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {step === 'tx' ? (
              <TxStatusHeading
                review={txStatusReview({
                  transaction,
                  review: submissionReview,
                  explorerUrl,
                  confirmation,
                  network,
                  language,
                })}
                fallback={title}
              />
            ) : (
              <h2 className="pollar-modal-title">{title}</h2>
            )}
          </div>
          <div className="pollar-modal-header-actions">
            {step === 'form' && !earnUnavailable && !smartUnsupported && (
              <button
                type="button"
                className="pollar-modal-close"
                onClick={() => void handleRefresh()}
                disabled={refreshing || providersLoading}
                aria-label={copy.refresh}
              >
                <svg
                  className={refreshing ? 'pollar-modal-refresh-icon pollar-spinning' : 'pollar-modal-refresh-icon'}
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
            {!isInProgress && (
              <button type="button" className="pollar-modal-close" onClick={onClose} aria-label={copy.close}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {step === 'form' && earnUnavailable && <div className="pollar-modal-error">{copy.unavailable}</div>}

        {step === 'form' && !earnUnavailable && (
          <>
            {smartUnsupported && <div className="pollar-modal-error">{copy.smartUnavailable}</div>}

            {/* Deposit / Withdraw tabs */}
            <div className="pollar-tabs">
              <button
                type="button"
                className="pollar-tab"
                data-active={tab === 'deposit'}
                onClick={() => {
                  setTab('deposit');
                  setFormError('');
                }}
              >
                {copy.deposit}
              </button>
              <button
                type="button"
                className="pollar-tab"
                data-active={tab === 'withdraw'}
                onClick={() => {
                  setTab('withdraw');
                  setFormError('');
                }}
              >
                {copy.withdraw}
              </button>
            </div>

            {/* Network */}
            {networks.length > 1 && (
              <div className="pollar-send-field">
                <span className="pollar-send-label">{copy.network}</span>
                <div className="pollar-tabs pollar-earn-networks" role="radiogroup" aria-label={copy.network}>
                  {networks.map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={earnChain === n}
                      className="pollar-tab pollar-earn-network"
                      data-active={earnChain === n}
                      data-chain={n}
                      onClick={() => {
                        if (n === earnChain) return;
                        setEarnChain(n);
                        setOpportunityId('');
                        setAmount('');
                        setFormError('');
                      }}
                    >
                      <ChainLogo chain={n} />
                      {reviewCopy.chains[n]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Provider */}
            {!onSolana && providers && providers.length > 1 && (
              <div className="pollar-send-field">
                <label className="pollar-send-label">{copy.provider}</label>
                <PollarSelect
                  aria-label={copy.provider}
                  value={provider ?? ''}
                  onChange={(value) => setProvider(value as EarnProviderId)}
                  options={providers.map((p) => ({ value: p, label: PROVIDER_LABELS[p] }))}
                />
              </div>
            )}

            {/* Opportunity */}
            <div className="pollar-send-field">
              <label className="pollar-send-label">
                {onSolana ? copy.opportunity : provider === 'defindex' ? copy.vault : copy.pool}
              </label>
              {loadingOpps || providersLoading ? (
                <div className="pollar-input pollar-select-loading">
                  <span className="pollar-spinner pollar-spinner-sm" />
                  <span>{copy.loadingOptions}</span>
                </div>
              ) : (
                <PollarSelect
                  aria-label={onSolana ? copy.opportunity : provider === 'defindex' ? copy.vault : copy.pool}
                  value={opportunityId}
                  placeholder={copy.noneAvailable}
                  disabled={(onSolana ? solanaOpportunities : opportunities).length === 0}
                  onChange={setOpportunityId}
                  options={(onSolana ? solanaOpportunities : opportunities).map((o) => ({
                    value: o.id,
                    label: `${o.name} · ${o.apy.toFixed(2)}% APY`,
                  }))}
                />
              )}
            </div>

            {/* The APY and the profit on Solana are after fees. */}
            {selectedSolana && (
              <PositionCard
                copy={copy}
                assetCode={assetCode}
                name={selectedSolana.name}
                apy={solanaPosition?.apy ?? selectedSolana.apy}
                apyLabel={copy.apyAfterFees}
                rows={[
                  { label: copy.deposited, value: solanaPosition?.principal },
                  ...(solanaPosition?.profit != null ? [{ label: copy.profit, value: solanaPosition.profit }] : []),
                  { label: copy.yourPosition, value: solanaPosition?.balance },
                ]}
                stale={solanaPosition?.stale}
              />
            )}
            {actionUnavailable && <div className="pollar-send-hint">{copy.actionUnavailable(tab)}</div>}

            {selectedOpportunity && (
              <PositionCard
                copy={copy}
                assetCode={assetCode}
                name={selectedOpportunity.name}
                apy={selectedOpportunity.apy}
                apyLabel="APY"
                rows={[{ label: copy.yourPosition, value: position?.balance }]}
              />
            )}

            {/* Amount */}
            <AmountField
              id="pollar-earn-amount"
              label={tab === 'deposit' ? copy.amount : copy.withdrawAmount}
              value={amount}
              onChange={setAmount}
              unit={amountUnitLabel}
              unitIcon={amountUnitLabel === assetCode && assetCode ? <AssetLogo asset={assetCode} small /> : undefined}
              available={tab === 'deposit' ? walletAvailable : (withdrawable ?? undefined)}
            />

            {formError && <div className="pollar-modal-error">{formError}</div>}

            {depositNeedsTrustline && selectedOpportunity && (
              <div className="pollar-swap-trustline-notice">{copy.trustlineNotice(assetCode)}</div>
            )}

            <div className="pollar-modal-actions">
              <button className="pollar-btn-primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {tab === 'deposit' ? (depositNeedsTrustline ? copy.trustlineAndDeposit : copy.deposit) : copy.withdraw}
              </button>
            </div>
          </>
        )}

        {step === 'tx' && (
          <TxStatusView
            transaction={transaction}
            showXdr={showXdr}
            copied={copied}
            explorerUrl={explorerUrl}
            walletType={walletType}
            onSignAndSend={() => {}}
            onToggleXdr={() => setShowXdr((v) => !v)}
            onCopyHash={handleCopyHash}
            onRetry={() => void handleRetry()}
            onDone={onClose}
            language={language}
            review={submissionReview}
            confirmation={confirmation}
            network={network}
            successMessage={submission ? earnOutcome(submission, reviewCopy) : undefined}
            successExtra={submission && <>{resultPosition}</>}
          />
        )}

        <PollarModalFooter />
      </div>
    </PollarOverlay>
  );
}
