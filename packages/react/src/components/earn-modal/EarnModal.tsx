'use client';

import { EarnOpportunity, EarnPosition, EarnProviderId } from '@pollar/core';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { PollarModalFooter } from '../commons';
import { TxStatusView } from '../transaction-modal/TxStatusView';
import '../shared.css';
import '../transaction-modal/TransactionModal.css';
import '../send-modal/SendModal.css';
import '../swap-modal/SwapModal.css';
import './EarnModal.css';

interface EarnModalProps {
  onClose: () => void;
}

/** Poll interval (ms) for the live position + APY. */
const POSITION_POLL_MS = 10000;

const PROVIDER_LABELS: Record<EarnProviderId, string> = {
  blend: 'Blend',
  defindex: 'DeFindex',
};

const IN_FLIGHT_STEPS = ['building', 'signing', 'submitting', 'submitted', 'signing-submitting', 'building-signing-submitting'] as const;

function formatAmount(value: string): string {
  const n = parseFloat(value);
  return isNaN(n) ? value : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

export function EarnModal({ onClose }: EarnModalProps) {
  const {
    getEarnProviders,
    getEarnOpportunities,
    getEarnPosition,
    earnDeposit,
    earnWithdraw,
    tx: transaction,
    wallet,
    network,
    styles,
  } = usePollar();

  const walletType = wallet?.custody === 'external' ? wallet.provider : null;
  const smartUnsupported = wallet?.custody === 'smart';
  const { theme = 'light', accentColor = '#005DB4' } = styles;
  const isDark = theme === 'dark';

  const [step, setStep] = useState<'form' | 'tx'>('form');
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [providers, setProviders] = useState<EarnProviderId[] | null>(null); // null = loading
  const [provider, setProvider] = useState<EarnProviderId | null>(null);
  const [opportunities, setOpportunities] = useState<EarnOpportunity[]>([]);
  const [opportunityId, setOpportunityId] = useState('');
  const [position, setPosition] = useState<EarnPosition | null>(null);
  const [amount, setAmount] = useState('');
  const [loadingOpps, setLoadingOpps] = useState(false);
  const [formError, setFormError] = useState('');
  const [showXdr, setShowXdr] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Providers ────────────────────────────────────────────────────────────
  const loadProviders = useCallback(() => {
    setProviders(null);
    return getEarnProviders()
      .then((ps) => {
        setProviders(ps);
        setProvider((cur) => cur ?? ps[0] ?? null);
      })
      .catch(() => setProviders([]));
  }, [getEarnProviders]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  // ─── Opportunities (per provider) ───────────────────────────────────────────
  useEffect(() => {
    if (!provider) return;
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
  }, [provider, getEarnOpportunities]);

  const selectedOpportunity = opportunities.find((o) => o.id === opportunityId) ?? null;

  // ─── Position (live, polled) ────────────────────────────────────────────────
  const refreshPosition = useCallback(() => {
    if (!provider || !opportunityId || !wallet) return;
    getEarnPosition({ provider, opportunity: opportunityId })
      .then(setPosition)
      .catch(() => {
        /* leave the last snapshot on a transient read error */
      });
  }, [provider, opportunityId, wallet, getEarnPosition]);

  useEffect(() => {
    setPosition(null);
    refreshPosition();
  }, [refreshPosition]);

  useEffect(() => {
    if (step !== 'form' || !provider || !opportunityId) return;
    const id = setInterval(refreshPosition, POSITION_POLL_MS);
    return () => clearInterval(id);
  }, [step, provider, opportunityId, refreshPosition]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  // ─── Derived ────────────────────────────────────────────────────────────────
  const providersLoading = providers === null;
  const earnUnavailable = providers !== null && providers.length === 0;
  const withdrawUnit = position?.withdrawUnit ?? 'asset';
  const assetCode = selectedOpportunity?.asset.code ?? '';
  const amountUnitLabel = tab === 'deposit' ? assetCode : withdrawUnit === 'shares' ? 'shares' : assetCode;

  const hash = transaction.step === 'success' ? transaction.hash : null;
  const buildData = 'buildData' in transaction ? transaction.buildData : null;
  const explorerNetwork = buildData?.summary.network?.toLowerCase().includes('testnet')
    ? 'testnet'
    : buildData
      ? 'public'
      : network === 'testnet'
        ? 'testnet'
        : 'public';
  const explorerUrl = hash ? `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}` : null;

  const isInProgress = (IN_FLIGHT_STEPS as readonly string[]).includes(transaction.step);
  const showBack = step === 'tx' && (transaction.step === 'error' || transaction.step === 'success') && !isInProgress;

  const txTitle = isInProgress
    ? tab === 'deposit'
      ? 'Depositing…'
      : 'Withdrawing…'
    : transaction.step === 'success'
      ? 'Done!'
      : transaction.step === 'error'
        ? tab === 'deposit'
          ? 'Deposit failed'
          : 'Withdraw failed'
        : 'Confirm';

  const canSubmit =
    !smartUnsupported && !!provider && !!opportunityId && !!amount && parseFloat(amount) > 0 && !providersLoading && !loadingOpps;

  const cssVars = {
    '--pollar-accent': accentColor,
    '--pollar-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': isDark ? '#ffffff' : '#111827',
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    '--pollar-input-bg': isDark ? '#374151' : '#f9fafb',
    '--pollar-error-bg': isDark ? '#2a1515' : '#fef2f2',
    '--pollar-error-border': isDark ? '#7f1d1d' : '#fecaca',
    '--pollar-error-text': isDark ? '#f87171' : '#dc2626',
    '--pollar-success-text': isDark ? '#4ade80' : '#16a34a',
    '--pollar-buttons-border-radius': '6px',
    '--pollar-buttons-height': '44px',
    '--pollar-input-height': '44px',
    '--pollar-input-border-radius': '0.5rem',
    '--pollar-card-border-radius': '10px',
  } as CSSProperties;

  // ─── Actions ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setFormError('');
    if (smartUnsupported) {
      setFormError('Earn is not yet supported for smart (passkey) wallets');
      return;
    }
    if (!provider || !opportunityId) {
      setFormError('Select a vault or pool');
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setFormError('Enter a valid amount');
      return;
    }
    if (tab === 'withdraw' && position && parsed > parseFloat(position.withdrawable)) {
      setFormError('Amount exceeds your position');
      return;
    }
    setStep('tx');
    const params = { provider, opportunity: opportunityId, amount };
    const outcome = tab === 'deposit' ? await earnDeposit(params) : await earnWithdraw(params);
    if (outcome.status === 'success' || outcome.status === 'pending') {
      setAmount('');
      refreshPosition();
    }
  }

  async function handleRetry() {
    if (transaction.step !== 'error' || !provider || !opportunityId) return;
    const params = { provider, opportunity: opportunityId, amount };
    if (tab === 'deposit') await earnDeposit(params);
    else await earnWithdraw(params);
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

  const title = step === 'form' ? 'Earn' : txTitle;

  return (
    <div className="pollar-overlay" onClick={!isInProgress ? onClose : undefined}>
      <div className="pollar-modal-card pollar-send-modal" data-theme={theme} style={cssVars} onClick={(e) => e.stopPropagation()}>
        <div className="pollar-modal-header">
          <div className="pollar-send-header-left">
            {showBack && (
              <button type="button" className="pollar-modal-close" onClick={handleBack} aria-label="Back">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <h2 className="pollar-modal-title">{title}</h2>
          </div>
          {!isInProgress && (
            <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {step === 'form' && providersLoading && <div className="pollar-send-hint">Loading Earn options…</div>}

        {step === 'form' && earnUnavailable && <div className="pollar-modal-error">Earn is not available for this app.</div>}

        {step === 'form' && !earnUnavailable && (
          <>
            {smartUnsupported && (
              <div className="pollar-modal-error">Earn is not yet available for smart (passkey) wallets.</div>
            )}

            {/* Deposit / Withdraw tabs */}
            <div className="pollar-earn-tabs">
              <button
                type="button"
                className={`pollar-earn-tab${tab === 'deposit' ? ' pollar-earn-tab-active' : ''}`}
                onClick={() => {
                  setTab('deposit');
                  setFormError('');
                }}
              >
                Deposit
              </button>
              <button
                type="button"
                className={`pollar-earn-tab${tab === 'withdraw' ? ' pollar-earn-tab-active' : ''}`}
                onClick={() => {
                  setTab('withdraw');
                  setFormError('');
                }}
              >
                Withdraw
              </button>
            </div>

            {/* Provider */}
            {providers && providers.length > 1 && (
              <div className="pollar-send-field">
                <label className="pollar-send-label">Provider</label>
                <select
                  className="pollar-input pollar-send-select"
                  value={provider ?? ''}
                  onChange={(e) => setProvider(e.target.value as EarnProviderId)}
                >
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Opportunity */}
            <div className="pollar-send-field">
              <label className="pollar-send-label">{provider === 'defindex' ? 'Vault' : 'Pool'}</label>
              <select
                className="pollar-input pollar-send-select"
                value={opportunityId}
                disabled={loadingOpps || opportunities.length === 0}
                onChange={(e) => setOpportunityId(e.target.value)}
              >
                {opportunities.length === 0 ? (
                  <option value="">{loadingOpps ? 'Loading…' : 'None available'}</option>
                ) : (
                  opportunities.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {o.apy.toFixed(2)}% APY
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Live position panel */}
            {selectedOpportunity && (
              <div className="pollar-swap-quote">
                <div className="pollar-swap-quote-row">
                  <span className="pollar-send-hint">Your position</span>
                  <span>
                    {position ? formatAmount(position.balance) : '…'} {assetCode}
                  </span>
                </div>
                <div className="pollar-swap-quote-row">
                  <span className="pollar-send-hint">APY</span>
                  <span className="pollar-earn-live">{selectedOpportunity.apy.toFixed(2)}%</span>
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="pollar-send-field">
              <div className="pollar-send-label-row">
                <label className="pollar-send-label">{tab === 'deposit' ? 'Amount' : 'Withdraw amount'}</label>
                {tab === 'withdraw' && position && (
                  <button
                    type="button"
                    className="pollar-swap-custom-toggle"
                    onClick={() => setAmount(position.withdrawable)}
                  >
                    Max: {formatAmount(position.withdrawable)} {amountUnitLabel}
                  </button>
                )}
              </div>
              <div className="pollar-earn-amount">
                <input
                  className="pollar-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {amountUnitLabel && <span className="pollar-earn-amount-unit">{amountUnitLabel}</span>}
              </div>
            </div>

            {formError && <div className="pollar-modal-error">{formError}</div>}

            <div className="pollar-modal-actions">
              <button className="pollar-btn-primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {tab === 'deposit' ? 'Deposit' : 'Withdraw'}
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
          />
        )}

        <PollarModalFooter />
      </div>
    </div>
  );
}
