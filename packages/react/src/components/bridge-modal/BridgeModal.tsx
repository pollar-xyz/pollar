'use client';

import type { BridgeChain, BridgeConfig, BridgeQuote, BridgeTransfer, PollarClient, RampSigningHandler } from '@pollar/core';
import {
  assertRampStellarSigner,
  bridgeSourceChains,
  bridgeTargetChains,
  isBridgeSettled,
  isPollarApiError,
} from '@pollar/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { oneOf, seededAmount } from '../../modal-options';
import { modalChrome } from '../modal-theme';
import '../shared.css';
import './BridgeModal.css';
import { BRIDGE_COPY, type BridgeCopy } from './bridge-copy';
import { BRIDGE_CHAIN_LABEL, BridgeModalTemplate, type BridgeModalStep } from './BridgeModalTemplate';

/** Where the bridge modal opens: a starting point the user can change, never a lock. */
export interface BridgeModalOptions {
  /** Used only when the user can bridge from that chain. */
  fromChain?: BridgeChain;
  /** Used only when the user can bridge to it from the chain the modal opens on. */
  toChain?: BridgeChain;
  /** USDC, e.g. '25'. */
  amount?: string;
  /** Called once the USDC arrives on the destination, with the completed transfer. */
  onSuccess?: (transfer: BridgeTransfer) => void;
}

interface BridgeModalProps {
  onClose: () => void;
  initial?: BridgeModalOptions | undefined;
}

const AMOUNT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const QUOTE_DEBOUNCE_MS = 400;

/** What the server refused, in the user's words. */
function errorText(error: unknown, copy: BridgeCopy): string {
  if (!isPollarApiError(error)) return copy.errors.generic;
  const reason = typeof error.body.reason === 'string' ? error.body.reason : null;
  const chain = typeof error.body.chain === 'string' ? (BRIDGE_CHAIN_LABEL[error.body.chain as BridgeChain] ?? '') : '';
  switch (error.code) {
    case 'SDK_BRIDGE_UNAVAILABLE':
      if (reason === 'mainnet_only') return copy.errors.mainnetOnly;
      if (reason === 'chain_not_enabled') return copy.errors.chainNotEnabled;
      return copy.errors.noGasWallet;
    case 'SDK_BRIDGE_WALLET_NOT_READY':
      if (reason === 'no_usdc_trustline') return copy.errors.noTrustline;
      if (reason === 'external_solana_source') return copy.errors.externalSolana;
      if (reason === 'no_wallet') return copy.errors.noWallet(chain);
      return copy.errors.unsupportedWallet;
    case 'SDK_CREDITS_INSUFFICIENT':
    case 'SDK_BILLING_OVERDUE':
      return copy.errors.credits;
    case 'SDK_BRIDGE_ACTION_CHANGED':
      return copy.errors.actionChanged;
    default:
      return copy.errors.generic;
  }
}

/**
 * Signs a bridge step, lending the user's connected Stellar wallet as the
 * signer while it does, as the ramp widget does for a ramp leg: the wallet
 * shows the transaction and the user approves it there. A signer the app
 * registered itself for that chain keeps signing.
 */
async function signStepWithWallet(client: PollarClient, transferId: string, actionId: string, copy: BridgeCopy) {
  const lent: Array<() => void> = [];
  const lend = (encoding: string, handler: RampSigningHandler) => {
    try {
      lent.push(client.registerRampSigningHandler('STELLAR', encoding, handler));
    } catch {
      // The app registered its own Stellar signer: that one signs.
    }
  };
  lend('xdr', async (action) => {
    const wallet = client.getWallet();
    if (!wallet) throw new Error(copy.errors.connectStellarWallet);
    assertRampStellarSigner(action, wallet.address);
    const outcome = await client.signTx(action.payload.value);
    if (client.getWallet()?.address !== wallet.address) throw new Error(copy.errors.walletChanged);
    if (outcome.status === 'signed') return outcome.signedXdr;
    throw new Error(
      outcome.status === 'error'
        ? (outcome.message ?? outcome.details ?? copy.errors.signingCancelled)
        : copy.errors.signingCancelled,
    );
  });
  try {
    return await client.signBridgeStep(transferId, actionId);
  } finally {
    for (const release of lent) release();
  }
}

