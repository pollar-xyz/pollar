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
const signAction = {
  kind: 'SIGNATURE',
  actionId: 'sign',
  legIndex: 0,
  chain: 'STELLAR',
  payload: { encoding: 'xdr', value: 'unsigned' },
  summary: 'payment',
  expiresAt: later(60),
};

function fixtureClient(overrides = {}) {
  const client = new PollarClient({ apiKey: 'pub_mainnet_fixture', baseUrl: 'https://api.test', logLevel: 'silent' });
  const wallet = { address: 'G-wallet', network: 'STELLAR' };
  client.getNetworkState = () => ({ step: 'connected', network: 'mainnet' });
  client.onNetworkStateChange = (cb) => {
    cb(client.getNetworkState());
    return () => {};
  };
  client.getWallet = () => wallet;
  client.getWallets = () => [wallet];
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
    signRampLeg: async (id, actionId) => {
      calls.push(['signRampLeg', id, actionId]);
      return order(null, { state: 'processing' });
    },
    ...overrides,
  });
  return { client, calls };
}

async function mount(client) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      h(
        PollarProvider,
        { client, appConfig: { application: { name: 'Fixture', network: 'mainnet', chains: ['STELLAR'] }, styles: {} } },
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
    assert.match(ui.container.textContent, /100 BOB → 14.2 USDC/);
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
    assert.deepEqual(calls.at(-1), ['signRampLeg', 'order-0001', 'sign']);
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

  console.log('Ramp widget v3: route, quote, details, order, QR, explicit signature, resume and 402 passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
