// @pollar smoke test - the React RampWidget on the v3 ramp API: route choice,
// quotes, the fields a quote asks for, the order's progress and its pending
// action, resuming a pending order, and an app out of credits.
//
// Run with `node tests/smoke-ramp-widget.cjs` after `npm run build`.
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://demo.test/' });
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'Event',
  'localStorage',
  'sessionStorage',
])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = async () => new Response(JSON.stringify({ success: true, content: {} }));
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { PollarClient, PollarApiError } = require('../packages/core/dist/index.js');
const { PollarProvider, RampWidget } = require('../packages/react/dist/index.js');
const h = React.createElement;

const later = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();
const bob = { kind: 'fiat', currency: 'BOB', rail: 'QR', country: 'BO' };
const usdc = { kind: 'asset', code: 'USDC', identifier: 'GA5Z', chain: 'STELLAR' };
const quote = {
  quoteId: 'q1',
  expiresAt: later(60),
  amountIn: '100',
  amountOut: '14.2',
  etaSeconds: 300,
  legs: [
    {
      index: 0,
      kind: 'PROVIDER_ONRAMP',
      from: bob,
      to: usdc,
      amountIn: '100',
      amountOut: '14.2',
      providerFees: [],
      fees: [],
      etaSeconds: 300,
      expiresAt: null,
      wallet: null,
      requiredFields: [{ key: 'name', label: 'Full name', type: 'text' }],
    },
  ],
};
const order = (pendingAction, patch = {}) => ({
  id: 'order-0001',
  direction: 'ONRAMP',
  state: 'awaiting_payment',
  createdAt: later(0),
  updatedAt: later(0),
  legs: [
    {
      index: 0,
      kind: 'PROVIDER_ONRAMP',
      status: 'AWAITING_ACTION',
      from: bob,
      to: usdc,
      amountInPlanned: '100',
      amountOutPlanned: '14.2',
      amountInActual: null,
      amountOutActual: null,
      onchainTxHash: null,
      signingMode: null,
      fundsLocation: null,
      failure: null,
      etaSeconds: null,
      steps: [],
      startedAt: null,
    },
  ],
  pendingAction,
  failure: null,
  nextPollAfter: later(5),
  ...patch,
});
const qrAction = {
  kind: 'FIAT_PAYMENT',
  actionId: 'pay',
  legIndex: 0,
  expiresAt: null,
  instructions: {
    kind: 'qr',
    payload: '000201fixture',
    amount: '100',
    currency: 'BOB',
    scannable: {
      kind: 'opaque',
      payload: '000201fixture',
      payloadLabel: 'Payment code',
      image: { mediaType: 'image/svg+xml', encoding: 'utf8', data: '<svg id="fixture-qr"></svg>', inlineSafe: true },
    },
  },
};
// A real payment from the user's account: the widget reads its source before the wallet is asked.
const { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } = require('@stellar/stellar-sdk');
const userKey = Keypair.random();
const paymentFrom = (address) =>
  new TransactionBuilder(new Account(address, '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' }))
    .setTimeout(300)
    .build()
    .toXDR();
const unsignedXdr = paymentFrom(userKey.publicKey());
const signAction = {
  kind: 'SIGNATURE',
  actionId: 'sign',
  legIndex: 0,
  chain: 'STELLAR',
  payload: { encoding: 'xdr', value: unsignedXdr },
  summary: 'payment',
  expiresAt: later(60),
};

function fixtureClient(overrides = {}) {
  const client = new PollarClient({ apiKey: 'pub_mainnet_fixture', baseUrl: 'https://api.test', logLevel: 'silent' });
  const wallet = { address: userKey.publicKey(), network: 'STELLAR' };
  client.getNetworkState = () => ({ step: 'connected', network: 'mainnet' });
  client.onNetworkStateChange = (cb) => {
    cb(client.getNetworkState());
    return () => {};
  };
  client.getWallet = () => wallet;
  client.getWallets = () => [wallet];
  // A wallet the user holds outside Turnkey: nothing to recover.
  client.cosign.recovery.status = async () => ({ required: false, configured: false });
  const calls = [];
  Object.assign(client, {
    getRampRoutes: async (direction) => {
      calls.push(['getRampRoutes', direction]);
      return { routes: [{ fiat: bob, asset: usdc, legs: ['PROVIDER_ONRAMP'] }] };
    },
    listRampOrders: async () => ({ orders: [], nextCursor: null }),
    quoteRamp: async (body) => {
      calls.push(['quoteRamp', body]);
      return { quotes: [quote], rejected: [] };
    },
    createRampOrder: async (body) => {
      calls.push(['createRampOrder', body]);
      return order(qrAction);
    },
    getRampOrder: async (id) => {
      calls.push(['getRampOrder', id]);
      return order(signAction);
    },
    pollRampOrder: async () => new Promise(() => {}),
    // As core does: the signer registered for the action's chain and encoding signs it.
    signRampLeg: async (id, actionId) => {
      const signer = client._rampSigners.resolve('STELLAR', 'xdr');
      if (!signer) throw new Error('Register a ramp signing handler for STELLAR/xdr.');
      calls.push(['signRampLeg', id, actionId, await signer(signAction)]);
      return order(null, { state: 'processing' });
    },
    signTx: async (xdr) => {
      calls.push(['signTx', xdr]);
      return { status: 'signed', signedXdr: `wallet-signed:${xdr}` };
    },
    ...overrides,
  });
  return { client, calls };
}

