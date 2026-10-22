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
import { WalletButton } from '../src/components/wallet-button/WalletButton';

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
  for (const name of ['Auth', 'Network', 'Transaction', 'WalletBalance', 'EnabledAssets', 'TxHistory', 'Sessions', 'Cosign']) {
    listeners.set(name, new Set());
    client['on' + name + 'StateChange'] = jest.fn((cb) => {
      listeners.get(name).add(cb);
      return () => listeners.get(name).delete(cb);
    });
  }
  client.emit = (name) => listeners.get(name).forEach((cb) => cb(client.auth));
  client.getAuthState = () => client.auth;
  client.getTransactionState = () => client.tx;
  client.getWallet = () =>
    client.auth.step === 'authenticated' ? { custody: 'internal', address: 'GTEST', provider: 'email' } : null;
  client.getWallets = () => (client.getWallet() ? [client.getWallet()] : []);
  client.hasWallet = () => client.getWallets().length > 0;
  client.getWalletType = () => null;
  client.getNetwork = () => 'testnet';
  client.getWalletBalanceState = () => client.balance;
  client.recoveryState = { required: false, configured: true };
  client.migrationState = { required: false, toCustody: null, choice: false, wallets: [] };
  client.cosign = {
    pending: [],
    recovery: { status: jest.fn(async () => client.recoveryState) },
    custodyMigration: jest.fn(async () => client.migrationState),
  };
  client.getCosignState = () => client.cosign;
  const confirmationListeners = new Set();
  client.getPendingConfirmations = () => [];
  client.onConfirmationRequest = jest.fn((cb) => {
    confirmationListeners.add(cb);
    return () => confirmationListeners.delete(cb);
  });
  client.listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0) + confirmationListeners.size;
  for (const name of ['getEnabledAssetsState', 'getSessionsState', 'getTxHistoryState'])
    client[name] = () => ({ step: 'idle' });
  for (const name of [
    'login',
    'createWallet',
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
    'quoteRamp',
    'createRampOrder',
    'getRampOrder',
    'listRampOrders',
    'signRampLeg',
    'pollRampOrder',
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

test('a signed-in user without a wallet can create a Solana wallet through native context', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'walletless' } };
  client.getWallet = () => null;
  let wallets = [];
  client.getWallets = () => wallets;
  const wallet = { chain: 'SOLANA', address: 'solana-fixture', custody: 'internal' };
  client.createWallet.mockImplementation(async () => {
    wallets = [wallet];
    client.emit('Auth');
    return wallet;
  });
  function WalletProbe() {
    const p = usePollar();
    return (
      <>
        <Text>{`signed in: ${p.isAuthenticated}, wallet: ${p.hasWallet}`}</Text>
        <ActionButton title="Create wallet" onPress={() => void p.createWallet()} />
      </>
    );
  }
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <WalletProbe />
    </PollarProvider>,
  );
  expect(view.getByText('signed in: true, wallet: false')).toBeTruthy();
  await act(async () => fireEvent.press(view.getByText('Create wallet')));
  expect(client.createWallet).toHaveBeenCalledTimes(1);
  expect(view.getByText('signed in: true, wallet: true')).toBeTruthy();
  expect(client.getWallet()).toBeNull();
});

test('native cards opener renders the cards modal and clears it when the session ends', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'cards' } };
  client.getCardProviders = jest.fn(async () => []);
  function CardsProbe() {
    const p = usePollar();
    return <ActionButton title="Open cards" onPress={p.openCardModal} />;
  }
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <CardsProbe />
    </PollarProvider>,
  );
  await act(async () => fireEvent.press(view.getByText('Open cards')));
  await waitFor(() => expect(view.getByText('Cards are not available for this app.')).toBeTruthy());
  expect(client.getCardProviders).toHaveBeenCalled();
  await act(async () => {
    client.auth = { step: 'idle' };
    client.emit('Auth');
  });
  expect(view.queryByText('Cards are not available for this app.')).toBeNull();
});

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

