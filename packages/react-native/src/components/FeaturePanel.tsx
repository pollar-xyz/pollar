import React, { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type {
  RampRoute,
  DistributionRule,
  EarnOpportunity,
  EarnProviderId,
  EarnPosition,
  SolanaSwapQuote,
  SwapQuote,
  SwapToken,
  WalletChain,
  EnabledAssetRecord,
  RampDirection,
  RampOrder,
  RampQuote,
  RampSignatureAction,
} from '@pollar/core';
import {
  describeRampAction,
  isRampOrderSettled,
  rampLegStatus,
  rampLegTitle,
  rampQuoteFields,
  rampOrderResolutionText,
} from '@pollar/core';
import { usePollar } from '../context';
import { useModalLanguage } from '../language';
import { FEATURE_COPY } from './feature-copy';
import { ActionButton, ActionState, Card, Choice, Field, Label, ResultView, useAction } from './native-ui';

export type FeatureName =
  | 'authentication'
  | 'logout'
  | 'chains'
  | 'wallet'
  | 'transactions'
  | 'send'
  | 'receive'
  | 'assets'
  | 'history'
  | 'sessions'
  | 'kyc'
  | 'ramp'
  | 'swap'
  | 'earn'
  | 'distribution';
export function ChainSelect({ value, onChange }: { value: WalletChain; onChange: (value: WalletChain) => void }) {
  const { wallets } = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const chains = [...new Set(wallets.map((w) => w.chain ?? 'STELLAR'))];
  return <Choice label={copy.chain} value={value} options={chains.length ? chains : ['STELLAR']} onChange={onChange} />;
}
export function AssetSelect({
  assets,
  value,
  onChange,
}: {
  assets: EnabledAssetRecord[];
  value: string;
  onChange: (value: string) => void;
}) {
  const copy = FEATURE_COPY[useModalLanguage()];
  return <Choice label={copy.asset} value={value} options={assets.map(assetKey)} onChange={onChange} />;
}
export const assetKey = (asset: { chain?: WalletChain; code: string; issuer?: string }) =>
  [asset.chain ?? 'STELLAR', asset.code, asset.issuer ?? 'native'].join(':');

/** Where the send modal opens: a starting point the user can change, never a lock. */
export interface SendModalOptions {
  chain?: WalletChain;
  /** Asset code, e.g. 'USDC'; the native asset when left out or not enabled on that chain. */
  asset?: string;
  destination?: string;
  amount?: string;
  /** Stellar only. */
  memo?: string;
  memoType?: 'text' | 'id' | 'hash';
  /** Called once per transaction the modal sends that lands. */
  onSuccess?: (result: { hash: string }) => void;
}

/** Where the swap modal opens. */
export interface SwapModalOptions {
  /** A network the app has swap venues on; the first one when left out or not offered. */
  chain?: 'STELLAR' | 'SOLANA';
  /** Asset codes, e.g. 'XLM' and 'USDC'. */
  sell?: string;
  buy?: string;
  amount?: string;
  onSuccess?: (result: { hash: string }) => void;
}

/** Where the earn modal opens. */
export interface EarnModalOptions {
  provider?: EarnProviderId;
  opportunityId?: string;
  tab?: 'deposit' | 'withdraw';
  amount?: string;
  onSuccess?: (result: { hash: string }) => void;
}

/** Where the receive modal opens. */
export interface ReceiveModalOptions {
  chain?: WalletChain;
}

/** The options a feature panel opens on, by feature. */
export interface FeatureInitial {
  send?: SendModalOptions;
  receive?: ReceiveModalOptions;
  swap?: SwapModalOptions;
  earn?: EarnModalOptions;
}

const DECIMAL = /^\d+(\.\d+)?$/;
/** A seeded amount, or '' when it is not a plain decimal. */
const seededAmount = (amount: string | undefined) => (DECIMAL.test(amount?.trim() ?? '') ? amount!.trim() : '');
const sameCode = (code: string, wanted: string | undefined) =>
  wanted !== undefined && code.toUpperCase() === wanted.trim().toUpperCase();

type MemoType = 'text' | 'id' | 'hash';
const MEMO_TYPES: readonly MemoType[] = ['text', 'id', 'hash'];
const MAX_MEMO_ID = 18446744073709551615n;
/** UTF-8 length without TextEncoder, which older Hermes builds lack. */
const utf8Length = (value: string) => encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, 'x').length;
/**
 * A Stellar memo as the build endpoint takes it, undefined when the field is
 * empty, or the error to show. Text is capped at 28 bytes on-chain; an ID is an
 * unsigned 64-bit integer; a hash is 32 bytes written as 64 hex characters.
 */
function parseMemo(
  type: MemoType,
  raw: string,
  copy: (typeof FEATURE_COPY)['en']['send'],
): { type: MemoType; value: string } | undefined | string {
  const value = type === 'text' ? raw : raw.trim();
  if (value.trim() === '') return undefined;
  if (type === 'text') return utf8Length(value) > 28 ? copy.memoTextTooLong : { type, value };
  if (type === 'hash') return /^[0-9a-fA-F]{64}$/.test(value) ? { type, value } : copy.memoHashInvalid;
  if (!/^\d+$/.test(value) || BigInt(value) > MAX_MEMO_ID) return copy.memoIdInvalid;
  return { type, value };
}

/**
 * Calls `onSuccess` once for each transaction this panel started that reaches
 * `success`, including one that was still pending when its call returned.
 * `arm()` marks the start of such a transaction.
 */
function useSuccessCallback(onSuccess: ((result: { hash: string }) => void) | undefined) {
  const p = usePollar();
  const armed = useRef(false);
  const reported = useRef(new Set<string>());
  const hash = p.tx.step === 'success' ? p.tx.hash : null;
  useEffect(() => {
    if (!armed.current || !hash || reported.current.has(hash)) return;
    reported.current.add(hash);
    armed.current = false;
    onSuccess?.({ hash });
  }, [hash, onSuccess]);
  return () => {
    armed.current = true;
  };
}

