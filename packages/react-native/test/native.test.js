import React from 'react';
import { ActivityIndicator, Modal, Text } from 'react-native';
import { act, fireEvent, render, renderAsync, waitFor } from '@testing-library/react-native';
import { PollarClient } from '@pollar/core';
import { PollarProvider, usePollar } from '../src/context';
import {
  FeaturePanel,
  WalletPanel,
  KycPreview,
  TransactionPanel,
  RampPanel,
  AuthPanel,
  EarnPanel,
} from '../src/components/FeaturePanel';
import { RampWidget } from '../src/components/ramp-widget/RampWidget';
import { KycModal } from '../src/components/kyc-modal/KycModal';
import { LoginModalTemplate } from '../src/components/login-modal/LoginModalUI';
import { ActionButton, ActionState, useAction } from '../src/components/native-ui';
import { AppShell } from '../src/components/AppShell';
import { FeatureCatalog } from '../src/components/FeatureCatalog';
import { BalanceLookup, PaymentForm, SignTransactionForm } from '../src/components/FeatureExample';
import { ReceiveModal } from '../src/components/FeatureModal';

jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});
jest.mock('@pollar/core', () => ({
  ...jest.requireActual('@pollar/core'),
  PollarClient: jest.fn(),
  isPollarClient: (value) => value?.__client === true,
  AUTH_ERROR_CODES: {},
  WalletType: {},
}));
const config = { application: { name: 'Test', network: 'testnet', chains: [] }, styles: {} };
function fakeClient() {
  const listeners = new Map();
  const client = { __client: true, auth: { step: 'idle' }, tx: { step: 'idle' }, balance: { step: 'idle' }, configCalls: 0 };
  for (const name of ['Auth', 'Network', 'Transaction', 'WalletBalance', 'EnabledAssets', 'TxHistory', 'Sessions']) {
    listeners.set(name, new Set());
    client['on' + name + 'StateChange'] = jest.fn((cb) => {
      listeners.get(name).add(cb);
      return () => listeners.get(name).delete(cb);
    });
  }
  client.emit = (name) => listeners.get(name).forEach((cb) => cb(client.auth));
  client.listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
  client.getAuthState = () => client.auth;
  client.getTransactionState = () => client.tx;
  client.getWallet = () =>
    client.auth.step === 'authenticated' ? { custody: 'internal', address: 'GTEST', provider: 'email' } : null;
  client.getWallets = () => (client.getWallet() ? [client.getWallet()] : []);
  client.getWalletType = () => null;
  client.getNetwork = () => 'testnet';
  client.getWalletBalanceState = () => client.balance;
  for (const name of ['getEnabledAssetsState', 'getSessionsState', 'getTxHistoryState'])
    client[name] = () => ({ step: 'idle' });
  for (const name of [
    'login',
    'buildTx',
    'signAndSubmitTx',
    'signTx',
    'submitTx',
    'buildAndSignAndSubmitTx',
    'runTx',
    'sendPayment',
    'refreshAssets',
    'setTrustline',
    'getSwapConfig',
    'getSwapTokens',
    'getSwapQuote',
    'swap',
    'getEarnProviders',
    'getEarnOpportunities',
    'getEarnPosition',
    'earnDeposit',
    'earnWithdraw',
    'getRampsQuote',
    'getRampCountries',
    'createOnRamp',
    'createOffRamp',
    'getRampTransaction',
    'getRampKycStatus',
    'getRampLiquidity',
    'submitRampSignature',
    'completeWithdraw',
    'listDistributionRules',
    'claimDistributionRule',
    'fetchSessions',
    'revokeSession',
    'fetchTxHistory',
    'cancelLogin',
    'destroy',
    'setNetwork',
    'refreshBalance',
  ])
    client[name] = jest.fn(async () => {});
  client.getKycProviders = jest.fn(async () => ({ providers: [] }));
  client.getRampRoutes = jest.fn(async () => ({ routes: [] }));
  client.getAppConfig = jest.fn(async () => config);
  client.logout = jest.fn(async () => {
    client.auth = { step: 'idle' };
    client.emit('Auth');
  });
  client.beginEmailLogin = jest.fn(() => {
    client.auth = { step: 'entering_email', clientSessionId: 'email' };
    client.emit('Auth');
  });
  client.sendEmailCode = jest.fn((email) => {
    client.auth = { step: 'entering_code', clientSessionId: 'email', email };
    client.emit('Auth');
  });
  client.verifyEmailCode = jest.fn(() => {
    client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'email' } };
    client.emit('Auth');
  });
  PollarClient.mockImplementation(() => client);
  return client;
}
function Probe() {
  const p = usePollar();
  return (
    <>
      <Text testID="auth">{String(p.verified)}</Text>
      <Text testID="address">{p.walletAddress}</Text>
      <ActionButton title="Login" onPress={p.openLoginModal} />
      <ActionButton title="Receive" onPress={p.openReceiveModal} />
      <ActionButton title="Logout" onPress={() => void p.logout()} />
    </>
  );
}
beforeEach(() => jest.clearAllMocks());