const rampFixtures = () => {
  const bob = { kind: 'fiat', currency: 'BOB', rail: 'QR', country: 'BO' };
  const usdc = { kind: 'asset', code: 'USDC', identifier: 'GA5Z', chain: 'STELLAR' };
  const leg = { index: 0, kind: 'PROVIDER_ONRAMP', from: bob, to: usdc };
  const order = (pendingAction, patch = {}) => ({
    id: 'ramp-1',
    direction: 'ONRAMP',
    state: 'awaiting_payment',
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
    legs: [
      {
        ...leg,
        status: 'AWAITING_ACTION',
        amountInPlanned: '100',
        amountOutPlanned: '14.2',
        amountInActual: null,
        amountOutActual: null,
        onchainTxHash: null,
        signingMode: null,
        fundsLocation: null,
        failure: null,
      },
    ],
    pendingAction,
    failure: null,
    nextPollAfter: '2099-01-01T00:00:00Z',
    ...patch,
  });
  const quote = {
    quoteId: 'quote',
    expiresAt: '2099-01-01T00:00:00Z',
    amountIn: '100',
    amountOut: '14.2',
    etaSeconds: null,
    legs: [
      {
        ...leg,
        amountIn: '100',
        amountOut: '14.2',
        providerFees: [],
        fees: [],
        etaSeconds: null,
        expiresAt: null,
        wallet: null,
        requiredFields: [{ key: 'name', label: 'Full name', type: 'text' }],
      },
    ],
  };
  const signature = {
    kind: 'SIGNATURE',
    actionId: 'sign',
    legIndex: 0,
    chain: 'STELLAR',
    payload: { encoding: 'xdr', value: 'x' },
    summary: 'payment',
    expiresAt: '2099-01-01T00:00:00Z',
  };
  return { route: { fiat: bob, asset: usdc, legs: ['PROVIDER_ONRAMP'] }, quote, order, signature };
};