async function mount(client, application = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      h(
        PollarProvider,
        {
          client,
          appConfig: { application: { name: 'Fixture', network: 'mainnet', chains: ['STELLAR'], ...application }, styles: {} },
        },
        h(RampWidget, { onClose() {} }),
      ),
    );
    await new Promise((r) => setTimeout(r, 20));
  });
  const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text));
  const click = async (element) => {
    assert.ok(element, 'missing element');
    await act(async () => {
      element.click();
      await new Promise((r) => setTimeout(r, 10));
    });
  };
  const type = async (input, value) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return { container, button, click, type, unmount };
}

(async () => {
  // One user action quotes all returned routes once; selecting a result does
  // not ask the backend for a second quote of the same route.
  {
    const { client, calls } = fixtureClient();
    client.quoteRamp = async (body) => {
      calls.push(['quoteRamp', body]);
      return { quotes: [quote, { ...quote, quoteId: 'alternative', amountOut: '14.0' }], rejected: [] };
    };
    const ui = await mount(client);
    await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
    await ui.click(ui.button('Find best route'));
    assert.equal(ui.container.querySelectorAll('.pollar-ramp-route-card').length, 2);
    assert.equal(calls.filter(([name]) => name === 'quoteRamp').length, 1, 'one click sends one quote request');
    await ui.click(ui.container.querySelector('.pollar-ramp-route-card'));
    assert.equal(calls.filter(([name]) => name === 'quoteRamp').length, 1, 'selecting a returned route does not quote again');
    await ui.unmount();
    client.destroy();
  }

  // --- Route, quote, details, order, payment, signature ---
  {
    const { client, calls } = fixtureClient();
    const ui = await mount(client);
    assert.deepEqual(calls[0], ['getRampRoutes', 'ONRAMP']);
    assert.match(ui.container.textContent, /USDC on Stellar/);
    await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
    await ui.click(ui.button('Find best route'));
    assert.deepEqual(calls[1], [
      'quoteRamp',
      {
        direction: 'ONRAMP',
        fiat: { currency: 'BOB', rail: 'QR', country: 'BO' },
        asset: { code: 'USDC', identifier: 'GA5Z', chain: 'STELLAR' },
        amount: { value: '100', denomination: 'in' },
      },
    ]);
    assert.match(ui.container.textContent, /100 BOB → ~14.2 USDC/);
    await ui.click(ui.container.querySelector('.pollar-ramp-route-card'));
    assert.match(ui.container.textContent, /Full name/, 'a quote that asks for fields opens the details step');
    assert.equal(calls.length, 2, 'no order before the details are in');
    await ui.type(ui.container.querySelector('.pollar-ramp-input'), ' Ana Perez ');
    await ui.click(ui.button('Continue'));
    assert.deepEqual(calls[2], ['createRampOrder', { quoteId: 'q1', payee: { name: 'Ana Perez' } }]);
    assert.ok(ui.container.querySelector('#fixture-qr'), 'the rendered QR is shown');
    assert.match(ui.container.textContent, /Pay 100 BOB/);
    assert.match(ui.container.textContent, /000201fixture/);
    assert.equal(ui.button('Authorize'), undefined, 'nothing to sign while the action is a payment');
    // The refresh reads the order again: now it waits on a signature.
    await ui.click(ui.container.querySelector('[aria-label="Refresh"]'));
    assert.deepEqual(calls.at(-1), ['getRampOrder', 'order-0001']);
    assert.equal(calls.filter(([name]) => name === 'signRampLeg').length, 0, 'never sign before the user clicks');
    await ui.click(ui.button('Authorize'));
    assert.deepEqual(calls.slice(-2), [
      ['signTx', unsignedXdr],
      ['signRampLeg', 'order-0001', 'sign', `wallet-signed:${unsignedXdr}`],
    ]);
    assert.equal(client._rampSigners.resolve('STELLAR', 'xdr'), undefined, 'the widget releases the signer it lent');
    await ui.unmount();
    client.destroy();
  }

  // --- A signature that lapses on screen loses its button then, without waiting for a read ---
  {
    const lapsing = { ...signAction, expiresAt: later(0.3) };
    const { client } = fixtureClient({
      listRampOrders: async () => ({ orders: [order(lapsing)], nextCursor: null }),
      getRampOrder: async () => order(lapsing),
    });
    const ui = await mount(client);
    await ui.click(ui.button('Resume purchase'));
    assert.ok(ui.button('Authorize'), 'signable while the payload is live');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    assert.equal(ui.button('Authorize'), undefined, 'gone once it lapsed');
    assert.match(ui.container.textContent, /Preparing a new signature request/);
    await ui.unmount();
    client.destroy();
  }

  // --- A Stellar step built for another account never reaches the wallet ---
  {
    const foreign = { ...signAction, payload: { encoding: 'xdr', value: paymentFrom(Keypair.random().publicKey()) } };
    const { client, calls } = fixtureClient({
      listRampOrders: async () => ({ orders: [order(foreign)], nextCursor: null }),
      getRampOrder: async () => order(foreign),
      signRampLeg: async (id, actionId) => {
        calls.push(['signRampLeg', id, actionId, await client._rampSigners.resolve('STELLAR', 'xdr')(foreign)]);
        return order(null, { state: 'processing' });
      },
    });
    const ui = await mount(client);
    await ui.click(ui.button('Resume purchase'));
    await ui.click(ui.button('Authorize'));
    assert.equal(calls.filter(([name]) => name === 'signTx').length, 0, 'Freighter is never asked');
    assert.match(ui.container.textContent, /not for the connected Stellar account/);
    await ui.unmount();
    client.destroy();
  }

  // --- The wallet switched accounts while it was signing: the signature is not sent ---
  {
    const { client, calls } = fixtureClient({
      listRampOrders: async () => ({ orders: [order(signAction)], nextCursor: null }),
    });
    client.signTx = async () => {
      client.getWallet = () => ({ address: Keypair.random().publicKey(), network: 'STELLAR' });
      return { status: 'signed', signedXdr: 'signed-by-the-other-account' };
    };
    const ui = await mount(client);
    await ui.click(ui.button('Resume purchase'));
    await ui.click(ui.button('Authorize'));
    assert.equal(calls.filter(([name]) => name === 'signRampLeg').length, 0);
    assert.match(ui.container.textContent, /connected wallet changed/);
    await ui.unmount();
    client.destroy();
  }

  // --- An app with its own Stellar signer keeps it ---
  {
    const { client, calls } = fixtureClient({
      listRampOrders: async () => ({ orders: [order(signAction)], nextCursor: null }),
    });
    const own = client.registerRampSigningHandler('STELLAR', 'xdr', async () => 'app-signed');
    const ui = await mount(client);
    await ui.click(ui.button('Resume purchase'));
    await ui.click(ui.button('Authorize'));
    assert.deepEqual(calls.at(-1), ['signRampLeg', 'order-0001', 'sign', 'app-signed']);
    assert.equal(calls.filter(([name]) => name === 'signTx').length, 0);
    assert.ok(client._rampSigners.resolve('STELLAR', 'xdr'), "the app's signer stays registered");
    own();
    await ui.unmount();
    client.destroy();
  }

  // --- An external Solana wallet signs its own leg; a leg built for another wallet is refused ---
  for (const from of ['So1User', 'So1Someone']) {
    const solanaAction = {
      ...signAction,
      chain: 'SOLANA',
      payload: { encoding: 'solana-v0-json', value: JSON.stringify({ from, unsignedTransaction: 'AAEC' }) },
    };
    const { client, calls } = fixtureClient({
      listRampOrders: async () => ({ orders: [order(solanaAction)], nextCursor: null }),
      getRampOrder: async () => order(solanaAction),
      signRampLeg: async (id, actionId) => {
        const signer = client._rampSigners.resolve('SOLANA', 'solana-v0-json');
        if (!signer) throw new Error('Register a ramp signing handler for SOLANA/solana-v0-json.');
        calls.push(['signRampLeg', id, actionId, await signer(solanaAction)]);
        return order(null, { state: 'processing' });
      },
      signSolanaTransaction: async (tx) => {
        calls.push(['signSolanaTransaction', tx]);
        return `wallet-signed:${tx}`;
      },
    });
    client.getWallets = () => [
      { address: userKey.publicKey(), network: 'STELLAR', chain: 'STELLAR' },
      { address: 'So1User', chain: 'SOLANA', custody: 'external' },
    ];
    const ui = await mount(client);
    await ui.click(ui.button('Resume purchase'));
    await ui.click(ui.button('Authorize'));
    if (from === 'So1User')
      assert.deepEqual(calls.slice(-2), [
        ['signSolanaTransaction', 'AAEC'],
        ['signRampLeg', 'order-0001', 'sign', 'wallet-signed:AAEC'],
      ]);
    else {
      assert.equal(calls.filter(([name]) => name === 'signSolanaTransaction').length, 0);
      assert.match(ui.container.textContent, /signed by the Solana wallet it was built for/);
    }
    assert.equal(client._rampSigners.resolve('SOLANA', 'solana-v0-json'), undefined);
    await ui.unmount();
    client.destroy();
  }

  // --- A pending order is resumed from the start screen ---
  {
    const { client, calls } = fixtureClient({
      listRampOrders: async () => ({ orders: [order(signAction)], nextCursor: null }),
    });
    const ui = await mount(client);
    await ui.click(ui.button('Resume purchase'));
    assert.deepEqual(calls.at(-1), ['getRampOrder', 'order-0001']);
    assert.ok(ui.button('Authorize'));
    await ui.unmount();
    client.destroy();
  }

  // --- A route waiting on a verification step opens the step from its button ---
  {
    const registration = {
      position: 1,
      completed: 0,
      total: 1,
      type: 'PROVIDER_REGISTRATION',
      optionId: 'stereum',
      status: 'none',
      corridorId: 'corridor-bob-usdc',
    };
    const locked = {
      legs: [{ index: 0, kind: 'PROVIDER_ONRAMP', from: bob, to: usdc }],
      failure: {
        code: 'PROVIDER_VERIFICATION_REQUIRED',
        legIndex: 0,
        retryable: false,
        resolutionOwner: 'END_USER',
        resolutionAction: 'complete_verification',
      },
      requirement: registration,
    };
    const { client, calls } = fixtureClient({
      quoteRamp: async (body) => {
        calls.push(['quoteRamp', body]);
        throw new PollarApiError('SDK_RAMPS_NO_ROUTE', { code: 'SDK_RAMPS_NO_ROUTE', rejected: [locked] });
      },
      getProviderRegistration: async (corridorId) => {
        calls.push(['getProviderRegistration', corridorId]);
        return { status: 'none', fields: [] };
      },
    });
    const ui = await mount(client);
    await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
    await ui.click(ui.button('Find best route'));
    assert.match(ui.container.textContent, /Register with the provider to see this route/);
    await ui.click(ui.button('Continue'));
    assert.deepEqual(calls.at(-1), ['getProviderRegistration', 'corridor-bob-usdc']);
    assert.equal(ui.container.querySelector('.pollar-ramp-route-card'), null, 'the step replaces the widget');
    // Closing the step returns to the routes as they were.
    await ui.click(ui.container.querySelector('.pollar-modal-close'));
    assert.match(ui.container.textContent, /Register with the provider to see this route/);
    assert.equal(calls.filter(([name]) => name === 'quoteRamp').length, 1, 'closing does not quote again');
    await ui.unmount();
    client.destroy();
  }

  // --- A route dropped for a missing trustline adds it from its row and quotes again ---
  {
    const untrusted = {
      legs: [{ index: 0, kind: 'PROVIDER_ONRAMP', from: bob, to: usdc }],
      failure: {
        code: 'WALLET_TRUSTLINE_MISSING',
        legIndex: 0,
        retryable: false,
        resolutionOwner: 'END_USER',
        resolutionAction: 'add_trustline',
      },
    };
    let trusted = false;
    let release;
    const { client, calls } = fixtureClient({
      quoteRamp: async (body) => {
        calls.push(['quoteRamp', body]);
        if (trusted) return { quotes: [quote], rejected: [] };
        throw new PollarApiError('SDK_RAMPS_NO_ROUTE', { code: 'SDK_RAMPS_NO_ROUTE', rejected: [untrusted] });
      },
      setTrustline: (asset) => {
        calls.push(['setTrustline', asset]);
        return new Promise((resolve) => {
          release = () => {
            trusted = true;
            resolve({ status: 'success', hash: 'trust-hash' });
          };
        });
      },
      refreshAssets: async () => {},
    });
    const ui = await mount(client);
    await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
    await ui.click(ui.button('Find best route'));
    await ui.click(ui.button('Add USDC trustline'));
    assert.deepEqual(calls.at(-1), ['setTrustline', { code: 'USDC', issuer: 'GA5Z' }]);
    const adding = ui.button('Adding');
    assert.ok(adding && adding.disabled, 'the button spins and stays disabled while the trustline is added');
    await ui.click(adding);
    assert.equal(calls.filter(([name]) => name === 'setTrustline').length, 1, 'a second click adds nothing');
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(calls.filter(([name]) => name === 'quoteRamp').length, 2, 'quoted again once trusted');
    assert.match(ui.container.textContent, /100 BOB → ~14.2 USDC/);
    await ui.unmount();
    client.destroy();
  }

  // --- A trustline the wallet cannot pay for says so in words, never with the raw detail ---
  {
    const untrusted = {
      legs: [{ index: 0, kind: 'PROVIDER_ONRAMP', from: bob, to: usdc }],
      failure: {
        code: 'WALLET_TRUSTLINE_MISSING',
        legIndex: 0,
        retryable: false,
        resolutionOwner: 'END_USER',
        resolutionAction: 'add_trustline',
      },
    };
    const { client } = fixtureClient({
      quoteRamp: async () => {
        throw new PollarApiError('SDK_RAMPS_NO_ROUTE', { code: 'SDK_RAMPS_NO_ROUTE', rejected: [untrusted] });
      },
      setTrustline: async () => ({
        status: 'error',
        code: 'TX_LOW_RESERVE',
        details: 'Insufficient XLM: fund GBQSHLR3BE3WOB7KL4YYAKDTTIOLONDDOEGL3B2TAAXDCLKZUTZN4JTT with about 0.5 more XLM',
      }),
    });
    const ui = await mount(client);
    await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
    await ui.click(ui.button('Find best route'));
    await ui.click(ui.button('Add USDC trustline'));
    assert.match(ui.container.textContent, /needs about 0.5 XLM to add the USDC trustline/);
    assert.doesNotMatch(ui.container.textContent, /GBQSHLR3/, 'no address in the message');
    await ui.unmount();
    client.destroy();
  }

  // --- A user without a wallet creates it from the route's row, and the route is quoted again ---
  {
    const walletless = {
      legs: [{ index: 0, kind: 'PROVIDER_ONRAMP', from: bob, to: usdc }],
      failure: {
        code: 'WALLET_NOT_CREATED',
        legIndex: 0,
        retryable: false,
        resolutionOwner: 'END_USER',
        resolutionAction: 'create_wallet',
      },
    };
    for (const custody of ['COSIGNED', 'USER_CHOICE']) {
      let created = false;
      let release;
      const { client, calls } = fixtureClient({
        quoteRamp: async (body) => {
          calls.push(['quoteRamp', body]);
          if (created) return { quotes: [quote], rejected: [] };
          throw new PollarApiError('SDK_RAMPS_NO_ROUTE', { code: 'SDK_RAMPS_NO_ROUTE', rejected: [walletless] });
        },
        createWallet: () => {
          calls.push(['createWallet']);
          return new Promise((resolve) => {
            release = () => {
              created = true;
              resolve({ address: userKey.publicKey(), chain: 'STELLAR' });
            };
          });
        },
      });
      const ui = await mount(client, { walletCustodyMode: custody });
      await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
      await ui.click(ui.button('Find best route'));
      if (custody === 'USER_CHOICE') {
        assert.equal(ui.button('Create wallet'), undefined, 'the custody is picked in the wallet menu');
        assert.match(ui.container.textContent, /Create it from the wallet menu/);
      } else {
        await ui.click(ui.button('Create wallet'));
        const creating = ui.button('Creating');
        assert.ok(creating && creating.disabled, 'the button spins and stays disabled while the wallet is created');
        await ui.click(creating);
        assert.equal(calls.filter(([name]) => name === 'createWallet').length, 1, 'a second click creates nothing');
        await act(async () => {
          release();
          await new Promise((r) => setTimeout(r, 20));
        });
        assert.equal(calls.filter(([name]) => name === 'quoteRamp').length, 2, 'quoted again once the wallet exists');
        assert.match(ui.container.textContent, /100 BOB → ~14.2 USDC/);
      }
      await ui.unmount();
      client.destroy();
    }
  }

  // --- A route through a chain the user has no wallet on: set it up from the row, recovery first ---
  {
    const railless = (resolutionAction, code, detail) => ({
      legs: [{ index: 0, kind: 'PROVIDER_ONRAMP', from: bob, to: usdc }],
      failure: { code, legIndex: 0, retryable: false, resolutionOwner: 'END_USER', resolutionAction, detail },
    });
    for (const [custody, recovered] of [
      ['COSIGNED', false],
      ['COSIGNED', true],
      ['USER_CHOICE', true],
    ]) {
      let ready = false;
      const { client, calls } = fixtureClient({
        quoteRamp: async (body) => {
          calls.push(['quoteRamp', body]);
          if (ready) return { quotes: [quote], rejected: [] };
          throw new PollarApiError('SDK_RAMPS_NO_ROUTE', {
            code: 'SDK_RAMPS_NO_ROUTE',
            rejected: [railless('set_up_wallet', 'WALLET_SETUP_REQUIRED', 'POLYGON')],
          });
        },
        setUpRampWallet: async (chain, pick) => {
          calls.push(['setUpRampWallet', chain, pick]);
          ready = true;
          return { chain, address: '0xrail', custody: pick ?? 'COSIGNED', recoveryConfigured: recovered };
        },
      });
      client.cosign.recovery.status = async () => ({ required: true, configured: recovered });
      const ui = await mount(client, { walletCustodyMode: custody });
      await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
      await ui.click(ui.button('Find best route'));
      assert.match(ui.container.textContent, /Set up your wallet there to continue/);
      if (custody === 'USER_CHOICE') {
        assert.equal(ui.button('Set up wallet ('), ui.button('Set up wallet (co-signed)'), 'one button per custody');
        await ui.click(ui.button('Set up wallet (self-custody)'));
      } else {
        await ui.click(ui.button('Set up wallet'));
      }
      const setUp = calls.find(([name]) => name === 'setUpRampWallet');
      assert.deepEqual(setUp, ['setUpRampWallet', 'POLYGON', custody === 'USER_CHOICE' ? 'SELF_CUSTODY' : undefined]);
      if (recovered) {
        assert.equal(calls.filter(([name]) => name === 'quoteRamp').length, 2, 'quoted again once the wallet exists');
      } else {
        assert.match(ui.container.textContent, /Add a way to recover your wallet/);
        assert.equal(calls.filter(([name]) => name === 'quoteRamp').length, 1, 'no quote until it can sign');
      }
      await ui.unmount();
      client.destroy();
    }

    // A wallet Pollar still holds is moved to the app's custody from its row.
    let moved = false;
    const { client, calls } = fixtureClient({
      quoteRamp: async (body) => {
        calls.push(['quoteRamp', body]);
        if (moved) return { quotes: [quote], rejected: [] };
        throw new PollarApiError('SDK_RAMPS_NO_ROUTE', {
          code: 'SDK_RAMPS_NO_ROUTE',
          rejected: [railless('migrate_custody', 'WALLET_CUSTODY_MIGRATION_REQUIRED')],
        });
      },
    });
    client.cosign.migrateWallets = async (pick) => {
      calls.push(['migrateWallets', pick]);
      moved = true;
      return { required: false, wallets: [] };
    };
    client.cosign.recovery.status = async () => ({ required: true, configured: true });
    const ui = await mount(client, { walletCustodyMode: 'COSIGNED' });
    await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
    await ui.click(ui.button('Find best route'));
    assert.match(ui.container.textContent, /still held by Pollar alone/);
    await ui.click(ui.button('Move wallet'));
    assert.deepEqual(
      calls.filter(([name]) => name !== 'getRampRoutes').map(([name]) => name),
      ['quoteRamp', 'migrateWallets', 'quoteRamp'],
    );
    await ui.unmount();
    client.destroy();
  }

  // --- An app with no chain says so instead of an empty list ---
  {
    const { client } = fixtureClient({ getRampRoutes: async () => ({ routes: [] }) });
    const ui = await mount(client, { chains: [] });
    assert.match(ui.container.textContent, /no chains enabled/);
    await ui.unmount();
    client.destroy();
  }

  // --- Resume lists every open order; the QR says until when, and what the user receives ---
  {
    const listQueries = [];
    const paying = order({ ...qrAction, expiresAt: later(600) });
    const { client } = fixtureClient({
      listRampOrders: async (query) => {
        listQueries.push(query);
        return { orders: [paying], nextCursor: null };
      },
      getRampOrder: async () => paying,
    });
    const ui = await mount(client);
    assert.deepEqual(listQueries[0], { open: 'true', limit: 5 }, 'resume lists every order not final yet');
    await ui.click(ui.button('Resume purchase'));
    assert.match(ui.container.textContent, /Pay before/);
    assert.match(ui.container.textContent, /You receive~14.2 USDC/);
    await ui.unmount();
    client.destroy();
  }

  // --- A leg retrying on its own is in progress, not failed ---
  {
    const retryingLeg = order(null, {
      state: 'processing',
      legs: [
        {
          ...order(null).legs[0],
          status: 'ACTIVE',
          failure: { code: 'RPC_UNAVAILABLE', retryable: true, resolutionOwner: 'POLLAR', resolutionAction: 'automatic_retry' },
        },
      ],
    });
    const { client } = fixtureClient({
      listRampOrders: async () => ({ orders: [retryingLeg], nextCursor: null }),
      getRampOrder: async () => retryingLeg,
    });
    const ui = await mount(client);
    await ui.click(ui.button('Resume purchase'));
    assert.equal(ui.container.querySelector('.pollar-ramp-leg')?.getAttribute('data-status'), 'active');
    await ui.unmount();
    client.destroy();
  }

  // --- A co-signed step brings its approval up; a held order the user resolves is tried again ---
  {
    const approval = order(
      { kind: 'COSIGN_APPROVAL', actionId: 'approve-1', legIndex: 0, cosignRequestId: 'req-9', summary: 'Swap' },
      { state: 'processing' },
    );
    const held = order(null, {
      state: 'processing',
      nextPollAfter: null,
      failure: {
        code: 'COSIGN_REQUEST_EXPIRED',
        legIndex: 0,
        retryable: false,
        resolutionOwner: 'END_USER',
        resolutionAction: 'approve_again',
      },
    });
    let current = approval;
    const { client, calls } = fixtureClient({
      listRampOrders: async () => ({ orders: [current], nextCursor: null }),
      getRampOrder: async () => current,
      retryRampOrder: async (id) => {
        calls.push(['retryRampOrder', id]);
        current = approval;
        return approval;
      },
    });
    client.cosign.pending = async () => {
      calls.push(['cosign.pending']);
      return [];
    };
    const ui = await mount(client);
    await ui.click(ui.button('Resume purchase'));
    assert.ok(
      calls.some(([name]) => name === 'cosign.pending'),
      'the new approval refreshed the co-sign requests',
    );
    await ui.unmount();
    client.destroy();

    current = held;
    const second = fixtureClient({
      listRampOrders: async () => ({ orders: [current], nextCursor: null }),
      getRampOrder: async () => current,
      retryRampOrder: async (id) => {
        second.calls.push(['retryRampOrder', id]);
        current = approval;
        return approval;
      },
    });
    second.client.cosign.pending = async () => [];
    const heldUi = await mount(second.client);
    await heldUi.click(heldUi.button('Resume purchase'));
    assert.doesNotMatch(heldUi.container.textContent, /keeps going/, 'a held order does not claim to keep going');
    await heldUi.click(heldUi.button('Try again'));
    assert.deepEqual(second.calls.at(-1), ['retryRampOrder', 'order-0001']);
    await heldUi.unmount();
    second.client.destroy();
  }

  // --- A QR payment whose code did not arrive rendered says so; a provider JPEG is drawn as a JPEG ---
  {
    const jpeg = '/9j/4AAQSkZJRgABAgAAAQABAAD';
    const qrOnly = { ...qrAction, instructions: { kind: 'qr', payload: jpeg, amount: '18', currency: 'BOB' } };
    const withJpeg = {
      ...qrAction,
      instructions: {
        ...qrOnly.instructions,
        scannable: {
          kind: 'opaque',
          payload: null,
          payloadLabel: null,
          image: { mediaType: 'image/jpeg', encoding: 'base64', data: jpeg, inlineSafe: false },
        },
      },
    };
    for (const action of [qrOnly, withJpeg]) {
      const { client } = fixtureClient({
        listRampOrders: async () => ({ orders: [order(action)], nextCursor: null }),
        getRampOrder: async () => order(action),
      });
      const ui = await mount(client);
      await ui.click(ui.button('Resume purchase'));
      const img = ui.container.querySelector('img[alt="Payment QR"]');
      if (action === qrOnly) {
        assert.match(ui.container.textContent, /The payment code could not be shown/);
        assert.equal(img, null);
      } else {
        assert.doesNotMatch(ui.container.textContent, /could not be shown/);
        assert.equal(img?.getAttribute('src'), `data:image/jpeg;base64,${jpeg}`);
      }
      await ui.unmount();
      client.destroy();
    }
  }

  // --- A verification with nothing to open says what the provider asks; a closed window hides the QR; a page to pay is a link ---
  {
    const abroadKyc = {
      kind: 'KYC',
      actionId: 'kyc',
      legIndex: 0,
      url: null,
      steps: [
        { stepId: 'abroad-kyc', status: 'required', url: null, instructions: 'Complete verification directly with Abroad.' },
      ],
    };
    const closedQr = { ...qrAction, expiresAt: later(-60) };
    const hosted = {
      kind: 'FIAT_PAYMENT',
      actionId: 'pay',
      legIndex: 0,
      expiresAt: later(600),
      instructions: { kind: 'hosted', url: 'https://pay.example/o/1', amount: '18', currency: 'BOB' },
    };
    for (const action of [abroadKyc, closedQr, hosted]) {
      const { client } = fixtureClient({
        listRampOrders: async () => ({ orders: [order(action)], nextCursor: null }),
        getRampOrder: async () => order(action),
      });
      const ui = await mount(client);
      await ui.click(ui.button('Resume purchase'));
      const text = ui.container.textContent;
      if (action === abroadKyc) {
        assert.match(text, /Complete verification directly with Abroad\./);
        assert.doesNotMatch(text, /reviewing your details/);
      } else if (action === closedQr) {
        assert.match(text, /payment window has closed/);
        assert.equal(ui.container.querySelector('#fixture-qr'), null, 'a closed window shows no QR');
      } else {
        const link = ui.container.querySelector('a.pollar-ramp-hosted-link');
        assert.equal(link?.getAttribute('href'), 'https://pay.example/o/1');
        assert.equal(link?.textContent.trim(), 'Pay on the provider page');
        assert.doesNotMatch(text, /Complete verification|could not be shown/);
      }
      await ui.unmount();
      client.destroy();
    }
  }

  // --- An app out of credits: the user is pointed to the app, never told about credits ---
  {
    const { client } = fixtureClient({
      quoteRamp: async () => {
        throw new PollarApiError('SDK_CREDITS_INSUFFICIENT', { code: 'SDK_CREDITS_INSUFFICIENT' });
      },
    });
    const ui = await mount(client);
    await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
    await ui.click(ui.button('Find best route'));
    assert.match(ui.container.textContent, /contact this app's support/);
    assert.doesNotMatch(ui.container.textContent, /credit/i);
    await ui.unmount();
    client.destroy();
  }

  // --- A route whose Polygon account waits on the device: no error, then the same route on a new quote ---
  {
    const polygonUsdt = { kind: 'asset', code: 'USDT', identifier: '0xusdt', chain: 'POLYGON' };
    // Two routes, so the one the user picked must be found again among the fresh quotes.
    const viaPolygon = (id) => ({
      ...quote,
      quoteId: id,
      legs: [
        { ...quote.legs[0], to: polygonUsdt, requiredFields: [] },
        { ...quote.legs[0], index: 1, kind: 'BRIDGE', from: polygonUsdt, to: usdc, requiredFields: [] },
      ],
    });
    const direct = (id) => ({ ...quote, quoteId: id, legs: [{ ...quote.legs[0], requiredFields: [] }] });
    const accountRequest = {
      id: 'acct-1',
      kind: 'ACCOUNT',
      intent: 'add_accounts',
      network: 'POLYGON',
      status: 'PENDING',
      expiresAt: later(3600),
    };
    for (const outcome of ['APPROVED', 'REJECTED']) {
      let round = 0;
      const { client, calls } = fixtureClient({
        quoteRamp: async (body) => {
          calls.push(['quoteRamp', body]);
          round++;
          return { quotes: [direct(`d${round}`), viaPolygon(`p${round}`)], rejected: [] };
        },
        createRampOrder: async (body) => {
          calls.push(['createRampOrder', body]);
          if (body.quoteId === 'p1')
            throw new PollarApiError('SDK_RAMPS_WALLET_NOT_READY', { code: 'SDK_RAMPS_WALLET_NOT_READY' });
          return order(qrAction);
        },
      });
      // The co-sign store as core keeps it, so the test can resolve the request.
      const listeners = new Set();
      let cosignState = { pending: [] };
      client.getCosignState = () => cosignState;
      client.onCosignStateChange = (cb) => {
        listeners.add(cb);
        cb(cosignState);
        return () => listeners.delete(cb);
      };
      const emit = (next) => {
        cosignState = next;
        listeners.forEach((cb) => cb(next));
      };
      client.cosign.pending = async () => [accountRequest];
      client.cosign.inspectQuorum = async () => ({ ok: true });
      const ui = await mount(client);
      await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
      await ui.click(ui.button('Find best route'));
      await ui.click(ui.container.querySelectorAll('.pollar-ramp-route-card')[1]);
      assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(['createRampOrder', { quoteId: 'p1' }]));
      assert.match(ui.container.textContent, /Approve the new account on your device\. The order starts once it is approved\./);
      assert.doesNotMatch(ui.container.textContent, /then try again/, 'waiting on the device is not an error');
      assert.ok(ui.container.querySelector('.pollar-ramp-payment-note .pollar-spinner'), 'the wait shows a spinner');
      await act(async () => {
        emit({ pending: [], lastResolved: { ...accountRequest, status: outcome } });
        await new Promise((r) => setTimeout(r, 30));
      });
      const orders = calls.filter(([name]) => name === 'createRampOrder');
      if (outcome === 'APPROVED') {
        assert.equal(calls.filter(([name]) => name === 'quoteRamp').length, 2, 'quoted again once approved');
        assert.equal(JSON.stringify(orders.at(-1)), JSON.stringify(['createRampOrder', { quoteId: 'p2' }]), 'same route');
        assert.match(ui.container.textContent, /Pay 100 BOB/);
      } else {
        assert.equal(orders.length, 1, 'a rejected account starts nothing');
        assert.match(ui.container.textContent, /The new account was not approved/);
      }
      await ui.unmount();
      client.destroy();
    }
  }

  // --- A lapsed quote is never sent: the same route is quoted again and started ---
  {
    let round = 0;
    const { client, calls } = fixtureClient({
      quoteRamp: async (body) => {
        calls.push(['quoteRamp', body]);
        round++;
        const legs = [{ ...quote.legs[0], requiredFields: [] }];
        return { quotes: [{ ...quote, quoteId: `q${round}`, expiresAt: later(round === 1 ? -5 : 60), legs }], rejected: [] };
      },
    });
    const ui = await mount(client);
    await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
    await ui.click(ui.button('Find best route'));
    await ui.click(ui.container.querySelector('.pollar-ramp-route-card'));
    const orders = calls.filter(([name]) => name === 'createRampOrder');
    assert.equal(JSON.stringify(orders), JSON.stringify([['createRampOrder', { quoteId: 'q2' }]]), 'only the new quote');
    assert.doesNotMatch(ui.container.textContent, /expired/);
    await ui.unmount();
    client.destroy();
  }

  // --- A quote the server calls expired is taken again once; a second refusal is shown ---
  for (const lapses of [1, 2]) {
    let round = 0;
    const { client, calls } = fixtureClient({
      quoteRamp: async (body) => {
        calls.push(['quoteRamp', body]);
        round++;
        const legs = [{ ...quote.legs[0], requiredFields: [] }];
        return { quotes: [{ ...quote, quoteId: `q${round}`, legs }], rejected: [] };
      },
      createRampOrder: async (body) => {
        calls.push(['createRampOrder', body]);
        if (Number(body.quoteId.slice(1)) <= lapses)
          throw new PollarApiError('SDK_RAMPS_QUOTE_EXPIRED', { code: 'SDK_RAMPS_QUOTE_EXPIRED' });
        return order(qrAction);
      },
    });
    const ui = await mount(client);
    await ui.type(ui.container.querySelector('#pollar-ramp-amount'), '100');
    await ui.click(ui.button('Find best route'));
    await ui.click(ui.container.querySelector('.pollar-ramp-route-card'));
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    const orders = calls.filter(([name]) => name === 'createRampOrder').map(([, body]) => body.quoteId);
    assert.deepEqual(orders, ['q1', 'q2'], 'one new quote, never a loop');
    if (lapses === 1) assert.match(ui.container.textContent, /Pay 100 BOB/);
    else assert.match(ui.container.textContent, /This quote expired/);
    await ui.unmount();
    client.destroy();
  }

  console.log(
    'Ramp widget v3: route, quote, details, order, QR, Stellar and Solana wallet signing, verification step, trustline, wallet creation, no chains, resume, open orders, QR window, receive amount, approvals, retry, account approval resume, lapsed quotes, missing payment code, JPEG QR, provider KYC note, closed QR, hosted payment and 402 passed.',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