test('earn provider changes clear old opportunities and block choices during loading', async () => {
  const client = fakeClient();
  client.getEarnProviders.mockResolvedValue(['blend', 'defindex']);
  let resolveOpportunities;
  client.getEarnOpportunities.mockResolvedValueOnce([{ id: 'blend-only' }]).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOpportunities = resolve;
      }),
  );
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <EarnPanel />
    </PollarProvider>,
  );
  await act(async () => fireEvent.press(view.getByLabelText('blend')));
  expect(view.getByLabelText('blend-only')).toBeTruthy();
  fireEvent.press(view.getByLabelText('defindex'));
  expect(view.queryByLabelText('blend-only')).toBeNull();
  expect(view.getByLabelText('blend')).toBeDisabled();
  fireEvent.press(view.getByLabelText('blend'));
  expect(client.getEarnOpportunities).toHaveBeenCalledTimes(2);
  await act(async () => resolveOpportunities([{ id: 'defindex-only' }]));
  expect(view.getByLabelText('defindex-only')).toBeTruthy();
  expect(view.getByLabelText('blend')).toBeEnabled();
});

test('ramp route discovery stays stable and refunded lifecycle stops status polling', async () => {
  jest.useFakeTimers();
  try {
    const client = fakeClient();
    client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'refund-session' } };
    const pending = { txId: 'refund-fixture', provider: 'Fixture', status: 'pending', lifecycleState: 'awaiting_payment' };
    client.getRampTransaction.mockResolvedValue(pending);
    function SavedRamp() {
      const p = usePollar();
      return (
        <>
          <ActionButton title="Load pending" onPress={() => p.setRamp({ direction: 'offramp', transaction: pending })} />
          <ActionButton
            title="Load refund"
            onPress={() => p.setRamp({ direction: 'offramp', transaction: { ...pending, lifecycleState: 'refunded' } })}
          />
          <RampPanel />
        </>
      );
    }
    const view = await renderAsync(
      <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
        <SavedRamp />
      </PollarProvider>,
    );
    await act(async () => fireEvent.press(view.getByText('Load pending')));
    await act(async () => jest.advanceTimersByTime(5000));
    expect(client.getRampTransaction).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(view.getByText('Load refund')));
    expect(view.getByText('New ramp transaction')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(15000));
    expect(client.getRampTransaction).toHaveBeenCalledTimes(1);
    expect(client.getRampRoutes).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Complete withdrawal after verification')).toBeNull();
    await view.unmountAsync();
  } finally {
    jest.useRealTimers();
  }
});

test('exported ramp and KYC components preserve native modal dismissal', async () => {
  fakeClient();
  const onClose = jest.fn();
  const ramp = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <RampWidget onClose={onClose} />
    </PollarProvider>,
  );
  fireEvent(
    ramp.UNSAFE_getAllByType(Modal).find((modal) => modal.props.onRequestClose === onClose),
    'requestClose',
  );
  expect(onClose).toHaveBeenCalledTimes(1);
  await ramp.unmountAsync();
  const kyc = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <KycModal onClose={onClose} country="BO" />
    </PollarProvider>,
  );
  fireEvent(kyc.UNSAFE_getByType(Modal), 'requestClose');
  expect(onClose).toHaveBeenCalledTimes(2);
});

