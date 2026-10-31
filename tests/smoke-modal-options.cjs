// @pollar smoke test - the options the open*Modal actions take in @pollar/react:
// each modal opens on them, an option the app or wallet cannot use falls back to
// the modal's default, opening on none after some leaves nothing behind, and
// onSuccess / onFunded hear the outcome once.
//
// Run with `node tests/smoke-modal-options.cjs` after `npm run build`.
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
const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const balances = [
  { chain: 'STELLAR', type: 'native', code: 'XLM', balance: '100', available: '98', enabledInApp: true },
  {
    chain: 'STELLAR',
    type: 'credit_alphanum4',
    code: 'USDC',
    issuer: USDC_ISSUER,
    balance: '50',
    available: '50',
    enabledInApp: true,
  },
  { chain: 'SOLANA', type: 'native', code: 'SOL', balance: '2', available: '2', decimals: 9, enabledInApp: true },
];

function fixture(overrides = {}) {
  const client = new PollarClient({ apiKey: 'pub_mainnet_fixture', baseUrl: 'https://api.test', logLevel: 'silent' });
  const wallets = [
    { address: STELLAR, chain: 'STELLAR', custody: 'embedded' },
    { address: SOLANA, chain: 'SOLANA', custody: 'embedded' },
  ];
  let pushTx = () => {};
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
    cb({ step: 'loaded', data: { balances } });
    return () => {};
  };
  client.onTransactionStateChange = (cb) => {
    pushTx = cb;
    cb({ step: 'idle' });
    return () => {};
  };
  Object.assign(client, {
    refreshWalletBalance: async () => {},
    refreshAssets: async () => {},
    resetTransactionState: () => {},
    fetchTxHistory: async (params) => {
      calls.push(['fetchTxHistory', params]);
    },
    sendPayment: async (params) => {
      calls.push(['sendPayment', params]);
      pushTx({ step: 'success', hash: 'hash-1' });
      pushTx({ step: 'success', hash: 'hash-1' });
      return { status: 'success', hash: 'hash-1' };
    },
    getEarnProviders: async () => ['defindex', 'blend'],
    getEarnOpportunities: async (provider) =>
      provider === 'blend'
        ? [
            { id: 'pool-a', name: 'Pool A', asset: { code: 'USDC', issuer: USDC_ISSUER }, apy: 5 },
            { id: 'pool-b', name: 'Pool B', asset: { code: 'USDC', issuer: USDC_ISSUER }, apy: 5 },
          ]
        : [{ id: 'vault-1', name: 'Vault 1', asset: { code: 'USDC', issuer: USDC_ISSUER }, apy: 5 }],
    getEarnPosition: async () => null,
    ...overrides,
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
            application: { name: 'Fixture', network: 'mainnet', chains: ['STELLAR', 'SOLANA'] },
            styles: {},
          },
        },
        h(Host),
      ),
    );
  });
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 30)));
  const open = async (name, options) => {
    await act(async () => (options === undefined ? ctx[name]() : ctx[name](options)));
    await settle();
  };
  const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text));
  const click = async (element) => {
    assert.ok(element, 'missing element');
    await act(async () => element.click());
    await settle();
  };
  const unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return { open, button, click, settle, unmount };
}

const value = (selector) => document.querySelector(selector)?.value;
const assetShown = () => document.querySelector('.pollar-send-asset-selector')?.textContent ?? '';