test('ramp route discovery stays stable and a settled order stops polling', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'refund-session' } };
  const { order } = rampFixtures();
  client.pollRampOrder.mockImplementation(() => new Promise(() => {}));
  function SavedRamp() {
    const p = usePollar();
    return (
      <>
        <ActionButton title="Load pending" onPress={() => p.setRamp({ direction: 'ONRAMP', order: order(null) })} />
        <ActionButton
          title="Load refund"
          onPress={() => p.setRamp({ direction: 'ONRAMP', order: order(null, { state: 'refunded', nextPollAfter: null }) })}
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
  expect(client.pollRampOrder).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.press(view.getByText('Load refund')));
  expect(view.getByText('New ramp order')).toBeTruthy();
  expect(client.pollRampOrder).toHaveBeenCalledTimes(1);
  expect(client.getRampRoutes).toHaveBeenCalledTimes(1);
  await view.unmountAsync();
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
test('a wallet without recovery hides its address in Receive and opens the recovery modal', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 's1' } };
  const locked = {
    required: true,
    configured: false,
    subOrgId: 'o1',
    endUserId: 'u1',
    walletId: 'w1',
    authProxyConfigId: 'c1',
    email: { address: null, verified: false },
    passkeys: [],
    devices: [{ id: 'k1', publicKey: 'ab'.repeat(33), session: false }],
  };
  client.recoveryState = locked;
  Object.assign(client.cosign.recovery, { passkeyAvailable: false });
  client.cosign.devices = jest.fn(async () => ({
    devices: [{ id: 'k1', publicKey: 'ab'.repeat(33), label: null }],
    enrollments: [],
  }));
  client.cosign.publicKeyHex = jest.fn(async () => 'ab'.repeat(33));
  PollarClient.mockImplementation(() => client);
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <ReceiveModal onClose={() => undefined} />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText('Set up recovery')).toBeTruthy());
  expect(view.queryByText('GTEST')).toBeNull();
  await act(async () => fireEvent.press(view.getByText('Set up recovery')));
  await waitFor(() => expect(view.getByText('Wallet recovery')).toBeTruthy());
  expect(view.getByText(/nobody can get them back, not the app and not Pollar/)).toBeTruthy();
  expect(view.getByText("Passkeys aren't available in this app.")).toBeTruthy();
  expect(view.getByText('This device')).toBeTruthy();
  await view.unmountAsync();
});
test('a signed-in user without a wallet picks the custody and accepts the self-custody risks', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 's1' } };
  client.getWallet = () => null;
  client.getWallets = () => [];
  client.hasWallet = () => false;
  client.createWallet = jest.fn(async () => ({ custody: 'internal', address: 'GNEW', provider: 'email' }));
  PollarClient.mockImplementation(() => client);
  const view = await renderAsync(
    <PollarProvider
      config={{ apiKey: 'test' }}
      appConfig={{ ...config, application: { ...config.application, walletCustodyMode: 'USER_CHOICE' } }}
    >
      <WalletButton />
    </PollarProvider>,
  );
  await act(async () => fireEvent.press(view.getByText('No wallet')));
  expect(view.getByText('Create co-signed wallet')).toBeTruthy();
  await act(async () => fireEvent.press(view.getByText('Create self-custody wallet')));
  expect(view.getByText(/nobody can recover the wallet or its funds/)).toBeTruthy();
  expect(view.getByLabelText('Create self-custody wallet').props.accessibilityState).toMatchObject({ disabled: true });
  await act(async () => fireEvent.press(view.getByText('I understand and accept these risks')));
  await act(async () => fireEvent.press(view.getByText('Create self-custody wallet')));
  expect(client.createWallet).toHaveBeenCalledWith({ custody: 'SELF_CUSTODY' });
  await view.unmountAsync();
});
test('a custodial wallet in a co-signed app is moved before anything else, then asked for recovery', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 's1' } };
  const walletRow = (chain, address, addressChanges) => ({
    chain,
    address,
    required: true,
    status: 'NONE',
    addressChanges,
    newAddress: null,
    error: null,
  });
  client.migrationState = {
    required: true,
    toCustody: 'COSIGNED',
    choice: false,
    wallets: [walletRow('STELLAR', 'GTEST', false), walletRow('SOLANA', 'So1anaTestAddress1111', true)],
  };
  client.cosign.migrateWallets = jest.fn(async () => {
    client.migrationState = { ...client.migrationState, required: false, wallets: [] };
    return client.migrationState;
  });
  client.recoveryState = {
    required: true,
    configured: false,
    subOrgId: 'o1',
    endUserId: 'u1',
    walletId: 'w1',
    authProxyConfigId: 'c1',
    email: { address: null, verified: false },
    passkeys: [],
    devices: [],
  };
  Object.assign(client.cosign.recovery, { passkeyAvailable: false });
  client.cosign.devices = jest.fn(async () => ({
    devices: [{ id: 'k1', publicKey: 'ab'.repeat(33), label: null }],
    enrollments: [],
  }));
  client.cosign.publicKeyHex = jest.fn(async () => 'ab'.repeat(33));
  PollarClient.mockImplementation(() => client);
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <Text>child</Text>
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText('Move your wallets to this device')).toBeTruthy());
  expect(view.getByText(/Your Solana address changes/)).toBeTruthy();
  expect(view.getByText('Same address')).toBeTruthy();
  await act(async () => fireEvent.press(view.getByText('Move my wallets')));
  expect(client.cosign.migrateWallets).toHaveBeenCalledWith(undefined);
  await waitFor(() => expect(view.queryByText('Move your wallets to this device')).toBeNull());
  await waitFor(() => expect(view.getByText('Wallet recovery')).toBeTruthy());
  await view.unmountAsync();
});
test('a wallet blocked by something pending says what, and lets the user carry on for now', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 's1' } };
  client.migrationState = {
    required: true,
    toCustody: 'COSIGNED',
    choice: false,
    wallets: [
      {
        chain: 'POLYGON',
        address: '0xabc0000000000000000000000000000000000def',
        required: true,
        status: 'NONE',
        addressChanges: true,
        newAddress: null,
        error: null,
      },
    ],
  };
  const { PollarApiError } = jest.requireActual('@pollar/core');
  client.cosign.migrateWallets = jest.fn(async () => {
    throw new PollarApiError('SDK_CUSTODY_MIGRATION_BLOCKED', { reasons: ['1 open ramp order(s)'] });
  });
  PollarClient.mockImplementation(() => client);
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <Text>child</Text>
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText('Move your wallets to this device')).toBeTruthy());
  await act(async () => fireEvent.press(view.getByText('Move my wallets')));
  await waitFor(() => expect(view.getByText(/1 open ramp order\(s\)/)).toBeTruthy());
  await act(async () => fireEvent.press(view.getByText('Continue for now')));
  await waitFor(() => expect(view.queryByText('Move your wallets to this device')).toBeNull());
  await view.unmountAsync();
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
  expect(client.listenerCount()).toBe(9);
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
test('ramp panel quotes a route, sends the fields as payee and keeps the order across remount', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'session' } };
  const { route, quote, order } = rampFixtures();
  client.getRampRoutes.mockResolvedValue({ routes: [route] });
  client.quoteRamp.mockResolvedValue({ quotes: [quote], rejected: [] });
  client.createRampOrder.mockResolvedValue(order(null));
  client.pollRampOrder.mockImplementation(() => new Promise(() => {}));
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <RampPanel key="first" />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText(/BO BOB \(QR\) \/ USDC on STELLAR/)).toBeTruthy());
  fireEvent.press(view.getByText(/BO BOB \(QR\) \/ USDC on STELLAR/));
  fireEvent.changeText(view.getByLabelText('Amount you send'), '100');
  await act(async () => fireEvent.press(view.getByText('Get ramp quotes')));
  expect(client.quoteRamp).toHaveBeenCalledWith({
    direction: 'ONRAMP',
    fiat: { currency: 'BOB', rail: 'QR', country: 'BO' },
    asset: { code: 'USDC', identifier: 'GA5Z', chain: 'STELLAR' },
    amount: { value: '100', denomination: 'in' },
  });
  fireEvent.press(view.getByText('Select this route'));
  fireEvent.changeText(view.getByLabelText('Full name'), 'Ana Perez');
  await act(async () => fireEvent.press(view.getByText('Create order')));
  expect(client.createRampOrder).toHaveBeenCalledWith({ quoteId: 'quote', payee: { name: 'Ana Perez' } });
  await view.rerenderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <RampPanel key="second" />
    </PollarProvider>,
  );
  expect(view.getByText(/Order ramp-1/)).toBeTruthy();
  expect(client.createRampOrder).toHaveBeenCalledTimes(1);
});