test.each(['signing_wallet_challenge', 'creating_passkey', 'deploying_smart_account'])(
  '%s keeps login controls busy',
  (step) => {
    const submit = jest.fn();
    const view = render(
      <LoginModalTemplate
        theme="light"
        accentColor="#1763df"
        logoUrl={null}
        emailEnabled
        embeddedWallets
        providers={{ google: true, github: true, discord: false, x: false, apple: false }}
        appName="Fixture"
        email="user@example.test"
        authState={{ step }}
        onEmailSubmit={submit}
        onBack={jest.fn()}
        onCancel={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    expect(view.getByText('Submit')).toBeDisabled();
    expect(view.getByText('Google')).toBeDisabled();
    expect(view.getByText('Wallet')).toBeDisabled();
    expect(view.UNSAFE_getAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    fireEvent.press(view.getByText('Submit'));
    expect(submit).not.toHaveBeenCalled();
  },
);
test('SDK catalog reports route selection without owning app routing', () => {
  const select = jest.fn();
  const view = render(
    <FeatureCatalog
      eyebrow="SDK"
      title="Products"
      description="Native"
      sections={[{ id: 'wallet', title: 'Wallet', items: [{ id: '/send', title: 'Send', description: 'Send assets' }] }]}
      onSelect={select}
    />,
  );
  fireEvent.press(view.getByLabelText('Send'));
  expect(select).toHaveBeenCalledWith('/send');
});
test('SDK shell uses WalletButton and closes drawer on navigation and Android Back', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true };
  const navigate = jest.fn();
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <AppShell
        path="/send"
        currentKey="wallet"
        groups={[
          {
            key: 'wallet',
            section: 'products',
            tabs: [
              { href: '/send', label: 'Send' },
              { href: '/receive', label: 'Receive' },
            ],
          },
        ]}
        sections={['products']}
        settings={{ theme: 'dark', language: 'en' }}
        label={(v) => v}
        onPreferencesChange={async () => {}}
        onNavigate={navigate}
      >
        <Text>Content</Text>
      </AppShell>
    </PollarProvider>,
  );
  fireEvent.press(view.getByLabelText('Open connected wallet'));
  expect(view.getByLabelText('Wallet balance')).toBeTruthy();
  act(() =>
    view
      .UNSAFE_getAllByType(Modal)
      .find((m) => m.props.visible)
      .props.onRequestClose(),
  );
  fireEvent.press(view.getByLabelText('Open navigation menu'));
  fireEvent.press(view.getByLabelText('wallet'));
  expect(navigate).toHaveBeenCalledWith('/send');
  expect(view.UNSAFE_getAllByType(Modal).filter((m) => m.props.visible)).toHaveLength(0);
  fireEvent.press(view.getByLabelText('Open navigation menu'));
  act(() =>
    view
      .UNSAFE_getAllByType(Modal)
      .find((m) => m.props.visible)
      .props.onRequestClose(),
  );
  expect(view.UNSAFE_getAllByType(Modal).filter((m) => m.props.visible)).toHaveLength(0);
});
test('ported balance lookup rejects invalid addresses and uses the configured core client', async () => {
  const client = fakeClient();
  client.getWalletBalance = jest.fn(async () => ({ balances: [] }));
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <BalanceLookup />
    </PollarProvider>,
  );
  fireEvent.changeText(view.getByLabelText('Public key (optional)'), 'invalid');
  await act(async () => fireEvent.press(view.getByText('Fetch balances')));
  expect(client.getWalletBalance).not.toHaveBeenCalled();
  expect(view.getByText('Enter a valid Stellar public key.')).toBeTruthy();
  const address = 'G' + 'A'.repeat(55);
  fireEvent.changeText(view.getByLabelText('Public key (optional)'), address);
  await act(async () => fireEvent.press(view.getByText('Fetch balances')));
  expect(client.getWalletBalance).toHaveBeenCalledWith(address);
});
test('ported payment form requires review and prevents repeated confirmation', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true };
  let finish;
  client.runTx.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <PaymentForm />
    </PollarProvider>,
  );
  fireEvent.changeText(view.getByLabelText('Destination'), 'G' + 'A'.repeat(55));
  fireEvent.changeText(view.getByLabelText('Amount'), '1');
  await act(async () => fireEvent.press(view.getByText('Review payment')));
  expect(client.runTx).not.toHaveBeenCalled();
  const button = view.getByText('Confirm payment');
  act(() => {
    fireEvent.press(button);
    fireEvent.press(button);
  });
  expect(client.runTx).toHaveBeenCalledTimes(1);
  await act(async () => finish({ status: 'pending' }));
});
test('ported XDR form forwards sponsorship metadata and clears the signature on edit', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true };
  client.signTx.mockResolvedValue({ status: 'signed', signedXdr: 'SIGNED', submissionToken: 'TOKEN' });
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <SignTransactionForm />
    </PollarProvider>,
  );
  fireEvent.changeText(view.getByLabelText('Unsigned Stellar XDR'), 'UNSIGNED');
  await act(async () => fireEvent.press(view.getByText('1. signTx(xdr)')));
  await act(async () => fireEvent.press(view.getByText('2. submitTx(signedXdr)')));
  expect(client.submitTx).toHaveBeenCalledWith('SIGNED', { submissionToken: 'TOKEN' });
  fireEvent.changeText(view.getByLabelText('Unsigned Stellar XDR'), 'CHANGED');
  expect(view.queryByText('2. submitTx(signedXdr)')).toBeNull();
});
test('web-equivalent ReceiveModal uses native QR/address and supports Android Back', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true };
  const close = jest.fn();
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <ReceiveModal onClose={close} />
    </PollarProvider>,
  );
  expect(view.getByText('GTEST')).toBeTruthy();
  act(() =>
    view
      .UNSAFE_getAllByType(Modal)
      .find((m) => m.props.visible)
      .props.onRequestClose(),
  );
  expect(close).toHaveBeenCalledTimes(1);
});
test('Strict Mode creates one owned client and destroys it on unmount', async () => {
  const client = fakeClient();
  PollarClient.mockImplementation(() => client);
  const view = await renderAsync(
    <React.StrictMode>
      <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
        <Probe />
      </PollarProvider>
    </React.StrictMode>,
  );
  await waitFor(() => expect(view.getByTestId('auth')).toBeTruthy());
  expect(PollarClient).toHaveBeenCalledTimes(1);
  expect(client.listenerCount()).toBe(7);
  await view.unmountAsync();
  expect(client.destroy).toHaveBeenCalledTimes(1);
  expect(client.listenerCount()).toBe(0);
});
test('restored sessions remain unverified until core confirms and logout clears them', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: false };
  const view = render(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <Probe />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByTestId('address').props.children).toBe('GTEST'));
  expect(view.getByTestId('auth').props.children).toBe('false');
  act(() => {
    client.auth = { step: 'authenticated', verified: true };
    client.emit('Auth');
  });
  expect(view.getByTestId('auth').props.children).toBe('true');
  await act(async () => fireEvent.press(view.getByText('Logout')));
  expect(view.getByTestId('address').props.children).toBe('');
  view.unmount();
  expect(client.destroy).toHaveBeenCalledTimes(1);
});
test('modal replacement uses one host and Android Back cancels login', async () => {
  const client = fakeClient();
  const view = render(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <Probe />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText('Login')).toBeTruthy());
  fireEvent.press(view.getByText('Login'));
  expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
  act(() => view.UNSAFE_getByType(Modal).props.onRequestClose());
  expect(client.cancelLogin).toHaveBeenCalled();
  expect(view.UNSAFE_queryAllByType(Modal).filter((modal) => modal.props.visible)).toHaveLength(0);
});
test('failed remote configuration can be retried', async () => {
  const client = fakeClient();
  client.getAppConfig.mockRejectedValueOnce(new Error('Offline'));
  const view = render(
    <PollarProvider config={{ apiKey: 'test' }}>
      <FeaturePanel feature="wallet" />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText('Retry configuration')).toBeTruthy());
  fireEvent.press(view.getByText('Retry configuration'));
  await waitFor(() => expect(view.getByText('Sign in')).toBeTruthy());
  expect(client.getAppConfig).toHaveBeenCalledTimes(2);
});
test('unavailable balances are not rendered as zero; clipboard failures are visible', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true };
  client.balance = {
    step: 'loaded',
    data: {
      balances: [
        { chain: 'STELLAR', code: 'USDC', issuer: 'one', balance: null },
        { chain: 'SOLANA', code: 'USDC', issuer: 'two', balance: '5' },
      ],
    },
  };
  const copyText = jest.fn(async () => {
    throw new Error('Clipboard unavailable');
  });
  const view = render(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config} platform={{ copyText }}>
      <WalletPanel />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText('STELLAR · USDC: Unavailable')).toBeTruthy());
  expect(view.getByText('SOLANA · USDC: 5')).toBeTruthy();
  await act(async () => fireEvent.press(view.getByText('Copy STELLAR address')));
  expect(view.getByText('Clipboard unavailable')).toBeTruthy();
  expect(view.queryByText('Copied')).toBeNull();
});
test('action lock blocks duplicate presses before rerender and allows retry after rejection', async () => {
  let reject;
  const request = jest.fn(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  function TestAction() {
    const action = useAction();
    return (
      <>
        <ActionButton title="Run" disabled={action.busy} onPress={() => void action.run(request)} />
        <ActionState action={action} />
      </>
    );
  }
  const view = render(
    <PollarProvider config={(fakeClient(), { apiKey: 'test' })} appConfig={config}>
      <TestAction />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText('Run')).toBeTruthy());
  act(() => {
    fireEvent.press(view.getByText('Run'));
    fireEvent.press(view.getByText('Run'));
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('Try again')));
  expect(view.getByText('Try again')).toBeTruthy();
  fireEvent.press(view.getByText('Run'));
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => reject(new Error('Done')));
});
test('KYC preview has no approval action', async () => {
  const view = render(
    <PollarProvider config={(fakeClient(), { apiKey: 'test' })} appConfig={config}>
      <KycPreview />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText('Identity verification · Preview')).toBeTruthy());
  expect(view.queryByText('Start Verification')).toBeNull();
  expect(view.queryByText('Verification Complete')).toBeNull();
});
test('email code remains actionable after the core enters entering_code', async () => {
  const client = fakeClient();
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <AuthPanel />
    </PollarProvider>,
  );
  fireEvent.changeText(view.getByLabelText('Email'), 'test@example.com');
  await act(async () => fireEvent.press(view.getByText('Send code')));
  expect(client.sendEmailCode).toHaveBeenCalledWith('test@example.com');
  fireEvent.changeText(view.getByLabelText('Verification code'), '123456');
  await act(async () => fireEvent.press(view.getByText('Verify code')));
  expect(client.verifyEmailCode).toHaveBeenCalledWith('123456');
  expect(view.getByText('Session verified')).toBeTruthy();
});
test('split signing forwards sponsorship token and pending is not success', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true };
  client.signTx.mockResolvedValue({ status: 'signed', signedXdr: 'SIGNED', submissionToken: 'TOKEN' });
  client.submitTx.mockResolvedValue({ status: 'pending', hash: 'hash' });
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <TransactionPanel />
    </PollarProvider>,
  );
  fireEvent.changeText(view.getByLabelText('Unsigned Stellar XDR'), 'UNSIGNED');
  await act(async () => fireEvent.press(view.getByText('Sign transaction')));
  await act(async () => fireEvent.press(view.getByText('Submit signed transaction')));
  expect(client.submitTx).toHaveBeenCalledWith('SIGNED', { submissionToken: 'TOKEN' });
  expect(view.getByText(/"status": "pending"/)).toBeTruthy();
  expect(view.queryByText(/"status": "success"/)).toBeNull();
});
test('ramp uses real quotes and preserves a pending transaction across panel remount', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'session' } };
  client.getRampsQuote.mockResolvedValue({
    quotes: [{ quoteId: 'quote', provider: 'Bank', rail: 'SPEI', fee: 1, feeCurrency: 'MXN', requiredFields: [] }],
  });
  client.createOnRamp.mockResolvedValue({ txId: 'ramp-1', provider: 'Bank', status: 'pending' });
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <RampPanel key="first" />
    </PollarProvider>,
  );
  fireEvent.changeText(view.getByLabelText('Country code (e.g. MX)'), 'MX');
  fireEvent.changeText(view.getByLabelText('Currency (e.g. MXN)'), 'MXN');
  fireEvent.changeText(view.getByLabelText('Amount'), '100');
  await act(async () => fireEvent.press(view.getByText('Get ramp quotes')));
  fireEvent.press(view.getByText('Select Bank'));
  await act(async () => fireEvent.press(view.getByText('Confirm onramp')));
  expect(client.createOnRamp).toHaveBeenCalledWith({
    quoteId: 'quote',
    country: 'MX',
    currency: 'MXN',
    amount: 100,
    walletAddress: 'GTEST',
  });
  await view.rerenderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <RampPanel key="second" />
    </PollarProvider>,
  );
  expect(view.getByText('Provider status: pending')).toBeTruthy();
  expect(view.queryByText('Funds Added')).toBeNull();
  expect(client.createOnRamp).toHaveBeenCalledTimes(1);
});

