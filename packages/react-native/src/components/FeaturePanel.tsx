import React, { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type {
  DistributionRule,
  EarnOpportunity,
  EarnProviderId,
  EarnPosition,
  SwapQuote,
  SwapToken,
  WalletChain,
  EnabledAssetRecord,
  RampsQuoteResponse,
  RampsTransactionResponse,
  RampsOnrampResponse,
} from '@pollar/core';
import { usePollar } from '../context';
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
  const chains = [...new Set(wallets.map((w) => w.chain ?? 'STELLAR'))];
  return <Choice label="Chain" value={value} options={chains.length ? chains : ['STELLAR']} onChange={onChange} />;
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
  return <Choice label="Asset" value={value} options={assets.map(assetKey)} onChange={onChange} />;
}
export const assetKey = (asset: { chain?: WalletChain; code: string; issuer?: string }) =>
  [asset.chain ?? 'STELLAR', asset.code, asset.issuer ?? 'native'].join(':');

export function AuthPanel() {
  const p = usePollar();
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
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
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
    if (!code.trim()) throw new Error('Enter your verification code.');
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
    <Card title="Authentication">
      {p.isAuthenticated ? (
        <>
          <Label>{p.verified ? 'Session verified' : 'Restoring session…'}</Label>
          <ResultView value={p.wallet} />
          <ActionButton title="Log out" disabled={action.busy} onPress={() => void action.run(p.logout)} />
        </>
      ) : (
        <>
          {p.privyAdapter && (
            <Choice
              label="Provider"
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
          <Field label="Email" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <ActionButton
            title={sent ? 'Resend code' : 'Send code'}
            disabled={action.busy || authBusy}
            onPress={() => void action.run(send)}
          />
          {sent && (
            <>
              <Field label="Verification code" keyboardType="number-pad" value={code} onChangeText={setCode} />
              <ActionButton title="Verify code" disabled={action.busy || authBusy} onPress={() => void action.run(verify)} />
            </>
          )}
          {(['google', 'github'] as const)
            .filter((name) => provider === 'Privy' || p.styles.providers?.[name])
            .map((name) => (
              <ActionButton
                key={name}
                title={'Continue with ' + name}
                disabled={action.busy || authBusy}
                onPress={() => void action.run(() => social(name))}
              />
            ))}
          <ActionButton
            title="Cancel login"
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
  const action = useAction();
  useEffect(() => {
    if (p.verified) void action.run(p.refreshWalletBalance);
  }, [p.verified]);
  return (
    <Card title="Wallet balances">
      {p.wallets.map((wallet) => (
        <View key={(wallet.chain ?? 'STELLAR') + wallet.address} style={{ gap: 8 }}>
          <Label>
            {wallet.chain ?? 'STELLAR'} · {wallet.custody}
          </Label>
          <ResultView value={wallet.address} />
          <ActionButton
            title={'Copy ' + (wallet.chain ?? 'STELLAR') + ' address'}
            onPress={() =>
              void action.run(async () => {
                await p.copyText(wallet.address);
                return 'Copied';
              })
            }
          />
        </View>
      ))}
      <ActionButton title="Refresh balances" disabled={action.busy} onPress={() => void action.run(p.refreshWalletBalance)} />
      {p.walletBalance.step === 'loaded' ? (
        p.walletBalance.data.balances.map((b) => (
          <Label key={assetKey(b)}>
            {b.chain ?? 'STELLAR'} · {b.code}: {b.balance ?? 'Unavailable'}
          </Label>
        ))
      ) : (
        <ResultView value={p.walletBalance} />
      )}
      <ActionState action={action} />
    </Card>
  );
}
export function ReceivePanel() {
  const p = usePollar();
  const action = useAction();
  const [chain, setChain] = useState<WalletChain>('STELLAR');
  const address = p.wallets.find((w) => (w.chain ?? 'STELLAR') === chain)?.address;
  return (
    <Card title="Receive">
      <ChainSelect value={chain} onChange={setChain} />
      {address ? (
        <>
          <View style={{ padding: 16, backgroundColor: '#fff', alignSelf: 'center', borderRadius: 16 }}>
            <QRCode value={address} size={200} />
          </View>
          <ResultView value={address} />
          <ActionButton
            title="Copy address"
            onPress={() =>
              void action.run(async () => {
                await p.copyText(address);
                return 'Copied';
              })
            }
          />
        </>
      ) : (
        <Label>No wallet available for this chain.</Label>
      )}
      <ActionState action={action} />
    </Card>
  );
}
export function SendPanel() {
  const p = usePollar();
  const action = useAction();
  const [chain, setChain] = useState<WalletChain>('STELLAR');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [selected, setSelected] = useState('');
  const [review, setReview] = useState(false);
  const assets =
    p.enabledAssets.step === 'loaded' ? p.enabledAssets.data.assets.filter((a) => (a.chain ?? 'STELLAR') === chain) : [];
  useEffect(() => {
    if (p.verified) void action.run(p.refreshAssets);
  }, [p.verified]);
  const asset = assets.find((a) => assetKey(a) === selected);
  async function send() {
    if (!destination.trim() || !/^(?:\d+)(?:\.\d+)?$/.test(amount) || Number(amount) <= 0)
      throw new Error('Enter a destination and positive amount.');
    if (chain === 'STELLAR') {
      if (asset?.issuer && asset.issuer !== '0')
        return p.sendPayment({
          destination: destination.trim(),
          amount,
          asset: {
            type: asset.code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12',
            code: asset.code,
            issuer: asset.issuer,
          },
        });
      return p.sendPayment({ destination: destination.trim(), amount, asset: { type: 'native' } });
    }
    if (p.wallet?.provider === 'privy') throw new Error('Privy supports Stellar signing only.');
    if (!/^\d+$/.test(amount)) throw new Error('Use integer base units for this chain.');
    return p.sendPayment({ chain, destination: destination.trim(), amount, ...(asset?.issuer ? { mint: asset.issuer } : {}) });
  }
  return (
    <Card title="Send payment">
      <ChainSelect
        value={chain}
        onChange={(v) => {
          setChain(v);
          setSelected('');
          setReview(false);
        }}
      />
      <Choice
        label="Token"
        options={['Native', ...assets.filter((a) => a.issuer && a.issuer !== '0').map(assetKey)]}
        value={selected || 'Native'}
        onChange={(v) => {
          setSelected(v);
          setReview(false);
        }}
      />
      <Field
        label="Destination address"
        value={destination}
        onChangeText={(v) => {
          setDestination(v);
          setReview(false);
        }}
      />
      <Field
        label={chain === 'STELLAR' ? 'Amount' : 'Amount in base units'}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(v) => {
          setAmount(v);
          setReview(false);
        }}
      />
      {review && (
        <Label>
          {p.network}: send {amount} {asset?.code ?? 'native'} to {destination}
        </Label>
      )}
      <ActionButton
        title={review ? 'Confirm payment' : 'Review payment'}
        disabled={action.busy || !p.verified}
        onPress={() =>
          review
            ? void action.run(async () => {
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
  const action = useAction();
  const hash = 'hash' in p.tx ? p.tx.hash : undefined;
  return (
    <View style={{ gap: 8 }}>
      <Label>Transaction: {p.tx.step}</Label>
      <ResultView value={p.tx} />
      {hash && (
        <>
          <ActionButton
            title="Copy transaction hash"
            onPress={() =>
              void action.run(async () => {
                await p.copyText(hash);
                return 'Copied';
              })
            }
          />
          <ActionButton
            title="Check confirmation"
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
    <Card title="Transaction playground">
      <Label>
        Build an operation, inspect the unsigned XDR, then sign and submit separately. Contract arguments use the core SDK's
        typed JSON format.
      </Label>
      <Choice
        label="Operation"
        value={operation}
        options={['payment', 'create_account', 'change_trust', 'invoke_contract', 'path_payment_strict_send']}
        onChange={setOperation}
      />
      <Field
        label="Operation parameters (JSON)"
        multiline
        value={parameters}
        onChangeText={setParameters}
        editable={!action.busy}
      />
      <ActionButton
        title="Build unsigned transaction"
        disabled={action.busy || !p.verified}
        onPress={() =>
          void action.run(async () => {
            const params: unknown = JSON.parse(parameters);
            if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Enter a parameter object.');
            return p.getClient().buildTx(operation, params as Parameters<typeof p.buildTx>[1]);
          })
        }
      />
      <TransactionStatus />
      <Field
        label="Unsigned Stellar XDR"
        multiline
        value={xdr}
        onChangeText={(v) => {
          setXdr(v);
          setSigned('');
          setSubmissionToken(undefined);
        }}
      />
      <ActionButton
        title="Sign transaction"
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
        title="Submit signed transaction"
        disabled={action.busy || !signed || !p.verified}
        onPress={() => void action.run(() => p.submitTx(signed, submissionToken ? { submissionToken } : undefined))}
      />
      <ActionButton title="Open payment form" onPress={p.openSendModal} />
      <ActionState action={action} />
    </Card>
  );
}
export function AssetsPanel() {
  const p = usePollar();
  const action = useAction();
  useEffect(() => {
    void action.run(p.refreshAssets);
  }, []);
  return (
    <Card title="Assets and trustlines">
      <ActionButton title="Refresh assets" disabled={action.busy} onPress={() => void action.run(p.refreshAssets)} />
      {p.enabledAssets.step === 'loaded' ? (
        p.enabledAssets.data.assets.map((a) => (
          <View key={assetKey(a)} style={{ gap: 8 }}>
            <Label>
              {a.chain ?? 'STELLAR'} · {a.code} · {a.trustlineEstablished ? 'Enabled' : 'Available'}
            </Label>
            {(a.chain ?? 'STELLAR') === 'STELLAR' && a.issuer && a.issuer !== '0' && !a.trustlineEstablished && (
              <ActionButton
                title={'Enable ' + a.code}
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
  const action = useAction();
  useEffect(() => {
    void action.run(() => p.fetchTxHistory());
  }, []);
  return (
    <Card title="Transaction history">
      <ActionButton title="Refresh history" disabled={action.busy} onPress={() => void action.run(() => p.fetchTxHistory())} />
      <ResultView value={p.txHistory} />
      <ActionState action={action} />
    </Card>
  );
}
export function SessionsPanel() {
  const p = usePollar();
  const action = useAction();
  useEffect(() => {
    void action.run(p.fetchSessions);
  }, []);
  return (
    <Card title="Active sessions">
      <ActionButton title="Refresh sessions" disabled={action.busy} onPress={() => void action.run(p.fetchSessions)} />
      {p.sessions.step === 'loaded' ? (
        p.sessions.sessions.map((s) => (
          <View key={s.familyId} style={{ gap: 8 }}>
            <Label>
              {s.deviceLabel ?? s.userAgent ?? 'Device'}
              {s.current ? ' · This device' : ''}
            </Label>
            <Label>Last used: {s.lastUsedAt ?? s.createdAt}</Label>
            <ActionButton
              title={s.current ? 'Log out this device' : 'Revoke session'}
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
  return (
    <Card title="Identity verification · Preview">
      <Label>
        Identity verification is a preview in this demo. No documents are collected and no verification status is changed.
      </Label>
      <Label>Providers may request their own verification during a ramp transaction.</Label>
    </Card>
  );
}
export function SwapPanel() {
  const p = usePollar();
  const action = useAction();
  const [tokens, setTokens] = useState<SwapToken[]>([]);
  const [sell, setSell] = useState('');
  const [buy, setBuy] = useState('');
  const [amount, setAmount] = useState('');
  const [quotes, setQuotes] = useState<SwapQuote[]>([]);
  async function refreshSwap() {
    setQuotes([]);
    setSell('');
    setBuy('');
    const t = await p.getSwapTokens();
    setTokens(t);
    return p.getSwapConfig();
  }
  useEffect(() => {
    void action.run(refreshSwap);
  }, []);
  const tokenKey = (t: SwapToken) => assetKey(t);
  const swapAsset = (t: SwapToken) =>
    !t.issuer || t.issuer === '0'
      ? { type: 'native' as const }
      : {
          type: t.code.length <= 4 ? ('credit_alphanum4' as const) : ('credit_alphanum12' as const),
          code: t.code,
          issuer: t.issuer,
        };
  return (
    <Card title="Swap">
      <ActionButton title="Refresh swap markets" disabled={action.busy} onPress={() => void action.run(refreshSwap)} />
      <Choice
        label="Sell asset"
        options={tokens.map(tokenKey)}
        value={sell}
        onChange={(v) => {
          setSell(v);
          setQuotes([]);
        }}
      />
      <Choice
        label="Buy asset"
        options={tokens.map(tokenKey)}
        value={buy}
        onChange={(v) => {
          setBuy(v);
          setQuotes([]);
        }}
      />
      <Field
        label="Amount"
        value={amount}
        keyboardType="decimal-pad"
        onChangeText={(v) => {
          setAmount(v);
          setQuotes([]);
        }}
      />
      <ActionButton
        title="Get quotes"
        disabled={action.busy || !sell || !buy || Number(amount) <= 0}
        onPress={() =>
          void action.run(async () => {
            const q = await p.getSwapQuote({
              sellAsset: swapAsset(tokens.find((t) => tokenKey(t) === sell)!),
              buyAsset: swapAsset(tokens.find((t) => tokenKey(t) === buy)!),
              amount,
              slippageBps: 50,
            });
            setQuotes(q);
            return q;
          })
        }
      />
      {quotes.map((q, i) => (
        <View key={i} style={{ gap: 8 }}>
          <ResultView value={q} />
          <ActionButton
            title={'Confirm swap via ' + q.provider}
            disabled={action.busy || !p.verified}
            onPress={() =>
              void action.run(async () => {
                setQuotes([]);
                return p.swap(q, { autoTrustline: true });
              })
            }
          />
        </View>
      ))}
      {!tokens.length && <Label>No supported tokens loaded. Check your app configuration or retry.</Label>}
      <TransactionStatus />
      <ActionState action={action} />
    </Card>
  );
}
export function EarnPanel() {
  const p = usePollar();
  const action = useAction();
  const [providers, setProviders] = useState<EarnProviderId[]>([]);
  const [provider, setProvider] = useState<EarnProviderId>();
  const [opportunities, setOpportunities] = useState<EarnOpportunity[]>([]);
  const [opportunity, setOpportunity] = useState('');
  const [amount, setAmount] = useState('');
  const [position, setPosition] = useState<EarnPosition>();
  const [confirmation, setConfirmation] = useState<'deposit' | 'withdraw'>();
  async function refreshEarn() {
    setProvider(undefined);
    setOpportunity('');
    setPosition(undefined);
    setConfirmation(undefined);
    const list = await p.getEarnProviders();
    setProviders(list);
    return list;
  }
  useEffect(() => {
    void action.run(refreshEarn);
  }, []);
  return (
    <Card title="Earn">
      <ActionButton title="Refresh earn providers" disabled={action.busy} onPress={() => void action.run(refreshEarn)} />
      <Choice
        label="Provider"
        options={providers}
        value={provider ?? ''}
        onChange={(v) => {
          setProvider(v as EarnProviderId);
          setOpportunity('');
          setPosition(undefined);
          setConfirmation(undefined);
          void action.run(async () => {
            const list = await p.getEarnOpportunities(v as EarnProviderId);
            setOpportunities(list);
            return list;
          });
        }}
      />
      <Choice
        label="Opportunity"
        options={opportunities.map((o) => o.id)}
        value={opportunity}
        onChange={(v) => {
          setOpportunity(v);
          setConfirmation(undefined);
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
        label="Amount"
        value={amount}
        keyboardType="decimal-pad"
        onChangeText={(v) => {
          setAmount(v);
          setConfirmation(undefined);
        }}
      />
      <Label>
        Deposits use underlying asset units. Withdrawals use {position?.withdrawUnit ?? 'the position’s withdrawal unit'}.
      </Label>
      {(['deposit', 'withdraw'] as const).map((direction) => (
        <ActionButton
          key={direction}
          title={confirmation === direction ? 'Confirm ' + direction : 'Review ' + direction}
          disabled={action.busy || !provider || !opportunity || !position || Number(amount) <= 0 || !p.verified}
          onPress={() =>
            confirmation !== direction
              ? setConfirmation(direction)
              : void action.run(async () => {
                  setConfirmation(undefined);
                  return direction === 'deposit'
                    ? p.earnDeposit({ provider: provider!, opportunity, amount })
                    : p.earnWithdraw({ provider: provider!, opportunity, amount });
                })
          }
        />
      ))}
      {!providers.length && <Label>No earn providers loaded for this application.</Label>}
      <TransactionStatus />
      <ActionState action={action} />
    </Card>
  );
}
export function DistributionPanel() {
  const p = usePollar();
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
    <Card title="Distribution">
      <ActionButton title="Refresh rules" disabled={action.busy} onPress={() => void action.run(refresh)} />
      {rules.map((rule) => (
        <View key={rule.id} style={{ gap: 8 }}>
          <Label>
            {rule.name} · {rule.amount} {rule.assetCode}
          </Label>
          <Label>{rule.claimable ? 'Available to claim' : (rule.reason ?? 'Not claimable')}</Label>
          <ActionButton
            title={confirm === rule.id ? 'Confirm claim' : 'Review claim'}
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
  const action = useAction();
  const [direction, setDirection] = useState<'onramp' | 'offramp'>(p.ramp?.direction ?? 'onramp');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('');
  const [amount, setAmount] = useState('');
  const [quotes, setQuotes] = useState<RampsQuoteResponse['quotes']>([]);
  const [quoteId, setQuoteId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const transaction = p.ramp?.transaction;
  const setTransaction = (next: RampsOnrampResponse | RampsTransactionResponse | undefined) =>
    p.setRamp(next ? { direction, transaction: next } : null);
  const quote = quotes.find((q) => q.quoteId === quoteId);
  const clearQuotes = () => {
    setQuotes([]);
    setQuoteId('');
    setFields({});
  };
  async function create() {
    if (!quote) throw new Error('Get and select a current quote.');
    for (const field of quote.requiredFields)
      if (!field.optional && !fields[field.key]?.trim()) throw new Error(field.label + ' is required.');
    const body = {
      quoteId,
      country,
      currency,
      amount: Number(amount),
      walletAddress: p.walletAddress,
      ...(fields.email ? { email: fields.email } : {}),
      ...(fields.fullName ? { fullName: fields.fullName } : {}),
    };
    const bankField = quote.requiredFields.find((f) => f.bankType && fields[f.key]);
    const result =
      direction === 'onramp'
        ? await p.createOnRamp(body)
        : await p.createOffRamp({
            ...body,
            fields,
            ...(bankField?.bankType ? { bankDetails: { type: bankField.bankType, value: fields[bankField.key]! } } : {}),
            ...(fields.taxId ? { taxId: fields.taxId } : {}),
            ...(fields.qrCode ? { qrCode: fields.qrCode } : {}),
          });
    setTransaction(result);
    clearQuotes();
    return result;
  }
  return (
    <Card title="Ramp">
      <ActionButton
        title="Load supported countries"
        disabled={action.busy}
        onPress={() => void action.run(p.getRampCountries)}
      />
      {!transaction ? (
        <>
          <Choice
            label="Direction"
            value={direction}
            options={['onramp', 'offramp']}
            onChange={(v) => {
              setDirection(v);
              clearQuotes();
            }}
          />
          <Field
            label="Country code (e.g. MX)"
            value={country}
            onChangeText={(v) => {
              setCountry(v.toUpperCase());
              clearQuotes();
            }}
          />
          <Field
            label="Currency (e.g. MXN)"
            value={currency}
            onChangeText={(v) => {
              setCurrency(v.toUpperCase());
              clearQuotes();
            }}
          />
          <Field
            label="Amount"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              clearQuotes();
            }}
          />
          <ActionButton
            title="Get ramp quotes"
            disabled={action.busy || !country || !currency || Number(amount) <= 0}
            onPress={() =>
              void action.run(async () => {
                const q = await p.getRampsQuote({ country, currency, amount: Number(amount), direction });
                setQuotes(q.quotes);
                return q;
              })
            }
          />
          {quotes.map((q) => (
            <View key={q.quoteId} style={{ gap: 8 }}>
              <Label>
                {q.provider} · {q.rail} · Fee {q.fee} {q.feeCurrency}
              </Label>
              <ActionButton
                title={'Select ' + q.provider}
                onPress={() => {
                  setQuoteId(q.quoteId);
                  setFields({});
                }}
              />
            </View>
          ))}
          {quote?.requiredFields.map((f) =>
            f.type === 'select' && f.options ? (
              <Choice
                key={f.key}
                label={f.label}
                value={fields[f.key] ?? ''}
                options={f.options.map((o) => o.value)}
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
              title={'Confirm ' + direction}
              disabled={action.busy || !p.verified}
              onPress={() => void action.run(create)}
            />
          )}
        </>
      ) : (
        <>
          <Label>Provider status: {transaction.status}</Label>
          <ResultView value={transaction} />
          {transaction.kycUrl && (
            <ActionButton
              title="Open provider verification"
              onPress={() => void action.run(() => Linking.openURL(transaction.kycUrl!))}
            />
          )}
          {'tosUrl' in transaction && transaction.tosUrl && (
            <ActionButton
              title="Open provider terms"
              onPress={() => void action.run(() => Linking.openURL((transaction as RampsOnrampResponse).tosUrl!))}
            />
          )}
          {transaction.depositInstructions?.scannable?.payload && (
            <ActionButton
              title="Copy payment instructions"
              onPress={() =>
                void action.run(async () => {
                  await p.copyText(transaction.depositInstructions!.scannable!.payload!);
                  return 'Copied';
                })
              }
            />
          )}
          {'pendingSignature' in transaction && transaction.pendingSignature && (
            <ActionButton
              title="Sign provider request"
              disabled={action.busy}
              onPress={() =>
                void action.run(async () => {
                  const pending = (transaction as RampsOnrampResponse).pendingSignature!;
                  const signed = await p.signTx(pending.unsignedXdr, { skipSponsorship: pending.action === 'sep10' });
                  if (signed.status !== 'signed') return signed;
                  const next = await p.submitRampSignature(transaction.txId, {
                    signedXdr: signed.signedXdr,
                    action: pending.action,
                  });
                  setTransaction(next);
                  return next;
                })
              }
            />
          )}
          <ActionButton
            title="Refresh provider status"
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                const next = await p.getRampTransaction(transaction.txId);
                setTransaction(next);
                return next;
              })
            }
          />
          {direction === 'offramp' && transaction.status === 'pending' && (
            <ActionButton
              title="Complete withdrawal after verification"
              disabled={action.busy}
              onPress={() => void action.run(() => p.completeWithdraw(transaction.txId))}
            />
          )}
          {['completed', 'failed'].includes(transaction.status) && (
            <ActionButton title="New ramp transaction" onPress={() => setTransaction(undefined)} />
          )}
        </>
      )}
      <ActionState action={action} />
    </Card>
  );
}
export function LogoutPanel() {
  const p = usePollar();
  const action = useAction();
  return (
    <Card title="Wallet logout">
      <Label>This disconnects the wallet and clears its session. Your Pollar account and selected application stay open.</Label>
      <ActionButton title="Disconnect wallet" disabled={action.busy} onPress={() => void action.run(p.logout)} />
      <ActionState action={action} />
    </Card>
  );
}
export function ChainsPanel() {
  const p = usePollar();
  const action = useAction();
  return (
    <Card title="Connected chains">
      <Label>Wallet addresses are chain-specific. Privy native signing is Stellar-only.</Label>
      {p.wallets.map((wallet) => (
        <View key={wallet.chain + ':' + wallet.address} style={{ gap: 8 }}>
          <Label>{wallet.chain ?? 'STELLAR'}</Label>
          <ResultView value={wallet.address} />
          <ActionButton
            title={'Copy ' + wallet.chain + ' address'}
            onPress={() => void action.run(() => p.copyText(wallet.address))}
          />
        </View>
      ))}
      <ActionState action={action} />
    </Card>
  );
}
const panels: Record<FeatureName, React.ComponentType> = {
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
export function FeaturePanel({ feature }: { feature: FeatureName }) {
  const p = usePollar();
  const action = useAction();
  const Panel = panels[feature];
  if (p.configStatus === 'error')
    return (
      <Card title="Unable to load application">
        <Label>{p.configError ?? 'Application configuration is unavailable.'}</Label>
        <ActionButton title="Retry configuration" onPress={p.retryConfig} />
      </Card>
    );
  if (p.configStatus === 'loading') return <Label>Loading application…</Label>;
  if (!p.verified && feature !== 'authentication' && feature !== 'kyc')
    return (
      <Card title="Connect your wallet">
        <Label>{p.isAuthenticated ? 'Verifying your restored session…' : 'Sign in to explore this feature.'}</Label>
        {!p.isAuthenticated && <ActionButton title="Sign in" onPress={p.openLoginModal} />}
        {p.isAuthenticated && (
          <ActionButton
            title="Retry session verification"
            disabled={action.busy}
            onPress={() => void action.run(() => p.getClient().refresh())}
          />
        )}
        <ActionState action={action} />
      </Card>
    );
  return <Panel />;
}