test('the native widget signs a leg only when the user presses Authorize, once', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 'widget-session' } };
  const { route, order, signature } = rampFixtures();
  client.getRampRoutes.mockResolvedValue({ routes: [route] });
  client.listRampOrders.mockResolvedValue({ orders: [order(signature)], nextCursor: null });
  client.getRampOrder.mockResolvedValue(order(signature));
  client.pollRampOrder.mockImplementation(() => new Promise(() => {}));
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'test' }} appConfig={config}>
      <RampWidget onClose={() => {}} />
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText(/Resume purchase/)).toBeTruthy());
  await act(async () => fireEvent.press(view.getByText(/Resume purchase/)));
  expect(client.signRampLeg).not.toHaveBeenCalled();
  let finish;
  client.signRampLeg.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  await act(async () => fireEvent.press(view.getByText('Authorize')));
  // While the wallet is asked, the request cannot be sent again.
  await act(async () => fireEvent.press(view.getByText('Waiting for your wallet…')));
  expect(client.signRampLeg).toHaveBeenCalledTimes(1);
  expect(client.signRampLeg).toHaveBeenCalledWith('ramp-1', 'sign');
  await act(async () => finish(order(null, { state: 'processing' })));
  await view.unmountAsync();
});

test('provider replaces configuration and platform/Privy adapters and cleans up subscriptions', async () => {
  const first = fakeClient();
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'first' }} appConfig={config}>
      <Probe />
    </PollarProvider>,
  );
  expect(first.listenerCount()).toBe(9);
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
  expect(second.listenerCount()).toBe(9);
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

test('cosign prompt verifies a request once and enables Approve while the pending list refreshes', async () => {
  const client = fakeClient();
  client.auth = { step: 'authenticated', verified: true, session: { clientSessionId: 's1' } };
  const request = { id: 'r1', status: 'PENDING', kind: 'TX', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  let state = { pending: [] };
  client.getCosignState = () => state;
  // Like core, every refresh of the pending list hands back new objects for the same requests.
  client.cosign = {
    pending: jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      state = { pending: state.pending.map((r) => ({ ...r })) };
      client.emit('Cosign');
      return state.pending;
    }),
    inspectQuorum: jest.fn(async () => ({ ok: true })),
    verify: jest.fn(() => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 40))),
    recovery: client.cosign.recovery,
    custodyMigration: client.cosign.custodyMigration,
  };
  PollarClient.mockImplementation(() => client);
  const view = await renderAsync(
    <PollarProvider config={{ apiKey: 'k' }} appConfig={config}>
      <Text>child</Text>
    </PollarProvider>,
  );
  await waitFor(() => expect(view.getByText('child')).toBeTruthy());
  await act(async () => {
    state = { pending: [request] };
    client.emit('Cosign');
  });
  for (let i = 0; i < 12; i++) await act(() => new Promise((resolve) => setTimeout(resolve, 15)));
  expect(view.getByText('Verified: this is exactly what will be signed.')).toBeTruthy();
  expect(client.cosign.verify).toHaveBeenCalledTimes(1);
  expect(client.cosign.pending).toHaveBeenCalledTimes(1);
  expect(client.cosign.inspectQuorum).toHaveBeenCalledTimes(1);
  await view.unmountAsync();
});