export function AuthPanel() {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  const [provider, setProvider] = useState('Pollar');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const pending = useRef('');
  const generation = useRef(0);
  const client = p.getClient();
  useEffect(() => {
    const off = client.onAuthStateChange((state) => {
      if (state.step === 'entering_email' && pending.current) {
        const address = pending.current;
        pending.current = '';
        client.sendEmailCode(address);
      }
    });
    return () => {
      generation.current++;
      pending.current = '';
      off();
      client.cancelLogin();
    };
  }, [client]);
  async function send() {
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error(copy.auth.invalidEmail);
    if (provider === 'Privy') {
      await p.privyAdapter!.sendEmailCode(email);
      setSent(true);
    } else {
      pending.current = email;
      client.beginEmailLogin();
      setSent(true);
    }
  }
  async function verify() {
    if (!code.trim()) throw new Error(copy.auth.missingCode);
    const current = generation.current;
    if (provider === 'Privy') {
      await p.privyAdapter!.verifyEmailCode(code);
      if (current === generation.current) p.login({ provider: p.privyAdapter!.type });
    } else client.verifyEmailCode(code);
  }
  async function social(name: 'google' | 'github') {
    const current = generation.current;
    if (provider === 'Privy') {
      await p.privyAdapter!.loginWithOAuth(name);
      if (current === generation.current) p.login({ provider: p.privyAdapter!.type });
    } else p.login({ provider: name });
  }
  const authBusy = !['idle', 'error', 'entering_email', 'entering_code', 'authenticated'].includes(p.authState.step);
  return (
    <Card title={copy.auth.title}>
      {p.isAuthenticated ? (
        <>
          <Label>{p.verified ? copy.auth.verified : copy.auth.restoring}</Label>
          <ResultView value={p.wallet} />
          <ActionButton title={copy.auth.logOut} disabled={action.busy} onPress={() => void action.run(p.logout)} />
        </>
      ) : (
        <>
          {p.privyAdapter && (
            <Choice
              label={copy.provider}
              options={['Pollar', 'Privy']}
              value={provider}
              onChange={(value) => {
                generation.current++;
                client.cancelLogin();
                setProvider(value);
                setSent(false);
                setCode('');
              }}
            />
          )}
          <Field label={copy.auth.email} keyboardType="email-address" value={email} onChangeText={setEmail} />
          <ActionButton
            title={sent ? copy.auth.resendCode : copy.auth.sendCode}
            disabled={action.busy || authBusy}
            onPress={() => void action.run(send)}
          />
          {sent && (
            <>
              <Field label={copy.auth.code} keyboardType="number-pad" value={code} onChangeText={setCode} />
              <ActionButton
                title={copy.auth.verifyCode}
                disabled={action.busy || authBusy}
                onPress={() => void action.run(verify)}
              />
            </>
          )}
          {(['google', 'github'] as const)
            .filter((name) => provider === 'Privy' || p.styles.providers?.[name])
            .map((name) => (
              <ActionButton
                key={name}
                title={copy.auth.continueWith(name)}
                disabled={action.busy || authBusy}
                onPress={() => void action.run(() => social(name))}
              />
            ))}
          <ActionButton
            title={copy.auth.cancel}
            onPress={() => {
              generation.current++;
              pending.current = '';
              client.cancelLogin();
              setSent(false);
            }}
          />
          <Label>{p.authState.step}</Label>
          {p.authState.step === 'error' && <ResultView value={p.authState} />}
        </>
      )}
      <ActionState action={action} />
    </Card>
  );
}

