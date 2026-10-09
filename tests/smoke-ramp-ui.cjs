const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://fixture.invalid' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
globalThis.navigator = dom.window.navigator;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { RampWorkflow, RampWidget, PollarProvider } = require('../packages/react/dist/index.js');
const root = createRoot(document.getElementById('root'));
const base = {
  txId: 'fixture-tx',
  status: 'pending',
  lifecycleState: 'awaiting_payment',
  transactionVersion: 2,
  reconciliationRequired: false,
  terms: {
    fiatAmount: '20.00',
    fiatCurrency: 'MXN',
    cryptoAmount: '1.123456789012',
    assetCode: 'NATIVE',
    assetChain: 'POLYGON',
    feeAmount: '0',
    feeCurrency: 'MXN',
    assetIssuer: null,
  },
  nextAction: {
    kind: 'sign_transaction',
    actionId: 'saved-action',
    purpose: 'withdrawal_payment',
    chain: 'POLYGON',
    network: 'mainnet',
    challengeRef: 'saved-challenge',
    payload: { encoding: 'fixture-json', value: 'unsigned' },
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  },
};
(async () => {
  let signs = 0,
    changes = 0;
  const client = {
    signRampAction: async () => {
      signs++;
      return base;
    },
  };
  const show = (snapshot) => root.render(React.createElement(RampWorkflow, { client, snapshot, onChange: () => changes++ }));
  await React.act(async () => show(base));
  assert.match(document.body.textContent, /1.123456789012 NATIVE/);
  assert.equal(signs, 0);
  await React.act(async () => show({ ...base }));
  assert.equal(signs, 0);
  await React.act(async () => {
    document.querySelector('button').click();
    document.querySelector('button').click();
  });
  assert.equal(signs, 1);
  assert.equal(changes, 1);
  await React.act(async () => show({ ...base, reconciliationRequired: true }));
  assert.equal(document.querySelector('button'), null);
  await React.act(async () =>
    show({
      ...base,
      nextAction: {
        kind: 'verification',
        actionId: 'verify',
        order: 'parallel',
        steps: [
          {
            stepId: 'kyc',
            purpose: 'verification',
            status: 'required',
            url: 'https://fixture.invalid/kyc',
            instructions: 'Verify identity',
          },
          {
            stepId: 'terms',
            purpose: 'terms',
            status: 'required',
            url: 'https://fixture.invalid/terms',
            instructions: 'Review terms',
          },
        ],
      },
    }),
  );
  assert.equal(document.querySelectorAll('a').length, 2);
  await React.act(async () => root.unmount());
  // The exported widget consumes registered route/action data with no provider branch.
  const sdk = require('../packages/core/dist/index.js');
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, content: {} }));
  const main = new sdk.PollarClient({
    apiKey: 'pk_fixture_generic',
    baseUrl: 'https://fixture.invalid',
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  });
  const route = {
    routeId: 'fixture:MX:offramp',
    direction: 'offramp',
    country: 'MX',
    fiatCurrency: 'MXN',
    rail: 'FUTURE_BANK',
    asset: { code: 'NATIVE', identifier: null, chain: 'POLYGON', network: 'mainnet', precision: 12 },
    limits: { denomination: 'crypto', min: '0.000000000001', max: '100' },
    providerId: 'fixture-provider',
    provider: 'Registered fixture',
    capabilities: { polling: true, callbacks: true, refunds: 'unsupported', continuations: ['signed_payload', 'user_ready'] },
  };
  let creates = 0,
    walletSigns = 0;
  main.getRampRoutes = async () => ({ routes: [route] });
  main.getRampCountries = async () => ({ countries: [] });
  main.getRampsQuote = async (query) => {
    assert.equal(query.chain, 'POLYGON');
    assert.equal(query.currency, 'MXN');
    return {
      quotes: [
        {
          quoteId: 'fixture-quote',
          provider: 'Registered fixture',
          route,
          terms: base.terms,
          fiatAmount: 20,
          cryptoAmount: 1.123456789012,
          requiredFields: [],
          fee: 0,
          feeCurrency: 'MXN',
          rate: 20,
          rail: 'FUTURE_BANK',
          protocol: 'REST',
          estimatedTime: 'minutes',
          recommended: true,
          expiresAt: new Date(Date.now() + 900000).toISOString(),
          providerExpiresAt: null,
          availableAmount: null,
        },
      ],
    };
  };
  main.createOffRamp = async (body) => {
    assert.equal(body.amountExact, '20.00');
    creates++;
    return { ...base, provider: 'Registered fixture' };
  };
  main.getRampTransaction = async () => base;
  main.continueRamp = async () => ({
    ...base,
    transactionVersion: 3,
    nextAction: { kind: 'wait', actionId: 'wait', reason: 'settlement_verification' },
  });
  main.registerRampSigningHandler('POLYGON', 'fixture-json', async () => {
    walletSigns++;
    return 'signed:unsigned';
  });
  // Country discovery must finish before a route can replace country/currency.
  let resolveCountries;
  main.getRampCountries = () =>
    new Promise((resolve) => {
      resolveCountries = resolve;
    });
  const loadingRoot = createRoot(document.getElementById('root'));
  await React.act(async () =>
    loadingRoot.render(
      React.createElement(
        PollarProvider,
        { client: main, appConfig: { application: { name: 'Fixture', network: 'mainnet', chains: [] }, styles: {} } },
        React.createElement(RampWidget, { onClose() {} }),
      ),
    ),
  );
  const pendingRoute = [...document.querySelectorAll('select')].find((select) =>
    [...select.options].some((option) => option.value === route.routeId),
  );
  assert.ok(pendingRoute);
  assert.equal(pendingRoute.disabled, true);
  await React.act(async () => resolveCountries({ countries: [{ code: 'BO', currency: 'BOB' }] }));
  assert.equal(pendingRoute.disabled, false);
  await React.act(async () => loadingRoot.unmount());
  main.getRampCountries = async () => ({ countries: [] });
  const widgetRoot = createRoot(document.getElementById('root'));
  async function startWidget(widgetRoot) {
    await React.act(async () =>
      widgetRoot.render(
        React.createElement(
          PollarProvider,
          { client: main, appConfig: { application: { name: 'Fixture', network: 'mainnet', chains: [] }, styles: {} } },
          React.createElement(RampWidget, { onClose() {} }),
        ),
      ),
    );
    const routeSelect = [...document.querySelectorAll('select')].find((select) =>
      [...select.options].some((option) => option.value === route.routeId),
    );
    assert.ok(routeSelect);
    await React.act(async () => {
      routeSelect.value = route.routeId;
      routeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await React.act(async () => {
      const input = document.querySelector('input[type=number]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '20');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    const findButton = [...document.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Find best route'),
    );
    assert.equal(findButton.disabled, false);
    await React.act(async () => findButton.click());
    const quoteRow = [...document.querySelectorAll('[role=button]')].find((row) =>
      row.textContent.includes('Registered fixture'),
    );
    assert.ok(quoteRow);
    await React.act(async () => quoteRow.click());
  }
  await startWidget(widgetRoot);
  assert.equal(creates, 1);
  assert.equal(walletSigns, 0);
  assert.match(document.body.textContent, /1.123456789012 NATIVE/);
  await React.act(async () =>
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'Authorize').click(),
  );
  assert.equal(walletSigns, 1);
  await React.act(async () => widgetRoot.unmount());
  // Legacy signing uses the same explicit interaction guarantee while the wallet is pending.
  main.createOffRamp = async () => ({
    txId: 'legacy-tx',
    provider: 'Registered fixture',
    status: 'pending',
    pendingSignature: { action: 'withdraw_payment', unsignedXdr: 'unsigned-legacy' },
  });
  let legacySigns = 0,
    submissions = 0,
    resolveWallet;
  main.signTx = () => {
    legacySigns++;
    return new Promise((resolve) => {
      resolveWallet = resolve;
    });
  };
  main.submitRampSignature = async () => {
    submissions++;
    throw new Error('Signature submission rejected');
  };
  const legacyRoot = createRoot(document.getElementById('root'));
  await startWidget(legacyRoot);
  assert.equal(legacySigns, 0);
  const authorize = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Authorize wallet request',
  );
  assert.ok(authorize);
  await React.act(async () => {
    authorize.click();
    authorize.click();
  });
  assert.equal(legacySigns, 1);
  assert.equal(authorize.disabled, true);
  await React.act(async () => resolveWallet({ status: 'signed', signedXdr: 'signed-legacy' }));
  assert.equal(submissions, 1);
  assert.match(document.body.textContent, /Signature submission rejected/);
  await React.act(async () => legacyRoot.unmount());
  main.createOffRamp = async () => ({
    txId: 'legacy-completed',
    provider: 'Registered fixture',
    status: 'completed',
    pendingSignature: { action: 'withdraw_payment', unsignedXdr: 'unsigned-legacy' },
  });
  const completedRoot = createRoot(document.getElementById('root'));
  await startWidget(completedRoot);
  assert.ok(![...document.querySelectorAll('button')].some((button) => button.textContent === 'Authorize wallet request'));
  assert.equal(legacySigns, 1);
  await React.act(async () => completedRoot.unmount());
  main.destroy();
  console.log(
    'Web ramp UI: generic and legacy explicit signing, duplicate protection, failures, exact terms and verification passed.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
