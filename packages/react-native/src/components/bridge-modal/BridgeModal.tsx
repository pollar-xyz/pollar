import {
  assertRampStellarSigner,
  bridgeSourceChains,
  bridgeTargetChains,
  isBridgeSettled,
  isPollarApiError,
  type BridgeChain,
  type BridgeConfig,
  type BridgeQuote,
  type BridgeTransfer,
  type PollarClient,
  type RampSigningHandler,
} from '@pollar/core';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import { PollarModalFooter } from '../commons';
import { useSurfaceColors } from '../layout';
import { ActionButton, Card, Choice, Field, Label, useNativeColors } from '../native-ui';
import { BRIDGE_COPY, type BridgeCopy } from './bridge-copy';

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

export interface BridgeModalProps {
  onClose: () => void;
  visible?: boolean;
  initial?: BridgeModalOptions | undefined;
}

const CHAIN_LABEL: Record<BridgeChain, string> = { STELLAR: 'Stellar', SOLANA: 'Solana', POLYGON: 'Polygon' };
/** Mainnet explorers: the bridge runs on mainnet only. */
const EXPLORER: Record<BridgeChain, (hash: string) => string> = {
  STELLAR: (hash) => `https://stellar.expert/explorer/public/tx/${hash}`,
  SOLANA: (hash) => `https://solscan.io/tx/${hash}`,
  POLYGON: (hash) => `https://polygonscan.com/tx/${hash}`,
};
const AMOUNT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const QUOTE_DEBOUNCE_MS = 400;

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);