test('registered Polygon route drives the native widget and resumes without signing again', async () => {
  const core = jest.requireActual('@pollar/core');
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'fixture-session' } };
  const route = {
    routeId: 'fixture:PE:offramp',
    direction: 'offramp',
    country: 'PE',
    fiatCurrency: 'PEN',
    rail: 'FUTURE_BANK',
    asset: { code: 'NATIVE', identifier: null, chain: 'POLYGON', network: 'mainnet', precision: 12 },
    limits: { denomination: 'crypto', min: '0.000000000001', max: '100' },
    providerId: 'fixture-provider',
    provider: 'Registered fixture',
    capabilities: { polling: true, callbacks: true, refunds: 'unsupported', continuations: ['user_ready', 'signed_payload'] },
  };
  const transaction = {
    txId: 'fixture-tx',
    provider: 'Registered fixture',
    status: 'pending',
    lifecycleState: 'awaiting_payment',
    transactionVersion: 2,
    reconciliationRequired: false,
    terms: {
      fiatAmount: '20.00',
      fiatCurrency: 'PEN',
      cryptoAmount: '1.123456789012',
      feeAmount: '0',
      feeCurrency: 'PEN',
      assetCode: 'NATIVE',
      assetIssuer: null,
      assetChain: 'POLYGON',
    },
    nextAction: {
      kind: 'sign_transaction',
      actionId: 'fixture-action',
      purpose: 'withdrawal_payment',
      chain: 'POLYGON',
      network: 'mainnet',
      challengeRef: 'fixture-step',
      payload: { encoding: 'fixture-json', value: 'unsigned' },
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  };
  client.getRampRoutes.mockResolvedValue({ routes: [route] });
  client.getRampsQuote.mockResolvedValue({
    quotes: [
      {
        quoteId: 'fixture-quote',
        provider: 'Registered fixture',
        rail: 'FUTURE_BANK',
        requiredFields: [],
        fiatAmount: 20,
        terms: transaction.terms,
      },
    ],
  });
  client.createOffRamp.mockResolvedValue(transaction);
  client.getRampTransaction.mockResolvedValue(transaction);
  client.continueRamp = jest.fn(async () => ({
    ...transaction,
    transactionVersion: 3,
    nextAction: { kind: 'wait', actionId: 'wait', reason: 'settlement_verification' },
  }));
  client._rampSigners = new (require('../../core/src/ramps/workflow').RampSigningRegistry)();
  client.signRampAction = core.PollarClient.prototype.signRampAction;
  const signer = jest.fn(async () => 'signed:unsigned');
  core.PollarClient.prototype.registerRampSigningHandler.call(client, 'POLYGON', 'fixture-json', signer);
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <RampPanel key="first" />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText(/PEN \/ NATIVE/)).toBeTruthy());
  fireEvent.press(view.getByText(/PEN \/ NATIVE/));
  fireEvent.changeText(view.getByLabelText('Amount'), '20');
  await act(async () => fireEvent.press(view.getByText('Get ramp quotes')));
  expect(client.getRampsQuote).toHaveBeenCalledWith(
    expect.objectContaining({ chain: 'POLYGON', routeId: route.routeId, currency: 'PEN' }),
  );
  fireEvent.press(view.getByText('Select Registered fixture'));
  await act(async () => fireEvent.press(view.getByText('Confirm offramp')));
  expect(client.createOffRamp).toHaveBeenCalledWith(expect.objectContaining({ amountExact: '20.00' }));
  expect(signer).not.toHaveBeenCalled();
  expect(view.getByText(/1.123456789012 NATIVE/)).toBeTruthy();
  await act(async () => fireEvent.press(view.getByText('Authorize')));
  expect(signer).toHaveBeenCalledTimes(1);
  await view.rerenderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <RampPanel key="second" />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText('Confirming settlement')).toBeTruthy());
  expect(signer).toHaveBeenCalledTimes(1);
  expect(client.createOffRamp).toHaveBeenCalledTimes(1);
});

