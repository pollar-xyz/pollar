// @pollar smoke test - openBridgeModal's options in @pollar/react: the modal
// opens on the direction and amount given, a direction the user cannot bridge
// in falls back to the first one offered, opening on none after some leaves
// nothing behind, and onSuccess hears the USDC arrive once.
//
// Run with `node tests/smoke-bridge-modal.cjs` after `npm run build`.
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
const { PollarClient } = require('../packages/core/dist/index.js');
const { PollarProvider, usePollar } = require('../packages/react/dist/index.js');
const h = React.createElement;

const STELLAR = 'GBQ4ZKD7HMTNQOSWJRB7VP5PAKAQFGFUIGTDN2S4OOFE36QPLXZ2SRAN';
const SOLANA = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const POLYGON = '0x1111111111111111111111111111111111111111';

const transfer = (overrides = {}) => ({
  id: 'bt-1',
  status: 'BURNED',
  fromChain: 'STELLAR',
  toChain: 'SOLANA',
  asset: 'USDC',
  amount: '5',
  amountOut: null,
  fromAddress: STELLAR,
  toAddress: SOLANA,
  burnTxHash: 'burn-1',
  mintTxHash: null,
  pendingAction: null,
  failure: null,
  etaSeconds: 300,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: null,
  ...overrides,
});

function fixture() {
  const client = new PollarClient({ apiKey: 'pub_mainnet_fixture', baseUrl: 'https://api.test', logLevel: 'silent' });
  const wallets = [
    { address: STELLAR, chain: 'STELLAR', custody: 'embedded' },
    { address: SOLANA, chain: 'SOLANA', custody: 'embedded' },
    { address: POLYGON, chain: 'POLYGON', custody: 'embedded' },
  ];
  const calls = [];
  client.getNetworkState = () => ({ step: 'connected', network: 'mainnet' });
  client.onNetworkStateChange = (cb) => {
    cb(client.getNetworkState());
    return () => {};
  };
  client.getWallet = () => wallets[0];
  client.getWallets = () => wallets;
  client.cosign.recovery.status = async () => ({ required: false, configured: false });
  client.onWalletBalanceStateChange = (cb) => {
    cb({
      step: 'loaded',
      data: {
        balances: [
          { chain: 'STELLAR', type: 'credit_alphanum4', code: 'USDC', balance: '50', available: '50' },
          { chain: 'POLYGON', type: 'token', code: 'USDC', balance: '9', available: '9', decimals: 6 },
        ],
      },
    });
    return () => {};
  };
  Object.assign(client, {
    refreshWalletBalance: async () => {},
    refreshAssets: async () => {},
    getBridgeConfig: async () => ({
      available: true,
      reason: null,
      asset: 'USDC',
      directions: [
        { fromChain: 'STELLAR', toChain: 'SOLANA' },
        { fromChain: 'STELLAR', toChain: 'POLYGON' },
        { fromChain: 'POLYGON', toChain: 'STELLAR' },
        { fromChain: 'POLYGON', toChain: 'SOLANA' },
      ],
    }),
    quoteBridge: async (params) => {
      calls.push(['quoteBridge', params]);
      return {
        fromChain: params.fromChain,
        toChain: params.toChain,
        asset: 'USDC',
        amountIn: params.amount,
        amountOut: params.amount,
        fee: null,
        etaSeconds: 300,
        fromAddress: STELLAR,
        toAddress: SOLANA,
        signing: 'INTERNAL',
      };
    },
    bridge: async (params) => {
      calls.push(['bridge', params]);
      return transfer({ fromChain: params.fromChain, toChain: params.toChain, amount: params.amount });
    },
    // Two reads that both see it complete: onSuccess must still be heard once.
    pollBridgeTransfer: async (_id, opts) => {
      const done = transfer({ status: 'COMPLETED', mintTxHash: 'mint-1', amountOut: '5' });
      opts.onUpdate(done);
      opts.onUpdate({ ...done });
      return done;
    },
  });
  return { client, calls };
}

async function mount(client) {
  let ctx;
  const Host = () => {
    ctx = usePollar();
    return null;
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      h(
        PollarProvider,
        {
          client,
          appConfig: {
            application: { name: 'Fixture', network: 'mainnet', chains: ['STELLAR', 'SOLANA', 'POLYGON'] },
            styles: {},
          },
        },
        h(Host),
      ),
    );
  });
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 450)));
  const open = async (options) => {
    await act(async () => (options === undefined ? ctx.openBridgeModal() : ctx.openBridgeModal(options)));
    await settle();
  };
  const unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return { open, settle, unmount };
}

const selects = () => [...document.querySelectorAll('.pollar-bridge-modal select')].map((s) => s.value);
const amount = () => document.querySelector('.pollar-bridge-modal input')?.value;
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

(async () => {
  const { client, calls } = fixture();
  const ui = await mount(client);

  await ui.open({ fromChain: 'POLYGON', toChain: 'SOLANA', amount: '5' });
  assert.deepEqual(selects(), ['POLYGON', 'SOLANA'], 'the direction given');
  assert.equal(amount(), '5', 'the amount given');
  assert.deepEqual(
    calls.find((c) => c[0] === 'quoteBridge')?.[1],
    { fromChain: 'POLYGON', toChain: 'SOLANA', amount: '5' },
    'the seeded form is quoted',
  );

  await ui.open({ fromChain: 'SOLANA', toChain: 'STELLAR', amount: 'ten' });
  assert.deepEqual(selects(), ['STELLAR', 'SOLANA'], 'a source the user cannot bridge from falls back to the first');
  assert.equal(amount(), '', 'an amount that is not a decimal is left out');

  await ui.open({ fromChain: 'STELLAR', toChain: 'STELLAR' });
  assert.deepEqual(selects(), ['STELLAR', 'SOLANA'], 'a destination not offered from the source falls back to the first');

  await ui.open();
  assert.deepEqual(selects(), ['STELLAR', 'SOLANA']);
  assert.equal(amount(), '', 'no options: nothing from before');

  const arrived = [];
  await ui.open({ fromChain: 'STELLAR', toChain: 'SOLANA', amount: '5', onSuccess: (t) => arrived.push(t.id) });
  await act(async () => button('Move USDC').click());
  await ui.settle();
  assert.deepEqual(calls.find((c) => c[0] === 'bridge')?.[1].fromChain, 'STELLAR', 'the bridge starts on the seeded direction');
  assert.deepEqual(arrived, ['bt-1'], 'onSuccess heard once');

  await ui.unmount();
  client.destroy();
  console.log('Bridge modal options: direction, amount, fallbacks, reset and onSuccess once passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