/** A fresh key per transfer the user means to make: a double click or a lost response never starts a second one. */
function newIntentKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function BridgeModal({ onClose, initial }: BridgeModalProps) {
  const { getClient, styles, walletBalance, refreshWalletBalance, openCosignModal } = usePollar();
  const language = useModalLanguage();
  const copy = BRIDGE_COPY[language];
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const client = getClient();

  const [config, setConfig] = useState<BridgeConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [fromChain, setFromChain] = useState<BridgeChain | null>(null);
  const [toChain, setToChain] = useState<BridgeChain | null>(null);
  const [amount, setAmount] = useState(() => seededAmount(initial?.amount));
  const [quote, setQuote] = useState<BridgeQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [transfer, setTransfer] = useState<BridgeTransfer | null>(null);
  const [signing, setSigning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollTrouble, setPollTrouble] = useState(false);
  const intentKey = useRef(newIntentKey());

  useEffect(() => {
    let cancelled = false;
    client
      .getBridgeConfig()
      .then((loaded) => {
        if (cancelled) return;
        setConfig(loaded);
        const sources = bridgeSourceChains(loaded);
        const from = oneOf(sources, initial?.fromChain) ?? sources[0] ?? null;
        const targets = from ? bridgeTargetChains(loaded, from) : [];
        setFromChain(from);
        setToChain(oneOf(targets, initial?.toChain) ?? targets[0] ?? null);
      })
      .catch((error: unknown) => !cancelled && setConfigError(errorText(error, copy)));
    return () => {
      cancelled = true;
    };
    // The config is read once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const sources = useMemo(() => (config ? bridgeSourceChains(config) : []), [config]);
  const targets = useMemo(() => (config && fromChain ? bridgeTargetChains(config, fromChain) : []), [config, fromChain]);

  const balance = useMemo(() => {
    if (walletBalance.step !== 'loaded' || !fromChain) return null;
    const usdc = walletBalance.data.balances.find((b) => (b.chain ?? 'STELLAR') === fromChain && b.code === 'USDC');
    return usdc ? (usdc.available ?? usdc.balance) : '0';
  }, [walletBalance, fromChain]);

  const amountValid = AMOUNT.test(amount) && Number(amount) > 0;
  const overBalance = amountValid && balance !== null && Number(amount) > Number(balance);
  const formError =
    configError ??
    quoteError ??
    (amount && !amountValid ? copy.invalidAmount : null) ??
    (overBalance ? copy.overBalance : null);

  // A quote for every change of direction or amount, once the user stops typing.
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!fromChain || !toChain || !amountValid) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setQuoting(true);
      client
        .quoteBridge({ fromChain, toChain, amount })
        .then((next) => !cancelled && setQuote(next))
        .catch((error: unknown) => !cancelled && setQuoteError(errorText(error, copy)))
        .finally(() => !cancelled && setQuoting(false));
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fromChain, toChain, amount, amountValid]);

  // Follows the transfer while it moves on its own; stops at a step that waits on the user.
  useEffect(() => {
    if (!transfer || isBridgeSettled(transfer)) return;
    const controller = new AbortController();
    client
      .pollBridgeTransfer(transfer.id, {
        signal: controller.signal,
        onUpdate: (next) => {
          setPollTrouble(false);
          setTransfer(next);
        },
        onError: () => setPollTrouble(true),
        // A co-signed step moves once the device approves: keep reading through it.
        until: (next) => next.status === 'AWAITING_ACTION' && next.pendingAction?.kind === 'SIGNATURE',
      })
      .then((settled) => {
        if (settled.status === 'COMPLETED') void refreshWalletBalance();
      })
      .catch(() => {
        // Aborted on close or on a new transfer.
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, transfer?.id, transfer?.pendingAction?.actionId]);

  // Heard once per transfer, whichever read first saw it complete.
  const reported = useRef<string | null>(null);
  const onSuccess = initial?.onSuccess;
  useEffect(() => {
    if (transfer?.status !== 'COMPLETED' || reported.current === transfer.id) return;
    reported.current = transfer.id;
    onSuccess?.(transfer);
  }, [transfer, onSuccess]);

  async function submit() {
    if (!fromChain || !toChain || !amountValid || overBalance) return;
    setSubmitting(true);
    setQuoteError(null);
    try {
      const started = await client.bridge({ fromChain, toChain, amount, idempotencyKey: intentKey.current });
      setTransfer(started);
    } catch (error) {
      setQuoteError(errorText(error, copy));
    } finally {
      setSubmitting(false);
    }
  }

  async function authorize() {
    const action = transfer?.pendingAction;
    if (!transfer || action?.kind !== 'SIGNATURE') return;
    setSigning(true);
    setActionError(null);
    try {
      setTransfer(await signStepWithWallet(client, transfer.id, action.actionId, copy));
    } catch (error) {
      setActionError(error instanceof Error && !isPollarApiError(error) ? error.message : errorText(error, copy));
      // The step may have changed meanwhile: read it again.
      client
        .getBridgeTransfer(transfer.id)
        .then(setTransfer)
        .catch(() => {});
    } finally {
      setSigning(false);
    }
  }

  function newBridge() {
    intentKey.current = newIntentKey();
    setTransfer(null);
    setAmount('');
    setActionError(null);
    void refreshWalletBalance();
  }

  const step: BridgeModalStep = transfer
    ? 'transfer'
    : !config && !configError
      ? 'loading'
      : config && (!config.available || sources.length === 0)
        ? 'unavailable'
        : 'form';

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={onClose}>
      <BridgeModalTemplate
        theme={theme}
        accentColor={accentColor}
        styleOverrides={styleOverrides}
        step={step}
        unavailableReason={config?.reason === 'mainnet_only' ? 'mainnet_only' : config ? 'no_directions' : null}
        sources={sources}
        targets={targets}
        fromChain={fromChain}
        toChain={toChain}
        onFromChange={(chain) => {
          setFromChain(chain);
          const next = config ? bridgeTargetChains(config, chain) : [];
          if (!toChain || !next.includes(toChain)) setToChain(next[0] ?? null);
        }}
        onToChange={setToChain}
        amount={amount}
        onAmountChange={(value) => setAmount(value.replace(',', '.').trim())}
        balance={balance}
        onMax={() => balance !== null && setAmount(balance.replace(/(\.\d{6})\d+$/, '$1'))}
        quote={quote}
        quoting={quoting}
        formError={formError}
        canSubmit={!!quote && !quoting && amountValid && !overBalance}
        submitting={submitting}
        onSubmit={() => void submit()}
        transfer={transfer}
        signing={signing}
        onAuthorize={() => void authorize()}
        onApprove={openCosignModal}
        actionError={actionError}
        pollTrouble={pollTrouble}
        onNewBridge={newBridge}
        onClose={onClose}
        language={language}
      />
    </div>
  );
}