test('exported ramp combines registered routes, exact amounts and saved explicit signing', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'generic-ramp' } };
  const route = {
    routeId: 'fixture:MX:offramp',
    direction: 'offramp',
    country: 'MX',
    fiatCurrency: 'MXN',
    rail: 'BANK',
    asset: { code: 'NATIVE', identifier: null, chain: 'POLYGON', network: 'mainnet', precision: 12 },
    limits: { denomination: 'fiat', min: null, max: null },
  };
  const terms = {
    fiatAmount: '20.00',
    fiatCurrency: 'MXN',
    cryptoAmount: '1.123456789012',
    assetCode: 'NATIVE',
    assetChain: 'POLYGON',
    assetIssuer: null,
    feeAmount: '0',
    feeCurrency: 'MXN',
  };
  client.getRampCountries.mockResolvedValue({ countries: [] });
  client.getRampRoutes.mockResolvedValue({ routes: [route] });
  client.getRampsQuote.mockResolvedValue({
    quotes: [
      {
        quoteId: 'too-small',
        provider: 'Minimum route',
        minAmount: 30,
        terms: { ...terms, fiatAmount: '30.00' },
        requiredFields: [],
        fee: 0,
        rate: 20,
        rail: 'BANK',
        protocol: 'REST',
      },
      {
        quoteId: 'fixture',
        provider: 'Fixture',
        route,
        terms,
        requiredFields: [],
        fee: 0,
        feeCurrency: 'MXN',
        rate: 20,
        rail: 'BANK',
        protocol: 'REST',
        estimatedTime: 'minutes',
      },
    ],
  });
  const saved = {
    txId: 'generic-tx',
    provider: 'Fixture',
    status: 'pending',
    lifecycleState: 'awaiting_payment',
    transactionVersion: 2,
    terms,
    nextAction: {
      kind: 'sign_transaction',
      actionId: 'sign',
      purpose: 'withdrawal_payment',
      chain: 'POLYGON',
      network: 'mainnet',
      payload: { encoding: 'fixture-json', value: 'unsigned' },
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  };
  client.createOffRamp.mockResolvedValue(saved);
  client.signRampAction = jest.fn(async () => ({
    ...saved,
    transactionVersion: 3,
    nextAction: { kind: 'wait', actionId: 'wait', reason: 'settlement_verification' },
  }));
  function ReopenRamp() {
    const [open, setOpen] = React.useState(true);
    return open ? (
      <RampWidget onClose={() => setOpen(false)} />
    ) : (
      <ActionButton title="Reopen ramp" onPress={() => setOpen(true)} />
    );
  }
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config} styles={{ theme: 'dark', accentColor: '#abcdef' }}>
      <ReopenRamp />
    </PollarProvider>,
  );
  const routeText = view.getByText('offramp · MXN / NATIVE · POLYGON · BANK');
  expect(routeText).toHaveStyle({ color: '#f3f4f6' });
  fireEvent.press(routeText);
  expect(view.getByRole('button', { selected: true })).toHaveStyle({ borderColor: '#abcdef' });
  fireEvent.changeText(view.getByPlaceholderText('25.00'), '20');
  await act(async () => fireEvent.press(view.getByText('Find routes')));
  expect(client.getRampsQuote).toHaveBeenCalledWith(
    expect.objectContaining({
      routeId: route.routeId,
      country: 'MX',
      currency: 'MXN',
      amountExact: '20',
      chain: 'POLYGON',
    }),
  );
  fireEvent.press(view.getByText('Minimum route'));
  expect(view.getByText('The minimum amount for this route is 30 MXN.')).toBeTruthy();
  expect(client.createOffRamp).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(view.getByText('Fixture')));
  expect(client.createOffRamp).toHaveBeenCalledWith(expect.objectContaining({ amountExact: '20.00' }));
  expect(view.getByText(/1.123456789012 NATIVE/)).toBeTruthy();
  expect(client.signRampAction).not.toHaveBeenCalled();
  act(() =>
    view
      .UNSAFE_getAllByType(Modal)
      .find((modal) => modal.props.visible)
      .props.onRequestClose(),
  );
  await act(async () => fireEvent.press(view.getByText('Reopen ramp')));
  expect(view.getByText(/1.123456789012 NATIVE/)).toBeTruthy();
  expect(client.signRampAction).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(view.getByText('Authorize')));
  expect(client.signRampAction).toHaveBeenCalledTimes(1);
  expect(view.queryByText('Authorize')).toBeNull();
  await view.unmountAsync();
});

