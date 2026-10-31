import React, { useState } from 'react';
import { Pressable, Text, View, ScrollView } from 'react-native';
import { ActionButton, ActionState, Card, Choice, Field, Label, ResultView, useAction } from './native-ui';
import { toBaseUnits, type WalletChain } from '@pollar/core';
import { ChainSelect, FeaturePanel, type FeatureName } from './FeaturePanel';
import { usePollar } from '../context';
import { useModalLanguage } from '../language';
import { EXAMPLE_COPY } from './example-copy';
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
  ramp: "import { describeRampAction, rampQuoteFields } from '@pollar/core';\n\n// What the app can ramp between: fiat on a rail and an asset on a chain.\nconst { routes } = await client.getRampRoutes('ONRAMP');\nconst route = routes[0]; // Replace with the user's selection.\nif (!route) throw new Error('No ramp routes are available.');\n\n// Quote every route for the amount the user pays; best first.\nconst { quotes } = await client.quoteRamp({\n  direction: 'ONRAMP',\n  fiat: { currency: route.fiat.currency, rail: route.fiat.rail, country: route.fiat.country },\n  asset: { code: route.asset.code, identifier: route.asset.identifier, chain: route.asset.chain },\n  amount: { value: '20.00', denomination: 'in' },\n});\nconst quote = quotes[0];\nif (!quote) throw new Error('No quote is available.');\n\n// Show quote.legs and collect rampQuoteFields(quote); call only after review.\nasync function acceptQuote(payee: Record<string, string>) {\n  return client.createRampOrder({ quoteId: quote.quoteId, payee });\n}\n\n// Follow the order; reads never pay, sign or approve.\nasync function follow(orderId: string) {\n  return client.pollRampOrder(orderId, {\n    onUpdate: (order) => console.log(describeRampAction(order, language).title),\n  });\n}\n\n// Call only from an explicit Authorize button.\nasync function authorize(orderId: string, actionId: string) {\n  return client.signRampLeg(orderId, actionId);\n}",
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
  const copy = EXAMPLE_COPY[useModalLanguage()];
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
                {m === 'core' ? '@pollar/core' : m === 'native' ? '@pollar/react-native' : copy.scanAndPay}
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
            accessibilityLabel={s === 'demo' ? copy.demoLabel : copy.codeLabel}
            accessibilityState={{ selected: s === section }}
            onPress={() => setSection(s)}
            style={{
              paddingVertical: 8,
              borderBottomWidth: 2,
              borderColor: s === section ? c.blue : 'transparent',
            }}
          >
            <Text style={{ color: s === section ? c.blue : c.muted }}>{s === 'demo' ? copy.demo : copy.code}</Text>
          </Pressable>
        ))}
      </View>
      {section === 'code' ? (
        <>
          <Card title={mode === 'core' ? copy.coreTitle : copy.nativeTitle}>
            <ResultView value={snippet} />
            <ActionButton
              title={copy.copyExample}
              onPress={() =>
                void action.run(async () => {
                  await p.copyText(snippet);
                  return copy.copied;
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
          <Text style={{ color: c.muted, lineHeight: 23 }}>{copy.nativeIntro}</Text>
          <ActionButton
            title={feature === 'logout' ? copy.logout : copy.openModal(copy.modalNames[feature])}
            disabled={feature !== 'authentication' && feature !== 'kyc' && !p.verified}
            onPress={() => void action.run(async () => p[method]())}
          />
          <Text style={{ color: c.muted, fontFamily: 'monospace', fontSize: 12 }}>{method}()</Text>
          <ActionState action={action} />
          <Card title={copy.reactiveState}>
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
  const copy = EXAMPLE_COPY[useModalLanguage()];
  const a = useAction();
  return (
    <Card title={copy.balance.title}>
      <Label>{copy.balance.intro}</Label>
      <Field label={copy.balance.publicKey} value={publicKey} onChangeText={setPublicKey} />
      <ActionButton
        title={copy.balance.fetch}
        disabled={a.busy}
        onPress={() =>
          void a.run(async () => {
            if (publicKey.trim()) {
              if (!/^G[A-Z2-7]{55}$/.test(publicKey.trim())) throw new Error(copy.balance.invalidKey);
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
  const copy = EXAMPLE_COPY[useModalLanguage()];
  const a = useAction();
  const [xdr, setXdr] = useState('');
  const [signed, setSigned] = useState<{
    signedXdr: string;
    submissionToken?: string;
  }>();
  return (
    <Card title={copy.sign.title}>
      <Label>{copy.sign.intro}</Label>
      <Field
        label={copy.sign.xdr}
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
      <Label>
        {copy.transaction}: {p.tx.step}
      </Label>
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
  const copy = EXAMPLE_COPY[useModalLanguage()];
  const a = useAction();
  const [chain, setChain] = useState<WalletChain>('STELLAR');
  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [memoType, setMemoType] = useState<'text' | 'id' | 'hash'>('text');
  const [token, setToken] = useState(initial?.assetCode ? 'Issued asset' : 'Native');
  const [code, setCode] = useState(initial?.assetCode ?? 'USDC');
  const [issuer, setIssuer] = useState(initial?.assetIssuer ?? '');
  const [review, setReview] = useState(false);
  const reset = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setReview(false);
  };
  return (
    <Card title={copy.payment.title}>
      <Label>{copy.payment.intro}</Label>
      <ChainSelect
        value={chain}
        onChange={(next) => {
          setChain(next);
          setReview(false);
        }}
      />
      <Field label={copy.payment.destination} value={destination} onChangeText={reset(setDestination)} />
      <Choice
        label={copy.payment.token}
        options={['Native', 'Issued asset']}
        labels={{ Native: copy.payment.native, 'Issued asset': copy.payment.issued }}
        value={token}
        onChange={reset(setToken)}
      />
      {token !== 'Native' && (
        <>
          {chain === 'STELLAR' && <Field label={copy.payment.assetCode} value={code} onChangeText={reset(setCode)} />}
          <Field
            label={chain === 'STELLAR' ? copy.payment.issuer : copy.payment.mint}
            value={issuer}
            onChangeText={reset(setIssuer)}
          />
        </>
      )}
      <Field label={copy.payment.amount} keyboardType="decimal-pad" value={amount} onChangeText={reset(setAmount)} />
      {chain === 'STELLAR' && (
        <>
          <Choice
            label={copy.payment.memoType}
            options={['text', 'id', 'hash']}
            value={memoType}
            onChange={(value) => {
              setMemoType(value);
              setReview(false);
            }}
          />
          <Field label={copy.payment.memo} value={memo} onChangeText={reset(setMemo)} />
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
        title={review ? copy.payment.confirm : copy.payment.review}
        disabled={a.busy || !p.verified}
        onPress={() =>
          void a.run(async () => {
            if (chain !== 'STELLAR' && chain !== 'SOLANA') throw new Error(copy.payment.unsupportedChain);
            if (chain !== 'STELLAR' && p.wallet?.provider === 'privy') throw new Error(copy.payment.privyStellarOnly);
            if (!destination.trim() || !/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0)
              throw new Error(copy.payment.invalid);
            if (chain === 'STELLAR' && !/^G[A-Z2-7]{55}$/.test(destination.trim()))
              throw new Error(copy.payment.stellarDestination);
            if (token !== 'Native' && !issuer.trim()) throw new Error(copy.payment.missingIssuer);
            if (memo && memoType === 'text' && new TextEncoder().encode(memo).length > 28)
              throw new Error(copy.payment.memoTooLong);
            if (memo && memoType === 'id' && (!/^\d+$/.test(memo) || BigInt(memo) > 18446744073709551615n))
              throw new Error(copy.payment.memoId);
            if (memo && memoType === 'hash' && !/^[0-9a-fA-F]{64}$/.test(memo)) throw new Error(copy.payment.memoHash);
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
            if (decimals === undefined) throw new Error(copy.payment.decimals);
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
      <Label>
        {copy.transaction}: {p.tx.step}
      </Label>
      <ResultView value={p.tx} />
    </Card>
  );
}
export function PaymentRequestForm({ parsePaymentRequest }: { parsePaymentRequest: PaymentRequestParser }) {
  const [uri, setUri] = useState('');
  const copy = EXAMPLE_COPY[useModalLanguage()];
  const a = useAction();
  const [request, setRequest] = useState<Parameters<typeof PaymentForm>[0]['initial']>();
  return (
    <>
      <Card title={copy.request.title}>
        <Label>{copy.request.intro}</Label>
        <Field
          label={copy.request.uri}
          value={uri}
          multiline
          onChangeText={(value) => {
            setUri(value);
            setRequest(undefined);
          }}
        />
        <ActionButton
          title={copy.request.read}
          onPress={() =>
            void a.run(async () => {
              const parsed = parsePaymentRequest(uri.trim());
              if (parsed.operation !== 'pay') throw new Error(copy.request.onlyPay);
              if (parsed.memoType && parsed.memoType !== 'MEMO_TEXT') throw new Error(copy.request.textMemo);
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
        <Label>{copy.request.noCamera}</Label>
        <ActionState action={a} />
      </Card>
      {request && <PaymentForm key={JSON.stringify(request)} initial={request} />}
    </>
  );
}