(async () => {
  // --- Send: prefilled, an unknown asset falls back, onSuccess once ---
  {
    const { client, calls } = fixture();
    const ui = await mount(client);
    await ui.open('openSendModal', {
      asset: 'usdc',
      destination: ' GDESTINATION ',
      amount: '5',
      memo: 'inv-1',
      memoType: 'text',
    });
    assert.match(assetShown(), /USDC/, 'the asset option');
    assert.equal(value('#pollar-send-amount'), '5');
    assert.equal(document.querySelector('.pollar-send-destination-input').value, 'GDESTINATION');
    assert.equal(value('#pollar-send-memo'), 'inv-1');

    await ui.open('openSendModal', { asset: 'DOGE', amount: 'ten' });
    assert.match(assetShown(), /XLM/, 'an asset the wallet does not hold falls back to the first');
    assert.equal(value('#pollar-send-amount'), '', 'an amount that is not a decimal is left out');

    await ui.open('openSendModal');
    assert.match(assetShown(), /XLM/);
    assert.equal(document.querySelector('.pollar-send-destination-input').value, '', 'no options: nothing from before');

    const sent = [];
    await ui.open('openSendModal', {
      chain: 'SOLANA',
      destination: SOLANA,
      amount: '1',
      onSuccess: (result) => sent.push(result),
    });
    assert.match(assetShown(), /SOL/, 'the chain option');
    await ui.click(ui.button('Continue'));
    assert.deepEqual(calls.at(-1), ['sendPayment', { chain: 'SOLANA', destination: SOLANA, amount: '1000000000' }]);
    assert.deepEqual(sent, [{ hash: 'hash-1' }], 'onSuccess once per hash');
    await ui.unmount();
    client.destroy();
  }

  // --- Earn: provider, opportunity, tab and amount; an unknown provider falls back ---
  {
    const { client } = fixture();
    const ui = await mount(client);
    await ui.open('openEarnModal', { provider: 'blend', opportunityId: 'pool-b', tab: 'withdraw', amount: '12.5' });
    assert.equal(document.querySelector('[data-active="true"]').textContent.trim(), 'Withdraw');
    assert.equal(value('#pollar-earn-amount'), '12.5');
    assert.match(document.body.textContent, /Pool B/);

    await ui.open('openEarnModal', { provider: 'aave', opportunityId: 'nope' });
    assert.equal(document.querySelector('[data-active="true"]').textContent.trim(), 'Deposit');
    assert.match(document.body.textContent, /Vault 1/, 'an unknown provider and opportunity fall back to the first');
    await ui.unmount();
    client.destroy();
  }

  // --- Receive and history: the chain option; one the app does not offer falls back ---
  {
    const { client, calls } = fixture();
    const ui = await mount(client);
    await ui.open('openReceiveModal', { chain: 'SOLANA' });
    assert.match(document.body.textContent, new RegExp(SOLANA.slice(0, 6)));
    await ui.open('openReceiveModal', { chain: 'POLYGON' });
    assert.match(document.body.textContent, new RegExp(STELLAR.slice(0, 6)), 'a chain the app lacks falls back');

    await ui.open('openTxHistoryModal', { chain: 'SOLANA' });
    assert.equal(calls.filter(([name]) => name === 'fetchTxHistory').at(-1)[1].chain, 'SOLANA');
    await ui.open('openTxHistoryModal');
    assert.equal(calls.filter(([name]) => name === 'fetchTxHistory').at(-1)[1].chain, 'STELLAR', 'no options: default');
    await ui.unmount();
    client.destroy();
  }

  // --- Swap: the sell and buy assets, a buy token that loads late, and the amount ---
  {
    let releaseCatalog;
    const catalog = new Promise((r) => (releaseCatalog = r));
    const quotes = [];
    const { client } = fixture({
      getSwapConfig: async () => ['soroswap'],
      getSolanaSwapConfig: async () => [],
      getSwapTokens: () => catalog,
      getSwapQuote: async (params) => {
        quotes.push(params);
        return [];
      },
    });
    client.onEnabledAssetsStateChange = (cb) => {
      cb({ step: 'loaded', data: { assets: balances.filter((b) => b.chain === 'STELLAR') } });
      return () => {};
    };
    const ui = await mount(client);
    await ui.open('openSwapModal', { sell: 'usdc', buy: 'AQUA', amount: '10' });
    await act(async () => releaseCatalog([{ code: 'AQUA', issuer: USDC_ISSUER.replace('GA5Z', 'GBNZ') }]));
    await act(async () => new Promise((r) => setTimeout(r, 500)));
    const last = quotes.at(-1);
    assert.equal(last.sellAsset.code, 'USDC', 'the sell option');
    assert.equal(last.buyAsset.code, 'AQUA', 'the buy option, once the catalog that has it loads');
    assert.equal(last.amount, '10');
    await ui.unmount();
    client.destroy();
  }

  // --- Card: the funding panel, its amount, and onFunded ---
  {
    const funding = { id: 'f1', status: 'PENDING', amount: '20', chain: 'STELLAR', createdAt: '2026-10-31T00:00:00Z' };
    const fundings = [];
    const { client } = fixture({
      getCardProviders: async () => [
        {
          id: 'coral',
          name: 'Card',
          fundingAssets: ['USDC'],
          supports: { freeze: false, terminate: false, physical: false, revealSecrets: false },
        },
      ],
      getCardHolder: async () => ({ kycStatus: 'APPROVED' }),
      getCardRequirements: async () => ({ steps: [], next: null }),
      getCards: async () => [{ id: 'card-1', last4: '4242', status: 'ACTIVE', type: 'VIRTUAL' }],
      getCardBalance: async () => ({ available: '0', currency: 'USD' }),
      getCardTransactions: async () => ({ transactions: [] }),
      listCardFundings: async () => [],
      fundCard: async (params) => {
        fundings.push(params);
        return { status: 'sent', funding };
      },
    });
    const ui = await mount(client);
    const funded = [];
    await ui.open('openCardModal', { panel: 'fund', amount: '20', onFunded: (f) => funded.push(f.id) });
    assert.equal(value('#pollar-card-fund-amount'), '20', 'the funding panel opens with the amount');
    await ui.click(ui.button('Fund from my wallet'));
    assert.equal(fundings[0].amount, '20');
    assert.deepEqual(funded, ['f1']);

    await ui.open('openCardModal');
    assert.equal(document.querySelector('#pollar-card-fund-amount'), null, 'no options: the card screen');
    await ui.unmount();
    client.destroy();
  }

  console.log(
    'Modal options: send (prefill, fallback, reset, onSuccess once), earn (provider, opportunity, tab, amount, fallback), receive and history (chain, fallback), swap (assets, late catalog, amount), card (fund panel, onFunded) passed.',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