test('provider replaces configuration and platform/Privy adapters and cleans up subscriptions', async () => {
  const first = fakeClient();
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'first' }} appConfig={config}>
      <Probe />
    </PollarProvider>,
  );
  expect(first.listenerCount()).toBe(7);
  const second = fakeClient();
  const storage = { get: jest.fn(), set: jest.fn(), remove: jest.fn() };
  const adapter = { type: 'privy', chains: ['STELLAR'] };
  await view.rerenderAsync(
    <PollarProvider config={{ apiKey: 'second' }} platform={{ storage }} privyAdapter={adapter} appConfig={config}>
      <Probe />
    </PollarProvider>,
  );
  expect(first.cancelLogin).toHaveBeenCalledTimes(1);
  expect(first.destroy).toHaveBeenCalledTimes(1);
  expect(first.listenerCount()).toBe(0);
  expect(second.listenerCount()).toBe(7);
  expect(PollarClient).toHaveBeenLastCalledWith(
    expect.objectContaining({ apiKey: 'second', storage, walletAdapters: [adapter] }),
  );
  await view.rerenderAsync(
    <PollarProvider config={{ apiKey: 'second' }} platform={{ storage }} privyAdapter={adapter} appConfig={config}>
      <Probe />
    </PollarProvider>,
  );
  expect(PollarClient).toHaveBeenCalledTimes(2);
  const third = fakeClient();
  const openAuthUrl = jest.fn();
  await view.rerenderAsync(
    <PollarProvider config={{ apiKey: 'second' }} platform={{ storage, openAuthUrl }} appConfig={config}>
      <Probe />
    </PollarProvider>,
  );
  expect(second.destroy).toHaveBeenCalledTimes(1);
  expect(second.listenerCount()).toBe(0);
  expect(PollarClient).toHaveBeenLastCalledWith(expect.objectContaining({ openAuthUrl, walletAdapters: [] }));
  await view.unmountAsync();
  expect(third.destroy).toHaveBeenCalledTimes(1);
  expect(third.listenerCount()).toBe(0);
});