export function WalletPanel() {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  useEffect(() => {
    if (p.verified) void action.run(p.refreshWalletBalance);
  }, [p.verified]);
  return (
    <Card title={copy.wallet.title}>
      {p.wallets.map((wallet) => (
        <View key={(wallet.chain ?? 'STELLAR') + wallet.address} style={{ gap: 8 }}>
          <Label>
            {wallet.chain ?? 'STELLAR'} · {wallet.custody}
          </Label>
          <ResultView value={wallet.address} />
          <ActionButton
            title={copy.copyChainAddress(wallet.chain ?? 'STELLAR')}
            onPress={() =>
              void action.run(async () => {
                await p.copyText(wallet.address);
                return copy.copied;
              })
            }
          />
        </View>
      ))}
      <ActionButton
        title={copy.wallet.refresh}
        disabled={action.busy}
        onPress={() => void action.run(p.refreshWalletBalance)}
      />
      {p.walletBalance.step === 'loaded' ? (
        p.walletBalance.data.balances.map((b) => (
          <Label key={assetKey(b)}>
            {b.chain ?? 'STELLAR'} · {b.code}: {b.balance ?? copy.wallet.unavailable}
          </Label>
        ))
      ) : (
        <ResultView value={p.walletBalance} />
      )}
      <ActionState action={action} />
    </Card>
  );
}
export function ReceivePanel({ initial }: { initial?: ReceiveModalOptions | undefined }) {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  const seededChain = p.wallets.some((w) => (w.chain ?? 'STELLAR') === initial?.chain) ? initial?.chain : undefined;
  const [chain, setChain] = useState<WalletChain>(seededChain ?? 'STELLAR');
  const address = p.wallets.find((w) => (w.chain ?? 'STELLAR') === chain)?.address;
  return (
    <Card title={copy.receive.title}>
      <ChainSelect value={chain} onChange={setChain} />
      {p.recoveryLocked ? (
        // A locked wallet signs nothing, so funds sent to it now could not leave.
        <>
          <Label>{copy.receive.locked}</Label>
          <ActionButton title={copy.receive.setUpRecovery} onPress={p.openRecoveryModal} />
        </>
      ) : address ? (
        <>
          <View style={{ padding: 16, backgroundColor: '#fff', alignSelf: 'center', borderRadius: 16 }}>
            <QRCode value={address} size={200} />
          </View>
          <ResultView value={address} />
          <ActionButton
            title={copy.copyAddress}
            onPress={() =>
              void action.run(async () => {
                await p.copyText(address);
                return copy.copied;
              })
            }
          />
        </>
      ) : (
        <Label>{copy.receive.noWallet}</Label>
      )}
      <ActionState action={action} />
    </Card>
  );
}
export function SendPanel({ initial }: { initial?: SendModalOptions | undefined }) {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  const seededChain = p.wallets.some((w) => (w.chain ?? 'STELLAR') === initial?.chain) ? initial?.chain : undefined;
  const [chain, setChain] = useState<WalletChain>(seededChain ?? 'STELLAR');
  const [destination, setDestination] = useState(initial?.destination?.trim() ?? '');
  const [amount, setAmount] = useState(seededAmount(initial?.amount));
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [memoType, setMemoType] = useState<MemoType>(
    MEMO_TYPES.includes(initial?.memoType as MemoType) ? (initial!.memoType as MemoType) : 'text',
  );
  const [selected, setSelected] = useState('');
  const [review, setReview] = useState(false);
  const arm = useSuccessCallback(initial?.onSuccess);
  // Picked once the enabled assets load; the user changing chain or token first drops it.
  const assetSeed = useRef(initial?.asset);
  const assets =
    p.enabledAssets.step === 'loaded' ? p.enabledAssets.data.assets.filter((a) => (a.chain ?? 'STELLAR') === chain) : [];
  useEffect(() => {
    if (p.verified) void action.run(p.refreshAssets);
  }, [p.verified]);
  useEffect(() => {
    if (assetSeed.current === undefined || p.enabledAssets.step !== 'loaded') return;
    const match = assets.find((a) => a.issuer && a.issuer !== '0' && sameCode(a.code, assetSeed.current));
    assetSeed.current = undefined;
    if (match) setSelected(assetKey(match));
  }, [p.enabledAssets]);
  const asset = assets.find((a) => assetKey(a) === selected);
  async function send() {
    if (!destination.trim() || !/^(?:\d+)(?:\.\d+)?$/.test(amount) || Number(amount) <= 0) throw new Error(copy.send.invalid);
    if (chain === 'STELLAR') {
      const parsedMemo = parseMemo(memoType, memo, copy.send);
      if (typeof parsedMemo === 'string') throw new Error(parsedMemo);
      const options = parsedMemo ? { options: { memo: parsedMemo } } : {};
      if (asset?.issuer && asset.issuer !== '0')
        return p.sendPayment({
          destination: destination.trim(),
          amount,
          asset: {
            type: asset.code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12',
            code: asset.code,
            issuer: asset.issuer,
          },
          ...options,
        });
      return p.sendPayment({ destination: destination.trim(), amount, asset: { type: 'native' }, ...options });
    }
    if (p.wallet?.provider === 'privy') throw new Error(copy.privyStellarOnly);
    if (!/^\d+$/.test(amount)) throw new Error(copy.send.baseUnits);
    return p.sendPayment({ chain, destination: destination.trim(), amount, ...(asset?.issuer ? { mint: asset.issuer } : {}) });
  }
  return (
    <Card title={copy.send.title}>
      <ChainSelect
        value={chain}
        onChange={(v) => {
          assetSeed.current = undefined;
          setChain(v);
          setSelected('');
          setReview(false);
        }}
      />
      <Choice
        label={copy.send.token}
        labels={{ Native: copy.send.native }}
        options={['Native', ...assets.filter((a) => a.issuer && a.issuer !== '0').map(assetKey)]}
        value={selected || 'Native'}
        onChange={(v) => {
          assetSeed.current = undefined;
          setSelected(v);
          setReview(false);
        }}
      />
      <Field
        label={copy.send.destination}
        value={destination}
        onChangeText={(v) => {
          setDestination(v);
          setReview(false);
        }}
      />
      <Field
        label={chain === 'STELLAR' ? copy.amount : copy.send.amountBaseUnits}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(v) => {
          setAmount(v);
          setReview(false);
        }}
      />
      {chain === 'STELLAR' && (
        <>
          <Choice
            label={copy.send.memoType}
            labels={copy.send.memoTypes}
            options={MEMO_TYPES}
            value={memoType}
            onChange={(v) => {
              setMemoType(v);
              setReview(false);
            }}
          />
          <Field
            label={copy.send.memo}
            value={memo}
            onChangeText={(v) => {
              setMemo(v);
              setReview(false);
            }}
          />
        </>
      )}
      {review && <Label>{copy.send.review(p.network, amount, asset?.code ?? copy.send.nativeAsset, destination)}</Label>}
      <ActionButton
        title={review ? copy.confirmPayment : copy.reviewPayment}
        disabled={action.busy || !p.verified}
        onPress={() =>
          review
            ? void action.run(async () => {
                arm();
                const result = await send();
                setReview(false);
                return result;
              })
            : setReview(true)
        }
      />
      <TransactionStatus />
      <ActionState action={action} />
    </Card>
  );
}
export function TransactionStatus() {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  const hash = 'hash' in p.tx ? p.tx.hash : undefined;
  return (
    <View style={{ gap: 8 }}>
      <Label>
        {copy.transaction}: {p.tx.step}
      </Label>
      <ResultView value={p.tx} />
      {hash && (
        <>
          <ActionButton
            title={copy.copyHash}
            onPress={() =>
              void action.run(async () => {
                await p.copyText(hash);
                return copy.copied;
              })
            }
          />
          <ActionButton
            title={copy.checkConfirmation}
            disabled={action.busy}
            onPress={() => void action.run(() => p.getClient().getTxStatus(hash))}
          />
        </>
      )}
      <ActionState action={action} />
    </View>
  );
}
export function TransactionPanel() {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  const [xdr, setXdr] = useState('');
  const [signed, setSigned] = useState('');
  const [submissionToken, setSubmissionToken] = useState<string>();
  const [operation, setOperation] = useState<
    'payment' | 'create_account' | 'change_trust' | 'invoke_contract' | 'path_payment_strict_send'
  >('payment');
  const [parameters, setParameters] = useState('{"destination":"","amount":"1","asset":{"type":"native"}}');
  const builtXdr = 'buildData' in p.tx ? p.tx.buildData?.unsignedXdr : undefined;
  useEffect(() => {
    if (builtXdr) {
      setXdr(builtXdr);
      setSigned('');
      setSubmissionToken(undefined);
    }
  }, [builtXdr]);
  return (
    <Card title={copy.playground.title}>
      <Label>{copy.playground.intro}</Label>
      <Choice
        label={copy.playground.operation}
        value={operation}
        options={['payment', 'create_account', 'change_trust', 'invoke_contract', 'path_payment_strict_send']}
        onChange={setOperation}
      />
      <Field
        label={copy.playground.parameters}
        multiline
        value={parameters}
        onChangeText={setParameters}
        editable={!action.busy}
      />
      <ActionButton
        title={copy.playground.build}
        disabled={action.busy || !p.verified}
        onPress={() =>
          void action.run(async () => {
            const params: unknown = JSON.parse(parameters);
            if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error(copy.playground.notObject);
            return p.getClient().buildTx(operation, params as Parameters<typeof p.buildTx>[1]);
          })
        }
      />
      <TransactionStatus />
      <Field
        label={copy.playground.xdr}
        multiline
        value={xdr}
        onChangeText={(v) => {
          setXdr(v);
          setSigned('');
          setSubmissionToken(undefined);
        }}
      />
      <ActionButton
        title={copy.playground.sign}
        disabled={action.busy || !xdr || !p.verified}
        onPress={() =>
          void action.run(async () => {
            const result = await p.signTx(xdr);
            if (result.status === 'signed') {
              setSigned(result.signedXdr);
              setSubmissionToken(result.submissionToken);
            }
            return result;
          })
        }
      />
      <ActionButton
        title={copy.playground.submit}
        disabled={action.busy || !signed || !p.verified}
        onPress={() => void action.run(() => p.submitTx(signed, submissionToken ? { submissionToken } : undefined))}
      />
      <ActionButton title={copy.playground.openPayment} onPress={p.openSendModal} />
      <ActionState action={action} />
    </Card>
  );
}
export function AssetsPanel() {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  useEffect(() => {
    void action.run(p.refreshAssets);
  }, []);
  return (
    <Card title={copy.assets.title}>
      <ActionButton title={copy.assets.refresh} disabled={action.busy} onPress={() => void action.run(p.refreshAssets)} />
      {p.enabledAssets.step === 'loaded' ? (
        p.enabledAssets.data.assets.map((a) => (
          <View key={assetKey(a)} style={{ gap: 8 }}>
            <Label>
              {a.chain ?? 'STELLAR'} · {a.code} · {a.trustlineEstablished ? copy.assets.enabled : copy.assets.available}
            </Label>
            {(a.chain ?? 'STELLAR') === 'STELLAR' && a.issuer && a.issuer !== '0' && !a.trustlineEstablished && (
              <ActionButton
                title={copy.assets.enable(a.code)}
                disabled={action.busy}
                onPress={() => void action.run(() => p.setTrustline({ code: a.code, issuer: a.issuer! }))}
              />
            )}
          </View>
        ))
      ) : (
        <ResultView value={p.enabledAssets} />
      )}
      <ActionState action={action} />
    </Card>
  );
}
export function HistoryPanel() {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  const [chain, setChain] = useState<WalletChain>(p.wallets[0]?.chain ?? 'STELLAR');
  useEffect(() => {
    void action.run(() => p.fetchTxHistory({ chain }));
  }, [chain]);
  return (
    <Card title={copy.history.title}>
      <ChainSelect value={chain} onChange={setChain} />
      <ActionButton
        title={copy.history.refresh}
        disabled={action.busy}
        onPress={() => void action.run(() => p.fetchTxHistory({ chain }))}
      />
      <ResultView value={p.txHistory} />
      <ActionState action={action} />
    </Card>
  );
}
export function SessionsPanel() {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  useEffect(() => {
    void action.run(p.fetchSessions);
  }, []);
  return (
    <Card title={copy.sessions.title}>
      <ActionButton title={copy.sessions.refresh} disabled={action.busy} onPress={() => void action.run(p.fetchSessions)} />
      {p.sessions.step === 'loaded' ? (
        p.sessions.sessions.map((s) => (
          <View key={s.familyId} style={{ gap: 8 }}>
            <Label>
              {s.deviceLabel ?? s.userAgent ?? copy.sessions.device}
              {s.current ? copy.sessions.thisDevice : ''}
            </Label>
            <Label>
              {copy.sessions.lastUsed} {s.lastUsedAt ?? s.createdAt}
            </Label>
            <ActionButton
              title={s.current ? copy.sessions.logOutDevice : copy.sessions.revoke}
              disabled={action.busy}
              onPress={() => void action.run(() => (s.current ? p.logout() : p.revokeSession(s.familyId)))}
            />
          </View>
        ))
      ) : (
        <ResultView value={p.sessions} />
      )}
      <ActionState action={action} />
    </Card>
  );
}
export function KycPreview() {
  const copy = FEATURE_COPY[useModalLanguage()];
  return (
    <Card title={copy.kyc.title}>
      <Label>{copy.kyc.preview}</Label>
      <Label>{copy.kyc.providers}</Label>
    </Card>
  );
}
type SwapChain = 'STELLAR' | 'SOLANA';
/** Solana's native SOL is swapped as wrapped SOL, 9 decimals. */
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_DECIMALS = 9;
/** A Solana swap side: the mint and its decimals. */
type SolanaSwapOption = { code: string; mint: string; decimals: number };
/** `1.5` with 6 decimals is `1500000`; null for anything that is not a positive decimal within those decimals. */
function toBaseUnits(amount: string, decimals: number): string | null {
  const trimmed = amount.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) return null;
  const units = BigInt(`${whole}${fraction.padEnd(decimals, '0')}`);
  return units > 0n ? units.toString() : null;
}
export function SwapPanel({ initial }: { initial?: SwapModalOptions | undefined }) {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  const [chains, setChains] = useState<SwapChain[] | null>(null);
  const [chain, setChain] = useState<SwapChain>(initial?.chain === 'SOLANA' ? 'SOLANA' : 'STELLAR');
  const [tokens, setTokens] = useState<SwapToken[]>([]);
  const [sell, setSell] = useState('');
  const [buy, setBuy] = useState('');
  const [amount, setAmount] = useState(seededAmount(initial?.amount));
  const [quotes, setQuotes] = useState<SwapQuote[]>([]);
  const [solanaQuotes, setSolanaQuotes] = useState<SolanaSwapQuote[]>([]);
  const arm = useSuccessCallback(initial?.onSuccess);
  // The asset options wait for a list that has them (tokens, balances and enabled assets load apart) until the user picks.
  const sellSeed = useRef(initial?.sell);
  const buySeed = useRef(initial?.buy);
  const chainSeed = useRef(initial?.chain);

  const balances = p.walletBalance.step === 'loaded' ? p.walletBalance.data.balances : [];
  const records = p.enabledAssets.step === 'loaded' ? p.enabledAssets.data.assets : [];
  const solanaSell: SolanaSwapOption[] = balances
    .filter((b) => b.chain === 'SOLANA' && (b.type === 'native' || (b.type === 'token' && !!b.issuer)))
    .flatMap((b) =>
      b.type === 'native'
        ? [{ code: 'SOL', mint: WRAPPED_SOL_MINT, decimals: SOL_DECIMALS }]
        : b.decimals !== undefined
          ? [{ code: b.code, mint: b.issuer!, decimals: b.decimals }]
          : [],
    );
  const solanaBuy: SolanaSwapOption[] = [
    { code: 'SOL', mint: WRAPPED_SOL_MINT, decimals: SOL_DECIMALS },
    ...records
      .filter((a) => a.chain === 'SOLANA' && a.type === 'token' && !!a.issuer && a.decimals !== undefined)
      .map((a) => ({ code: a.code, mint: a.issuer!, decimals: a.decimals! })),
  ];
  const tokenKey = (t: SwapToken) => assetKey(t);
  const sellKeys = chain === 'SOLANA' ? solanaSell.map((o) => o.mint) : tokens.map(tokenKey);
  const buyKeys = chain === 'SOLANA' ? solanaBuy.map((o) => o.mint) : tokens.map(tokenKey);
  const codeOf = (key: string) =>
    chain === 'SOLANA'
      ? ([...solanaSell, ...solanaBuy].find((o) => o.mint === key)?.code ?? key)
      : (tokens.find((t) => tokenKey(t) === key)?.code ?? key);
  const keyFor = (keys: string[], code: string | undefined) => keys.find((k) => sameCode(codeOf(k), code));

  useEffect(() => {
    const seeded = keyFor(sellKeys, sellSeed.current);
    if (seeded) {
      sellSeed.current = undefined;
      setSell(seeded);
    }
    const seededBuy = keyFor(buyKeys, buySeed.current);
    if (seededBuy) {
      buySeed.current = undefined;
      setBuy(seededBuy);
    }
  }, [sellKeys.join('|'), buyKeys.join('|')]);

  async function refreshSwap() {
    setQuotes([]);
    setSolanaQuotes([]);
    const [stellarVenues, solanaVenues] = await Promise.all([
      p.getSwapConfig().catch(() => []),
      p.getSolanaSwapConfig().catch(() => []),
    ]);
    const offered: SwapChain[] = [
      ...(stellarVenues.length > 0 ? (['STELLAR'] as const) : []),
      ...(solanaVenues.length > 0 ? (['SOLANA'] as const) : []),
    ];
    setChains(offered);
    // A network the app does not offer falls back to the first one it does.
    const wanted = chainSeed.current;
    chainSeed.current = undefined;
    setChain((current) => {
      const next = wanted && offered.includes(wanted) ? wanted : current;
      return offered.length === 0 || offered.includes(next) ? next : offered[0]!;
    });
    const t = await p.getSwapTokens();
    setTokens(t);
    if (solanaVenues.length > 0) await Promise.all([p.refreshWalletBalance(), p.refreshAssets()]);
    return stellarVenues;
  }
  useEffect(() => {
    void action.run(refreshSwap);
  }, []);
  const swapAsset = (t: SwapToken) =>
    !t.issuer || t.issuer === '0'
      ? { type: 'native' as const }
      : {
          type: t.code.length <= 4 ? ('credit_alphanum4' as const) : ('credit_alphanum12' as const),
          code: t.code,
          issuer: t.issuer,
        };
  function clearPicks() {
    sellSeed.current = undefined;
    buySeed.current = undefined;
    setSell('');
    setBuy('');
    setQuotes([]);
    setSolanaQuotes([]);
  }
  async function getQuotes() {
    if (chain === 'SOLANA') {
      const from = solanaSell.find((o) => o.mint === sell);
      const to = solanaBuy.find((o) => o.mint === buy);
      const units = from ? toBaseUnits(amount, from.decimals) : null;
      if (!from || !to || !units) throw new Error(copy.send.invalid);
      const q = await p.getSolanaSwapQuote({ inputMint: from.mint, outputMint: to.mint, amount: units, slippageBps: 50 });
      setSolanaQuotes(q);
      return q;
    }
    const q = await p.getSwapQuote({
      sellAsset: swapAsset(tokens.find((t) => tokenKey(t) === sell)!),
      buyAsset: swapAsset(tokens.find((t) => tokenKey(t) === buy)!),
      amount,
      slippageBps: 50,
    });
    setQuotes(q);
    return q;
  }
  const labels = Object.fromEntries([...sellKeys, ...buyKeys].map((k) => [k, codeOf(k)]));
  return (
    <Card title={copy.swap.title}>
      <ActionButton title={copy.swap.refresh} disabled={action.busy} onPress={() => void action.run(refreshSwap)} />
      {chains && chains.length > 1 && (
        <Choice
          label={copy.swap.network}
          options={chains}
          value={chain}
          onChange={(v) => {
            setChain(v);
            clearPicks();
          }}
        />
      )}
      <Choice
        label={copy.swap.sell}
        {...(chain === 'SOLANA' ? { labels } : {})}
        options={sellKeys}
        value={sell}
        onChange={(v) => {
          sellSeed.current = undefined;
          setSell(v);
          setQuotes([]);
          setSolanaQuotes([]);
        }}
      />
      <Choice
        label={copy.swap.buy}
        {...(chain === 'SOLANA' ? { labels } : {})}
        options={buyKeys}
        value={buy}
        onChange={(v) => {
          buySeed.current = undefined;
          setBuy(v);
          setQuotes([]);
          setSolanaQuotes([]);
        }}
      />
      <Field
        label={copy.amount}
        value={amount}
        keyboardType="decimal-pad"
        onChangeText={(v) => {
          setAmount(v);
          setQuotes([]);
          setSolanaQuotes([]);
        }}
      />
      <ActionButton
        title={copy.swap.getQuotes}
        disabled={action.busy || !sell || !buy || Number(amount) <= 0}
        onPress={() => void action.run(getQuotes)}
      />
      {quotes.map((q, i) => (
        <View key={i} style={{ gap: 8 }}>
          <ResultView value={q} />
          <ActionButton
            title={copy.swap.confirmVia(q.provider)}
            disabled={action.busy || !p.verified}
            onPress={() =>
              void action.run(async () => {
                setQuotes([]);
                arm();
                return p.swap(q, { autoTrustline: true });
              })
            }
          />
        </View>
      ))}
      {solanaQuotes.map((q, i) => (
        <View key={`sol-${i}`} style={{ gap: 8 }}>
          <ResultView value={q} />
          <ActionButton
            title={copy.swap.confirmVia(q.provider)}
            disabled={action.busy || !p.verified}
            onPress={() =>
              void action.run(async () => {
                setSolanaQuotes([]);
                arm();
                return p.swapSolana(q, { slippageBps: 50 });
              })
            }
          />
        </View>
      ))}
      {chain === 'STELLAR' && !tokens.length && <Label>{copy.swap.noTokens}</Label>}
      <TransactionStatus />
      <ActionState action={action} />
    </Card>
  );
}
export function EarnPanel({ initial }: { initial?: EarnModalOptions | undefined }) {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  const [providers, setProviders] = useState<EarnProviderId[]>([]);
  const [provider, setProvider] = useState<EarnProviderId>();
  const [opportunities, setOpportunities] = useState<EarnOpportunity[]>([]);
  const [opportunity, setOpportunity] = useState('');
  const [amount, setAmount] = useState(seededAmount(initial?.amount));
  const [position, setPosition] = useState<EarnPosition>();
  const [tab, setTab] = useState<'deposit' | 'withdraw'>(initial?.tab === 'withdraw' ? 'withdraw' : 'deposit');
  const [confirmation, setConfirmation] = useState(false);
  const arm = useSuccessCallback(initial?.onSuccess);
  // Applied to the first provider list that loads, then dropped.
  const seed = useRef(initial);
  async function refreshEarn() {
    setProvider(undefined);
    setOpportunities([]);
    setOpportunity('');
    setPosition(undefined);
    setConfirmation(false);
    const list = await p.getEarnProviders();
    setProviders(list);
    const wanted = seed.current;
    seed.current = undefined;
    if (wanted?.provider && list.includes(wanted.provider)) {
      setProvider(wanted.provider);
      const opps = await p.getEarnOpportunities(wanted.provider);
      setOpportunities(opps);
      if (wanted.opportunityId && opps.some((o) => o.id === wanted.opportunityId)) {
        setOpportunity(wanted.opportunityId);
        setPosition(await p.getEarnPosition({ provider: wanted.provider, opportunity: wanted.opportunityId }));
      }
    }
    return list;
  }
  useEffect(() => {
    void action.run(refreshEarn);
  }, []);
  return (
    <Card title={copy.earn.title}>
      <ActionButton title={copy.earn.refresh} disabled={action.busy} onPress={() => void action.run(refreshEarn)} />
      <Choice
        label={copy.provider}
        disabled={action.busy}
        options={providers}
        value={provider ?? ''}
        onChange={(v) => {
          void action.run(async () => {
            setProvider(v as EarnProviderId);
            setOpportunities([]);
            setOpportunity('');
            setPosition(undefined);
            setConfirmation(false);
            const list = await p.getEarnOpportunities(v as EarnProviderId);
            setOpportunities(list);
            return list;
          });
        }}
      />
      <Choice
        label={copy.earn.opportunity}
        disabled={action.busy}
        options={opportunities.map((o) => o.id)}
        value={opportunity}
        onChange={(v) => {
          setOpportunity(v);
          setConfirmation(false);
          setPosition(undefined);
          if (provider)
            void action.run(async () => {
              const pos = await p.getEarnPosition({ provider, opportunity: v });
              setPosition(pos);
              return pos;
            });
        }}
      />
      <ResultView value={opportunities.find((o) => o.id === opportunity)} />
      <ResultView value={position} />
      <Field
        label={copy.amount}
        value={amount}
        keyboardType="decimal-pad"
        onChangeText={(v) => {
          setAmount(v);
          setConfirmation(false);
        }}
      />
      <Choice
        label={copy.earn.operation}
        labels={copy.earn.tabs}
        options={['deposit', 'withdraw'] as const}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setConfirmation(false);
        }}
      />
      <Label>{copy.earn.units(position?.withdrawUnit)}</Label>
      <ActionButton
        title={confirmation ? copy.earn.confirm[tab] : copy.earn.review[tab]}
        disabled={action.busy || !provider || !opportunity || !position || Number(amount) <= 0 || !p.verified}
        onPress={() =>
          !confirmation
            ? setConfirmation(true)
            : void action.run(async () => {
                setConfirmation(false);
                arm();
                return tab === 'deposit'
                  ? p.earnDeposit({ provider: provider!, opportunity, amount })
                  : p.earnWithdraw({ provider: provider!, opportunity, amount });
              })
        }
      />
      {!providers.length && <Label>{copy.earn.noProviders}</Label>}
      <TransactionStatus />
      <ActionState action={action} />
    </Card>
  );
}
export function DistributionPanel() {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  const [rules, setRules] = useState<DistributionRule[]>([]);
  const [confirm, setConfirm] = useState('');
  async function refresh() {
    const next = await p.listDistributionRules();
    setRules(next);
    return next;
  }
  useEffect(() => {
    void action.run(refresh);
  }, []);
  return (
    <Card title={copy.distribution.title}>
      <ActionButton title={copy.distribution.refresh} disabled={action.busy} onPress={() => void action.run(refresh)} />
      {rules.map((rule) => (
        <View key={rule.id} style={{ gap: 8 }}>
          <Label>
            {rule.name} · {rule.amount} {rule.assetCode}
          </Label>
          <Label>{rule.claimable ? copy.distribution.claimable : (rule.reason ?? copy.distribution.notClaimable)}</Label>
          <ActionButton
            title={confirm === rule.id ? copy.distribution.confirm : copy.distribution.review}
            disabled={action.busy || !rule.claimable}
            onPress={() =>
              confirm !== rule.id
                ? setConfirm(rule.id)
                : void action.run(async () => {
                    setConfirm('');
                    const result = await p.claimDistributionRule({ ruleId: rule.id });
                    await refresh();
                    return result;
                  })
            }
          />
        </View>
      ))}
      <ActionState action={action} />
    </Card>
  );
}
export function RampPanel() {
  const p = usePollar();
  const language = useModalLanguage();
  const copy = FEATURE_COPY[language];
  const client = p.getClient();
  const action = useAction();
  const [direction, setDirection] = useState<RampDirection>(p.ramp?.direction ?? 'ONRAMP');
  const [routes, setRoutes] = useState<RampRoute[]>([]);
  const [routeKey, setRouteKey] = useState('');
  const [amount, setAmount] = useState('');
  const [quotes, setQuotes] = useState<RampQuote[]>([]);
  const [quoteId, setQuoteId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const order = p.ramp?.order;
  const settled = order ? isRampOrderSettled(order) : false;
  const setOrder = (next: RampOrder | null) => p.setRamp(next ? { direction: next.direction, order: next } : null);
  const keyOf = (r: RampRoute) => [r.fiat.country, r.fiat.currency, r.fiat.rail, r.asset.code, r.asset.chain].join(':');
  const route = routes.find((r) => keyOf(r) === routeKey);
  const quote = quotes.find((q) => q.quoteId === quoteId);
  const view = order ? describeRampAction(order, language) : null;
  const clearQuotes = () => {
    setQuotes([]);
    setQuoteId('');
    setFields({});
  };
  useEffect(() => {
    let active = true;
    void client
      .getRampRoutes(direction)
      .then((result) => {
        if (active) setRoutes(result.routes);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [client, direction]);
  useEffect(() => {
    if (!order || settled) return;
    const controller = new AbortController();
    client.pollRampOrder(order.id, { signal: controller.signal, onUpdate: setOrder }).catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, settled, client]);
  async function create() {
    if (!quote) throw new Error(copy.ramp.noQuote);
    const required = rampQuoteFields(quote);
    for (const field of required)
      if (!field.optional && !fields[field.key]?.trim()) throw new Error(copy.ramp.required(field.label));
    const payee = Object.fromEntries(required.filter((f) => fields[f.key]?.trim()).map((f) => [f.key, fields[f.key]!.trim()]));
    const created = await p.createRampOrder({ quoteId: quote.quoteId, ...(Object.keys(payee).length ? { payee } : {}) });
    setOrder(created);
    clearQuotes();
    return created;
  }
  return (
    <Card title={copy.ramp.title}>
      {!order ? (
        <>
          <Choice
            label={copy.ramp.direction}
            value={direction}
            options={['ONRAMP', 'OFFRAMP']}
            onChange={(v) => {
              setDirection(v);
              setRouteKey('');
              clearQuotes();
            }}
          />
          {routes.length > 0 && (
            <Choice
              label={copy.ramp.route}
              value={routeKey}
              options={routes.map(keyOf)}
              labels={Object.fromEntries(
                routes.map((r) => [
                  keyOf(r),
                  copy.ramp.routeLabel(
                    `${r.fiat.country} ${r.fiat.currency} (${r.fiat.rail})`,
                    r.asset.code,
                    r.asset.chain,
                    r.legs.length,
                  ),
                ]),
              )}
              onChange={(value) => {
                setRouteKey(value);
                clearQuotes();
              }}
            />
          )}
          <Field
            label={copy.ramp.amount}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              clearQuotes();
            }}
          />
          <ActionButton
            title={copy.ramp.getQuotes}
            disabled={action.busy || !route || !(Number(amount) > 0)}
            onPress={() =>
              void action.run(async () => {
                const result = await p.quoteRamp({
                  direction,
                  fiat: { currency: route!.fiat.currency, rail: route!.fiat.rail, country: route!.fiat.country },
                  asset: { code: route!.asset.code, identifier: route!.asset.identifier, chain: route!.asset.chain },
                  amount: { value: amount.trim(), denomination: 'in' },
                });
                setQuotes(result.quotes);
                return result;
              })
            }
          />
          {quotes.map((q) => (
            <View key={q.quoteId} style={{ gap: 8 }}>
              <Label>
                {q.amountIn} → ~{q.amountOut} · {q.legs.map((leg) => rampLegTitle(leg, language)).join(' · ')}
              </Label>
              <ActionButton
                title={q.quoteId === quoteId ? copy.ramp.selected : copy.ramp.select}
                onPress={() => {
                  setQuoteId(q.quoteId);
                  setFields({});
                }}
              />
            </View>
          ))}
          {quote &&
            rampQuoteFields(quote).map((f) =>
              f.type === 'select' && f.options ? (
                <Choice
                  key={f.key}
                  label={f.label}
                  value={fields[f.key] ?? ''}
                  options={f.options.map((o) => o.value)}
                  labels={Object.fromEntries(f.options.map((o) => [o.value, o.label]))}
                  onChange={(v) => setFields((old) => ({ ...old, [f.key]: v }))}
                />
              ) : (
                <Field
                  key={f.key}
                  label={f.label}
                  value={fields[f.key] ?? ''}
                  onChangeText={(v) => setFields((old) => ({ ...old, [f.key]: v }))}
                />
              ),
            )}
          {quote && (
            <ActionButton
              title={copy.ramp.create}
              disabled={action.busy || !p.verified}
              onPress={() => void action.run(create)}
            />
          )}
        </>
      ) : (
        <>
          <Label>
            {copy.ramp.order} {order.id} · {order.state}
          </Label>
          {order.legs.map((leg) => (
            <Label key={leg.index}>
              {rampLegTitle(leg, language)}: {rampLegStatus(leg)}
              {leg.onchainTxHash ? ` · ${leg.onchainTxHash.slice(0, 10)}…` : ''}
            </Label>
          ))}
          {order.failure && <Label>{rampOrderResolutionText(order, language)}</Label>}
          {view && !settled && <Label>{view.title}</Label>}
          {view?.scannable?.payload && !settled && (
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <QRCode value={view.scannable.payload} size={180} />
            </View>
          )}
          {view?.scannable?.payload && !settled && (
            <ActionButton
              title={copy.ramp.copyPaymentCode}
              onPress={() =>
                void action.run(async () => {
                  await p.copyText(view.scannable!.payload!);
                  return copy.copied;
                })
              }
            />
          )}
          {view && !settled && view.details.map((d) => <Label key={d.label}>{`${d.label}: ${d.value}`}</Label>)}
          {view?.canSign && !settled && order.pendingAction?.kind === 'SIGNATURE' && (
            <ActionButton
              title={copy.ramp.authorize}
              disabled={action.busy}
              onPress={() =>
                void action.run(async () => {
                  const next = await p.signRampLeg(order.id, (order.pendingAction as RampSignatureAction).actionId);
                  setOrder(next);
                  return next;
                })
              }
            />
          )}
          {view?.canApprove && !settled && <ActionButton title={copy.ramp.approve} onPress={p.openCosignModal} />}
          {view?.link && !settled && (
            <ActionButton title={copy.ramp.verify} onPress={() => void action.run(() => Linking.openURL(view.link!))} />
          )}
          <ActionButton
            title={copy.ramp.refresh}
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                const next = await p.getRampOrder(order.id);
                setOrder(next);
                return next;
              })
            }
          />
          <ActionButton title={copy.ramp.newOrder} onPress={() => setOrder(null)} />
        </>
      )}
      <ActionState action={action} />
    </Card>
  );
}