/** What the server refused, in the user's words. */
function errorText(error: unknown, copy: BridgeCopy): string {
  if (!isPollarApiError(error)) return copy.errors.generic;
  const reason = typeof error.body.reason === 'string' ? error.body.reason : null;
  const chain = typeof error.body.chain === 'string' ? (CHAIN_LABEL[error.body.chain as BridgeChain] ?? '') : '';
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

/** Signs a bridge step with the user's connected Stellar wallet, lent as the signer while it does (as the ramp widget does). */
async function signStepWithWallet(client: PollarClient, transferId: string, actionId: string, copy: BridgeCopy) {
  const lent: Array<() => void> = [];
  const handler: RampSigningHandler = async (action) => {
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
  };
  try {
    lent.push(client.registerRampSigningHandler('STELLAR', 'xdr', handler));
  } catch {
    // The app registered its own Stellar signer: that one signs.
  }
  try {
    return await client.signBridgeStep(transferId, actionId);
  } finally {
    for (const release of lent) release();
  }
}

function newIntentKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Moves USDC between the user's wallets on Stellar, Solana and Polygon (mainnet). The web SDK's BridgeModal, native. */
export function BridgeModal({ onClose, visible = true, initial }: BridgeModalProps) {
  const { getClient, walletBalance, refreshWalletBalance, openCosignModal } = usePollar();
  const language = useModalLanguage();
  const copy = BRIDGE_COPY[language];
  const surface = useSurfaceColors();
  const c = useNativeColors();
  const client = getClient();

  const [config, setConfig] = useState<BridgeConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [fromChain, setFromChain] = useState<BridgeChain | null>(null);
  const [toChain, setToChain] = useState<BridgeChain | null>(null);
  const [amount, setAmount] = useState(() =>
    /^\d+(\.\d+)?$/.test(initial?.amount?.trim() ?? '') ? initial!.amount!.trim() : '',
  );
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
        const from = (initial?.fromChain && sources.includes(initial.fromChain) ? initial.fromChain : sources[0]) ?? null;
        const targets = from ? bridgeTargetChains(loaded, from) : [];
        setFromChain(from);
        setToChain((initial?.toChain && targets.includes(initial.toChain) ? initial.toChain : targets[0]) ?? null);
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
      setTransfer(await client.bridge({ fromChain, toChain, amount, idempotencyKey: intentKey.current }));
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

  const muted = { color: c.muted, fontSize: 13 } as const;
  const errorStyle = { color: '#d84a53' } as const;
  const signingNote =
    quote?.signing === 'EXTERNAL'
      ? copy.signingExternal
      : quote?.signing === 'COSIGNED' || quote?.signing === 'SELF_CUSTODY'
        ? copy.signingCosigned
        : copy.signingInternal;

  let body: React.ReactNode;
  if (transfer) {
    const names = {
      from: CHAIN_LABEL[transfer.fromChain],
      to: CHAIN_LABEL[transfer.toChain],
      amount: transfer.amountOut ?? transfer.amount,
    };
    const reached = [
      [fill(copy.steps.burn, names), !!transfer.burnTxHash],
      [copy.steps.attest, transfer.status === 'ATTESTED' || transfer.status === 'COMPLETED' || !!transfer.mintTxHash],
      [fill(copy.steps.mint, names), transfer.status === 'COMPLETED'],
    ] as const;
    body = (
      <Card title={copy.statusTitle[transfer.status]}>
        <Label>{fill(copy.statusBody[transfer.status], names)}</Label>
        {reached.map(([label, done]) => (
          <Text key={label} style={{ color: done ? c.text : c.muted, fontSize: 15 }}>
            {done ? '●' : '○'} {label}
          </Text>
        ))}
        {transfer.pendingAction?.kind === 'SIGNATURE' && (
          <ActionButton
            title={signing ? copy.waitingWallet : copy.authorize}
            disabled={signing}
            onPress={() => void authorize()}
          />
        )}
        {transfer.pendingAction?.kind === 'COSIGN_APPROVAL' && (
          <ActionButton title={copy.approveOnDevice} onPress={openCosignModal} />
        )}
        {!!actionError && (
          <Text accessibilityRole="alert" style={errorStyle}>
            {actionError}
          </Text>
        )}
        {pollTrouble && <Text style={muted}>{copy.pollTrouble}</Text>}
        {transfer.burnTxHash && (
          <Text
            accessibilityRole="link"
            style={{ color: c.accent }}
            onPress={() => void Linking.openURL(EXPLORER[transfer.fromChain](transfer.burnTxHash!))}
          >
            {fill(copy.viewBurn, { chain: names.from })}
          </Text>
        )}
        {transfer.mintTxHash && (
          <Text
            accessibilityRole="link"
            style={{ color: c.accent }}
            onPress={() => void Linking.openURL(EXPLORER[transfer.toChain](transfer.mintTxHash!))}
          >
            {fill(copy.viewMint, { chain: names.to })}
          </Text>
        )}
        {(transfer.status === 'COMPLETED' || transfer.status === 'FAILED') && (
          <>
            <ActionButton title={copy.newBridge} onPress={newBridge} />
            <ActionButton title={copy.done} onPress={onClose} />
          </>
        )}
      </Card>
    );
  } else if (!config && !configError) {
    body = <ActivityIndicator accessibilityLabel={copy.loading} />;
  } else if (config && (!config.available || sources.length === 0)) {
    body = <Label>{config.reason === 'mainnet_only' ? copy.mainnetOnly : copy.noDirections}</Label>;
  } else {
    body = (
      <Card title={copy.title}>
        {fromChain && (
          <Choice
            label={copy.from}
            options={sources}
            labels={CHAIN_LABEL}
            value={fromChain}
            disabled={submitting}
            onChange={(chain) => {
              setFromChain(chain);
              const next = config ? bridgeTargetChains(config, chain) : [];
              if (!toChain || !next.includes(toChain)) setToChain(next[0] ?? null);
            }}
          />
        )}
        {toChain && (
          <Choice
            label={copy.to}
            options={targets}
            labels={CHAIN_LABEL}
            value={toChain}
            disabled={submitting}
            onChange={setToChain}
          />
        )}
        <Field
          label={copy.amount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          value={amount}
          editable={!submitting}
          onChangeText={(value) => setAmount(value.replace(',', '.').trim())}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={muted}>
            {copy.balance} {balance ?? '—'}
          </Text>
          {balance !== null && (
            <Text
              accessibilityRole="button"
              style={{ color: c.accent, fontWeight: '600' }}
              onPress={() => setAmount(balance.replace(/(\.\d{6})\d+$/, '$1'))}
            >
              {copy.max}
            </Text>
          )}
        </View>
        {quoting && <Text style={muted}>{copy.quoting}</Text>}
        {quote && !quoting && (
          <View style={{ gap: 4 }}>
            <Text style={{ color: c.text }}>
              {copy.youReceive}: {quote.amountOut} USDC · {CHAIN_LABEL[quote.toChain]}
            </Text>
            <Text style={{ color: c.text }}>
              {copy.fee}: {quote.fee ? `${quote.fee.amount} USD` : copy.noFee}
            </Text>
            <Text style={{ color: c.text }}>
              {copy.eta}: {fill(copy.etaValue, { minutes: String(Math.max(1, Math.round(quote.etaSeconds / 60))) })}
            </Text>
            <Text style={muted}>{signingNote}</Text>
          </View>
        )}
        {!!formError && (
          <Text accessibilityRole="alert" style={errorStyle}>
            {formError}
          </Text>
        )}
        <ActionButton
          title={submitting ? copy.starting : copy.bridgeButton}
          disabled={!quote || quoting || !amountValid || overBalance || submitting}
          onPress={() => void submit()}
        />
      </Card>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: surface.bg }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 16 }}>
              <ActionButton title={copy.close} onPress={onClose} />
              {body}
              <PollarModalFooter language={language} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