test('login Back and Retry keep the login modal open when authentication returns to idle', async () => {
  const client = fakeClient();
  client.cancelLogin.mockImplementation(() => {
    client.auth = { step: 'idle' };
    client.emit('Auth');
  });
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <Probe />
    </PollarProvider>,
  );
  fireEvent.press(view.getByText('Login'));
  act(() => {
    client.auth = { step: 'entering_code', clientSessionId: 'email', email: 'test@example.com' };
    client.emit('Auth');
  });
  fireEvent.press(view.getByText('←'));
  expect(view.getByText('Log in or sign up')).toBeTruthy();
  expect(view.UNSAFE_getAllByType(Modal).filter((modal) => modal.props.visible)).toHaveLength(1);
  act(() => {
    client.auth = { step: 'error', errorCode: 'NETWORK_ERROR', message: 'Offline' };
    client.emit('Auth');
  });
  await act(async () => fireEvent.press(view.getByText('Retry')));
  expect(view.getByText('Log in or sign up')).toBeTruthy();
  expect(view.UNSAFE_getAllByType(Modal).filter((modal) => modal.props.visible)).toHaveLength(1);
  act(() => {
    client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'email' } };
    client.emit('Auth');
  });
  act(() => {
    client.auth = { step: 'idle' };
    client.emit('Auth');
  });
  expect(view.UNSAFE_queryAllByType(Modal).filter((modal) => modal.props.visible)).toHaveLength(0);
  await view.unmountAsync();
});
