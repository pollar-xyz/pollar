import React, { useState } from 'react';
import { Pressable, Text, View, ScrollView } from 'react-native';
import { ActionButton, ActionState, Card, Choice, Field, Label, ResultView, useAction } from './native-ui';
import { toBaseUnits, type WalletChain } from '@pollar/core';
import { ChainSelect, FeaturePanel, type FeatureName } from './FeaturePanel';
import { usePollar } from '../context';
import { useSurfaceColors } from './layout';
export interface PaymentRequest {
  operation: string;
  destination?: string;
  amount?: string;
  memo?: string;
  memoType?: string;
  assetCode?: string;
  assetIssuer?: string;
}
export type PaymentRequestParser = (uri: string) => PaymentRequest;
type Mode = 'core' | 'native' | 'scan';
const modalMethods = {
  authentication: 'openLoginModal',
  logout: 'logout',
  wallet: 'openWalletBalanceModal',
  receive: 'openReceiveModal',
  send: 'openSendModal',
  assets: 'openEnabledAssetsModal',
  history: 'openTxHistoryModal',
  sessions: 'openSessionsModal',
  transactions: 'openTxModal',
  kyc: 'openKycModal',
  ramp: 'openRampModal',
  swap: 'openSwapModal',
  earn: 'openEarnModal',
  distribution: 'openDistributionRulesModal',
  chains: null,
} as const;
const coreExamples: Record<FeatureName, string> = {
  authentication: 'client.beginEmailLogin();\nclient.sendEmailCode(email);\nclient.verifyEmailCode(code);',
  logout: 'await client.logout();',
  wallet: 'const data = await client.getWalletBalance(publicKey);',
  receive: 'const wallets = client.getWallets();\n// Render the selected wallet address as a native QR.',
  chains: 'const wallets = client.getWallets();',
  send: "const result = await client.runTx('payment', {\n  destination, amount: '1', asset: { type: 'native' }\n});",
  assets:
    "await client.refreshAssets();\nconst assets = client.getEnabledAssetsState();\nawait client.setTrustline({ code: 'USDC', issuer });",
  history: 'await client.fetchTxHistory();\nconst history = client.getTxHistoryState();',
  sessions: 'await client.fetchSessions();\nconst sessions = client.getSessionsState();\nawait client.revokeSession(familyId);',
  transactions:
    "await client.buildTx('payment', { destination, amount: '1', asset: { type: 'native' } });\nconst state = client.getTransactionState();",
  kyc: '// KYC is a preview only. No backend approval is emitted.',
  ramp: "const quotes = await client.getRampsQuote({ country: 'MX', currency: 'MXN', amount: 100, direction: 'onramp' });\n// Review a quote, then createOnRamp(...).",
  swap: "const quotes = await client.getSwapQuote({ sellAsset, buyAsset, amount: '1' });\n// Review a quote before client.swap(quote).",
  earn: 'const providers = await client.getEarnProviders();\nconst opportunities = await client.getEarnOpportunities(providers[0]);\n// Inspect a position before depositing or withdrawing.',
  distribution:
    'const rules = await client.listDistributionRules();\n// Review eligibility before client.claimDistributionRule({ ruleId }).',
};
export function FeatureExample({
  feature,
  signOnly = false,
  parsePaymentRequest,
}: {
  feature: FeatureName;
  signOnly?: boolean;
  parsePaymentRequest?: PaymentRequestParser;
}) {
  const [mode, setMode] = useState<Mode>('native');
  const [section, setSection] = useState<'demo' | 'code'>('demo');
  const p = usePollar();
  const c = useSurfaceColors();
  const action = useAction();
  const method = modalMethods[feature];
  const snippet = signOnly
    ? "const client = usePollar().getClient();\nconst signed = await client.signTx(xdr);\nif (signed.status === 'signed') {\n  await client.submitTx(signed.signedXdr, { submissionToken: signed.submissionToken });\n}"
    : mode === 'native' && method
      ? `import { usePollar } from '@pollar/react-native';\n\nconst { ${method} } = usePollar();\n${method}();`
      : "import { usePollar } from '@pollar/react-native';\nconst client = usePollar().getClient();\n\n" +
        coreExamples[feature];
  return (
    <>
      {!signOnly && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            padding: 4,
            gap: 4,
            borderRadius: 8,
            backgroundColor: c.surface,
          }}
        >
          {(['core', 'native', ...(feature === 'send' && parsePaymentRequest ? ['scan'] : [])] as Mode[]).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: m === mode }}
              onPress={() => setMode(m)}
              style={{
                padding: 11,
                backgroundColor: m === mode ? c.bg : 'transparent',
                borderRadius: 6,
              }}
            >
              <Text
                style={{
                  color: m === mode ? c.text : c.muted,
                  fontFamily: 'monospace',
                  fontSize: 11,
                }}
              >
                {m === 'core' ? '@pollar/core' : m === 'native' ? '@pollar/react-native' : 'Scan & Pay'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', gap: 22 }}>
        {(['demo', 'code'] as const).map((s) => (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityLabel={s === 'demo' ? 'Demo controls' : 'Usage code'}
            accessibilityState={{ selected: s === section }}
            onPress={() => setSection(s)}
            style={{
              paddingVertical: 8,
              borderBottomWidth: 2,
              borderColor: s === section ? c.blue : 'transparent',
            }}
          >
            <Text style={{ color: s === section ? c.blue : c.muted }}>{s === 'demo' ? 'Demo' : 'Code'}</Text>
          </Pressable>
        ))}
      </View>
      {section === 'code' ? (
        <>
          <Card title={mode === 'core' ? 'Core client example' : 'Native hooks & components'}>
            <ResultView value={snippet} />
            <ActionButton
              title="Copy example"
              onPress={() =>
                void action.run(async () => {
                  await p.copyText(snippet);
                  return 'Copied';
                })
              }
            />
            <ActionState action={action} />
          </Card>
        </>
      ) : signOnly ? (
        <SignTransactionForm />
      ) : mode === 'native' && method ? (
        <>
          <Text style={{ color: c.muted, lineHeight: 23 }}>
            Use the native SDK component. It renders the form, validation and request state for you, backed by the same Pollar
            client.
          </Text>
          <ActionButton
            title={
              feature === 'logout'
                ? 'Logout'
                : 'Open ' +
                  (feature === 'authentication' ? 'Login' : feature.charAt(0).toUpperCase() + feature.slice(1)) +
                  ' modal'
            }
            disabled={feature !== 'authentication' && feature !== 'kyc' && !p.verified}
            onPress={() => void action.run(async () => p[method]())}
          />
          <Text style={{ color: c.muted, fontFamily: 'monospace', fontSize: 12 }}>{method}()</Text>
          <ActionState action={action} />
          <Card title="Reactive state">
            <ResultView
              value={
                ['send', 'transactions', 'swap', 'earn'].includes(feature)
                  ? p.tx
                  : feature === 'authentication' || feature === 'logout'
                    ? { authenticated: p.isAuthenticated, verified: p.verified }
                    : { network: p.network, connected: p.isAuthenticated }
              }
            />
          </Card>
        </>
      ) : mode === 'scan' ? (
        <PaymentRequestForm parsePaymentRequest={parsePaymentRequest!} />
      ) : feature === 'send' ? (
        <PaymentForm />
      ) : feature === 'wallet' ? (
        <BalanceLookup />
      ) : (
        <FeaturePanel feature={feature} />
      )}
    </>
  );
}
export function BalanceLookup() {
  const [publicKey, setPublicKey] = useState('');
  const p = usePollar();
  const a = useAction();
  return (
    <Card title="Wallet balance">
      <Label>Leave the public key empty for the connected wallet, or look up another Stellar address.</Label>
      <Field label="Public key (optional)" value={publicKey} onChangeText={setPublicKey} />
      <ActionButton
        title="Fetch balances"
        disabled={a.busy}
        onPress={() =>
          void a.run(async () => {
            if (publicKey.trim()) {
              if (!/^G[A-Z2-7]{55}$/.test(publicKey.trim())) throw new Error('Enter a valid Stellar public key.');
              return p.getClient().getWalletBalance(publicKey.trim());
            }
            await p.refreshWalletBalance();
            return p.getClient().getWalletBalanceState();
          })
        }
      />
      <ActionState action={a} />
    </Card>
  );
}
export function SignTransactionForm() {
  const p = usePollar();
  const a = useAction();
  const [xdr, setXdr] = useState('');
  const [signed, setSigned] = useState<{
    signedXdr: string;
    submissionToken?: string;
  }>();
  return (
    <Card title="Sign XDR">
      <Label>Sign and submit in one call, or sign first and submit the result separately.</Label>
      <Field
        label="Unsigned Stellar XDR"
        value={xdr}
        onChangeText={(value) => {
          setXdr(value);
          setSigned(undefined);
        }}
        multiline
      />
      <ActionButton
        title="signAndSubmitTx(xdr)"
        disabled={!xdr || !p.verified || a.busy}
        onPress={() => void a.run(() => p.signAndSubmitTx(xdr))}
      />
      <ActionButton
        title="1. signTx(xdr)"
        disabled={!xdr || !p.verified || a.busy}
        onPress={() =>
          void a.run(async () => {
            const result = await p.signTx(xdr);
            if (result.status === 'signed') setSigned(result);
            return result;
          })
        }
      />
      {signed && (
        <ActionButton
          title="2. submitTx(signedXdr)"
          disabled={a.busy}
          onPress={() =>
            void a.run(() =>
              p.submitTx(signed.signedXdr, signed.submissionToken ? { submissionToken: signed.submissionToken } : undefined),
            )
          }
        />
      )}
      <Label>Transaction: {p.tx.step}</Label>
      <ResultView value={p.tx} />
      <ActionState action={a} />
    </Card>
  );
}
export function PaymentForm({
  initial,
}: {
  initial?: {
    destination?: string | undefined;
    amount?: string | undefined;
    memo?: string | undefined;
    assetCode?: string | undefined;
    assetIssuer?: string | undefined;
  };
}) {
  const p = usePollar();
  const a = useAction();
  const [chain, setChain] = useState<WalletChain>('STELLAR');
  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [memoType, setMemoType] = useState<'text' | 'id'>('text');
  const [token, setToken] = useState(initial?.assetCode ? 'Issued asset' : 'Native');
  const [code, setCode] = useState(initial?.assetCode ?? 'USDC');
  const [issuer, setIssuer] = useState(initial?.assetIssuer ?? '');
  const [review, setReview] = useState(false);
  const reset = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setReview(false);
  };
  return (
    <Card title="Send payment">
      <Label>Build, sign and submit with a direct core call. Always review the destination, token and network first.</Label>
      <ChainSelect
        value={chain}
        onChange={(next) => {
          setChain(next);
          setReview(false);
        }}
      />
      <Field label="Destination" value={destination} onChangeText={reset(setDestination)} />
      <Choice label="Token" options={['Native', 'Issued asset']} value={token} onChange={reset(setToken)} />
      {token !== 'Native' && (
        <>
          {chain === 'STELLAR' && <Field label="Asset code" value={code} onChangeText={reset(setCode)} />}
          <Field label={chain === 'STELLAR' ? 'Issuer' : 'Token mint'} value={issuer} onChangeText={reset(setIssuer)} />
        </>
      )}
      <Field label="Amount" keyboardType="decimal-pad" value={amount} onChangeText={reset(setAmount)} />
      {chain === 'STELLAR' && (
        <>
          <Choice
            label="Memo type"
            options={['text', 'id']}
            value={memoType}
            onChange={(value) => {
              setMemoType(value);
              setReview(false);
            }}
          />
          <Field label="Memo (optional)" value={memo} onChangeText={reset(setMemo)} />
        </>
      )}
      {review && (
        <ResultView
          value={{
            network: p.network,
            chain,
            destination,
            token,
            amount,
            ...(memo ? { memo, memoType } : {}),
          }}
        />
      )}
      <ActionButton
        title={review ? 'Confirm payment' : 'Review payment'}
        disabled={a.busy || !p.verified}
        onPress={() =>
          void a.run(async () => {
            if (chain !== 'STELLAR' && chain !== 'SOLANA') throw new Error('Sending is not available on this network yet.');
            if (chain !== 'STELLAR' && p.wallet?.provider === 'privy') throw new Error('Privy supports Stellar signing only.');
            if (!destination.trim() || !/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0)
              throw new Error('Enter a destination and a positive amount.');
            if (chain === 'STELLAR' && !/^G[A-Z2-7]{55}$/.test(destination.trim()))
              throw new Error('Enter a Stellar destination address.');
            if (token !== 'Native' && !issuer.trim()) throw new Error('Enter the asset issuer or mint.');
            if (memo && memoType === 'text' && new TextEncoder().encode(memo).length > 28)
              throw new Error('Memo exceeds 28 UTF-8 bytes.');
            if (memo && memoType === 'id' && (!/^\d+$/.test(memo) || BigInt(memo) > 18446744073709551615n))
              throw new Error('Memo ID must be an unsigned 64-bit integer.');
            if (!review) {
              setReview(true);
              return;
            }
            setReview(false);
            if (chain === 'STELLAR')
              return p.runTx(
                'payment',
                {
                  destination: destination.trim(),
                  amount,
                  asset:
                    token === 'Native'
                      ? { type: 'native' }
                      : {
                          type: code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12',
                          code,
                          issuer,
                        },
                },
                memo ? { memo: { type: memoType, value: memo } } : undefined,
              );
            const balance =
              p.walletBalance.step === 'loaded'
                ? p.walletBalance.data.balances.find((b) => b.chain === chain && b.issuer === issuer)
                : undefined;
            const decimals = token === 'Native' ? (chain === 'SOLANA' ? 9 : 18) : balance?.decimals;
            if (decimals === undefined)
              throw new Error('Refresh wallet balances to verify this token’s decimals before sending.');
            return p.sendPayment({
              chain,
              destination: destination.trim(),
              amount: toBaseUnits(amount, decimals),
              ...(token === 'Native' ? {} : { mint: issuer }),
            });
          })
        }
      />
      <ActionState action={a} />
      <Label>Transaction: {p.tx.step}</Label>
      <ResultView value={p.tx} />
    </Card>
  );
}
export function PaymentRequestForm({ parsePaymentRequest }: { parsePaymentRequest: PaymentRequestParser }) {
  const [uri, setUri] = useState('');
  const a = useAction();
  const [request, setRequest] = useState<Parameters<typeof PaymentForm>[0]['initial']>();
  return (
    <>
      <Card title="Scan & Pay · SEP-7">
        <Label>Paste a decoded Stellar payment QR request to inspect it. It never sends automatically.</Label>
        <Field
          label="Stellar payment URI"
          value={uri}
          multiline
          onChangeText={(value) => {
            setUri(value);
            setRequest(undefined);
          }}
        />
        <ActionButton
          title="Read payment request"
          onPress={() =>
            void a.run(async () => {
              const parsed = parsePaymentRequest(uri.trim());
              if (parsed.operation !== 'pay') throw new Error('Only SEP-7 pay requests are supported.');
              if (parsed.memoType && parsed.memoType !== 'MEMO_TEXT') throw new Error('Use the core form for non-text memos.');
              setRequest({
                destination: parsed.destination,
                amount: parsed.amount,
                memo: parsed.memo,
                assetCode: parsed.assetCode,
                assetIssuer: parsed.assetIssuer,
              });
              return parsed;
            })
          }
        />
        <Label>Camera capture is not yet implemented in this native build; URI parsing and payment review are available.</Label>
        <ActionState action={a} />
      </Card>
      {request && <PaymentForm key={JSON.stringify(request)} initial={request} />}
    </>
  );
}