export function LogoutPanel() {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  return (
    <Card title={copy.logout.title}>
      <Label>{copy.logout.intro}</Label>
      <ActionButton title={copy.logout.disconnect} disabled={action.busy} onPress={() => void action.run(p.logout)} />
      <ActionState action={action} />
    </Card>
  );
}
export function ChainsPanel() {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  return (
    <Card title={copy.chains.title}>
      <Label>{copy.chains.intro}</Label>
      {p.wallets.map((wallet) => (
        <View key={wallet.chain + ':' + wallet.address} style={{ gap: 8 }}>
          <Label>{wallet.chain ?? 'STELLAR'}</Label>
          <ResultView value={wallet.address} />
          <ActionButton
            title={copy.copyChainAddress(String(wallet.chain))}
            onPress={() => void action.run(() => p.copyText(wallet.address))}
          />
        </View>
      ))}
      <ActionState action={action} />
    </Card>
  );
}
const panels: Record<FeatureName, React.ComponentType<{ initial?: never }>> = {
  authentication: AuthPanel,
  logout: LogoutPanel,
  chains: ChainsPanel,
  wallet: WalletPanel,
  transactions: TransactionPanel,
  send: SendPanel,
  receive: ReceivePanel,
  assets: AssetsPanel,
  history: HistoryPanel,
  sessions: SessionsPanel,
  kyc: KycPreview,
  ramp: RampPanel,
  swap: SwapPanel,
  earn: EarnPanel,
  distribution: DistributionPanel,
};
export function FeaturePanel({ feature, initial }: { feature: FeatureName; initial?: FeatureInitial | undefined }) {
  const p = usePollar();
  const copy = FEATURE_COPY[useModalLanguage()];
  const action = useAction();
  const Panel = panels[feature];
  if (p.configStatus === 'error')
    return (
      <Card title={copy.gate.configTitle}>
        <Label>{p.configError ?? copy.gate.configUnavailable}</Label>
        <ActionButton title={copy.gate.retryConfig} onPress={p.retryConfig} />
      </Card>
    );
  if (p.configStatus === 'loading') return <Label>{copy.gate.loading}</Label>;
  if (!p.verified && feature !== 'authentication' && feature !== 'kyc')
    return (
      <Card title={copy.gate.connectTitle}>
        <Label>{p.isAuthenticated ? copy.gate.verifying : copy.gate.signInPrompt}</Label>
        {!p.isAuthenticated && <ActionButton title={copy.gate.signIn} onPress={p.openLoginModal} />}
        {p.isAuthenticated && (
          <ActionButton
            title={copy.gate.retrySession}
            disabled={action.busy}
            onPress={() => void action.run(() => p.getClient().refresh())}
          />
        )}
        <ActionState action={action} />
      </Card>
    );
  const seeded = (initial as Record<string, unknown> | undefined)?.[feature];
  return <Panel {...(seeded !== undefined && { initial: seeded as never })} />;
}
