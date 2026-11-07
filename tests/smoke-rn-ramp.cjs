// React Native RampWidget on the v3 ramp API: the real container, with
// react-native mocked as plain components so its buttons and inputs can be
// driven from Node. Route, quote, the fields a quote asks for, the order, its
// payment code, an explicit signature, and the order kept while closed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.invalid/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const core = require('../packages/core/dist/index.js');

let buttons = [];
let inputs = [];
let texts = [];
const qrCodes = [];
const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
const reactNative = {
  View: passthrough,
  ScrollView: passthrough,
  Text: (props) => {
    texts.push(props);
    return React.createElement(React.Fragment, null, props.children);
  },
  Image: () => null,
  TouchableOpacity: (props) => {
    buttons.push(props);
    return React.createElement(React.Fragment, null, props.children);
  },
  TextInput: (props) => {
    inputs.push(props);
    return null;
  },
  ActivityIndicator: () => null,
  StyleSheet: { create: (s) => s, absoluteFillObject: {} },
  Linking: { openURL: async () => {} },
};

let client;
let saved = null;
const pollarContext = {
  getClient: () => client,
  styles: {},
  appConfig: { application: { name: 'Fixture', network: 'mainnet', chains: ['STELLAR'] } },
  copyText: async () => {},
  cosign: { pending: [] },
  openCosignModal() {},
  setCosignNextStep() {},
  walletBalance: { step: 'loaded', data: { balances: [] } },
  refreshWalletBalance: async () => {},
  get ramp() {
    return saved;
  },
  setRamp(next) {
    saved = next;
  },
};

function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scope = { exports: {}, setInterval, clearInterval, setTimeout, clearTimeout, globalThis, AbortController };
  scope.require = (id) => {
    if (id === 'react-native') return reactNative;
    if (id === '@pollar/core') return core;
    if (id === 'react-native-qrcode-svg')
      return (props) => {
        qrCodes.push(props.value);
        return null;
      };
    if (id === 'react-native-svg') return { SvgXml: () => null };
    if (id === '../../context' || id === './context') return { usePollar: () => pollarContext };
    if (id === '../commons') return { PollarOverlay: passthrough };
    if (id.startsWith('.')) {
      const base = path.join(path.dirname(file), id);
      return load(fs.existsSync(path.resolve(__dirname, '..', `${base}.tsx`)) ? `${base}.tsx` : `${base}.ts`);
    }
    return require(id);
  };
  vm.runInNewContext(output, scope);
  return scope.exports;
}

const flat = (node) =>
  node == null || typeof node === 'boolean'
    ? ''
    : Array.isArray(node)
      ? node.map(flat).join('')
      : typeof node === 'object'
        ? flat(node.props?.children)
        : String(node);
const label = (props) => flat(props.children);
function press(text) {
  const match = [...buttons].reverse().find((b) => label(b).startsWith(text));
  assert.ok(match, `button "${text}" not rendered; have: ${[...new Set(buttons.map(label))].join(', ')}`);
  return React.act(async () => {
    match.onPress();
    await new Promise((r) => setTimeout(r, 10));
  });
}
const shown = () => texts.map(label).join('\n');
async function render(element) {
  const container = document.createElement('div');
  const root = createRoot(container);
  buttons = [];
  await React.act(async () => {
    root.render(element);
    await new Promise((r) => setTimeout(r, 10));
  });
  return async () => React.act(async () => root.unmount());
}
async function rerender(fn) {
  await React.act(async () => {
    await fn();
    await new Promise((r) => setTimeout(r, 10));
  });
}

const { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } = require('@stellar/stellar-sdk');
const userKey = Keypair.random();
const unsignedXdr = new TransactionBuilder(new Account(userKey.publicKey(), '1'), {
  fee: '100',
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' }))
  .setTimeout(300)
  .build()
  .toXDR();
const later = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();
const bob = { kind: 'fiat', currency: 'BOB', rail: 'QR', country: 'BO' };
const usdc = { kind: 'asset', code: 'USDC', identifier: 'GA5Z', chain: 'STELLAR' };
const quote = {
  quoteId: 'q1',
  expiresAt: later(60),
  amountIn: '100',
  amountOut: '14.2',
  etaSeconds: null,
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
      etaSeconds: null,
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
      ...quote.legs[0],
      status: 'AWAITING_ACTION',
      amountInPlanned: '100',
      amountOutPlanned: '14.2',
      amountInActual: null,
      amountOutActual: null,
      onchainTxHash: null,
      signingMode: null,
      fundsLocation: null,
      failure: null,
      steps: [],
      startedAt: null,
    },
  ],
  pendingAction,
  failure: null,
  nextPollAfter: later(5),
  ...patch,
});

(async () => {
  const { RampWidget } = load('packages/react-native/src/components/ramp-widget/RampWidget.tsx');
  const calls = [];
  client = {
    getRampRoutes: async (direction) => {
      calls.push(['getRampRoutes', direction]);
      return { routes: [{ fiat: bob, asset: usdc, legs: ['PROVIDER_ONRAMP'] }] };
    },
    listRampOrders: async () => ({ orders: [], nextCursor: null }),
    quoteRamp: async (body) => {
      calls.push(['quoteRamp', body.amount.value]);
      return { quotes: [quote], rejected: [] };
    },
    createRampOrder: async (body) => {
      calls.push(['createRampOrder', body]);
      return order({
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
            image: { mediaType: 'image/svg+xml', encoding: 'utf8', data: '<svg/>', inlineSafe: true },
          },
        },
      });
    },
    getRampOrder: async () =>
      order({
        kind: 'SIGNATURE',
        actionId: 'sign',
        legIndex: 0,
        chain: 'STELLAR',
        payload: { encoding: 'xdr', value: 'x' },
        summary: 'payment',
        expiresAt: later(60),
      }),
    pollRampOrder: async () => new Promise(() => {}),
    // As core does: one signer per chain and encoding, and the registered one signs.
    signers: new Map(),
    registerRampSigningHandler(chain, encoding, handler) {
      const key = `${chain}/${encoding}`;
      if (client.signers.has(key)) throw new Error('Ramp signing handler already registered');
      client.signers.set(key, handler);
      return () => client.signers.delete(key);
    },
    getWallet: () => ({ address: userKey.publicKey() }),
    signTx: async (xdr) => ({ status: 'signed', signedXdr: `wallet-signed:${xdr}` }),
    signRampLeg: async (id, actionId) => {
      const signer = client.signers.get('STELLAR/xdr');
      if (!signer) throw new Error('Register a ramp signing handler for STELLAR/xdr.');
      calls.push([
        'signRampLeg',
        id,
        actionId,
        await signer({ summary: 'payment', payload: { encoding: 'xdr', value: unsignedXdr } }),
      ]);
      return order(null, { state: 'processing' });
    },
  };

  let unmount = await render(React.createElement(RampWidget, { onClose() {} }));
  assert.deepEqual(calls[0], ['getRampRoutes', 'ONRAMP']);
  await rerender(() =>
    [...inputs]
      .reverse()
      .find((i) => i.keyboardType === 'decimal-pad')
      .onChangeText('100'),
  );
  await press('Find best route');
  assert.deepEqual(calls[1], ['quoteRamp', '100']);
  await press('100 BOB');
  await rerender(() => inputs.at(-1).onChangeText('Ana Perez'));
  assert.equal(calls.length, 2, 'no order before the details are in');
  await press('Continue');
  // The container runs in its own VM context: compare by value, not by prototype.
  assert.equal(JSON.stringify(calls[2]), JSON.stringify(['createRampOrder', { quoteId: 'q1', payee: { name: 'Ana Perez' } }]));
  assert.deepEqual(qrCodes.slice(-1), ['000201fixture'], 'the payment code is drawn as a QR');
  assert.match(shown(), /Pay 100 BOB/);
  assert.equal(saved?.order.id, 'order-0001', 'the order is kept while the widget is closed');
  await unmount();

  // Reopened: back on the kept order, which now waits on a signature.
  saved = { direction: 'ONRAMP', order: await client.getRampOrder('order-0001') };
  unmount = await render(React.createElement(RampWidget, { onClose() {} }));
  assert.equal(calls.filter(([name]) => name === 'signRampLeg').length, 0, 'never sign before the user presses');
  await press('Authorize');
  assert.equal(
    JSON.stringify(calls.at(-1)),
    JSON.stringify(['signRampLeg', 'order-0001', 'sign', `wallet-signed:${unsignedXdr}`]),
  );
  assert.equal(client.signers.size, 0, 'the widget releases the Stellar signer it lent to the user wallet');
  await unmount();

  // A route whose Polygon account waits on the device: a notice, not an error; approved, the
  // same route is quoted again and started.
  {
    const polygonUsdt = { kind: 'asset', code: 'USDT', identifier: '0xusdt', chain: 'POLYGON' };
    const viaPolygon = (id) => ({
      ...quote,
      quoteId: id,
      legs: [
        { ...quote.legs[0], to: polygonUsdt, requiredFields: [] },
        { ...quote.legs[0], index: 1, kind: 'BRIDGE', from: polygonUsdt, to: usdc, requiredFields: [] },
      ],
    });
    const accountRequest = { id: 'acct-1', intent: 'add_accounts', status: 'PENDING', expiresAt: later(3600) };
    let round = 0;
    let rerenderHost;
    calls.length = 0;
    saved = null;
    Object.assign(client, {
      quoteRamp: async (body) => {
        calls.push(['quoteRamp', body.amount.value]);
        round++;
        return { quotes: [viaPolygon(`p${round}`)], rejected: [] };
      },
      createRampOrder: async (body) => {
        calls.push(['createRampOrder', body.quoteId]);
        if (body.quoteId === 'p1')
          throw new core.PollarApiError('SDK_RAMPS_WALLET_NOT_READY', { code: 'SDK_RAMPS_WALLET_NOT_READY' });
        return order(null);
      },
      cosign: { pending: async () => [accountRequest] },
    });
    function Host() {
      const [, set] = React.useState(0);
      rerenderHost = () => set((n) => n + 1);
      return React.createElement(RampWidget, { onClose() {} });
    }
    unmount = await render(React.createElement(Host));
    await rerender(() =>
      [...inputs]
        .reverse()
        .find((i) => i.keyboardType === 'decimal-pad')
        .onChangeText('100'),
    );
    await press('Find best route');
    await press('100 BOB');
    assert.match(shown(), /Approve the new account on your device\. The order starts once it is approved\./);
    assert.doesNotMatch(shown(), /then try again/, 'waiting on the device is not an error');
    await rerender(() => {
      pollarContext.cosign = { pending: [], lastResolved: { ...accountRequest, status: 'APPROVED' } };
      rerenderHost();
    });
    await rerender(() => new Promise((r) => setTimeout(r, 20)));
    assert.equal(
      JSON.stringify(calls.filter(([name]) => name !== 'getRampRoutes')),
      JSON.stringify([
        ['quoteRamp', '100'],
        ['createRampOrder', 'p1'],
        ['quoteRamp', '100'],
        ['createRampOrder', 'p2'],
      ]),
    );
    await unmount();
    pollarContext.cosign = { pending: [] };
  }

  // A lapsed quote is never sent: the same route on a new quote instead.
  {
    let round = 0;
    calls.length = 0;
    saved = null;
    Object.assign(client, {
      quoteRamp: async (body) => {
        calls.push(['quoteRamp', body.amount.value]);
        round++;
        const legs = [{ ...quote.legs[0], requiredFields: [] }];
        return { quotes: [{ ...quote, quoteId: `q${round}`, expiresAt: later(round === 1 ? -5 : 60), legs }], rejected: [] };
      },
      createRampOrder: async (body) => {
        calls.push(['createRampOrder', body.quoteId]);
        return order(null);
      },
    });
    unmount = await render(React.createElement(RampWidget, { onClose() {} }));
    await rerender(() =>
      [...inputs]
        .reverse()
        .find((i) => i.keyboardType === 'decimal-pad')
        .onChangeText('100'),
    );
    await press('Find best route');
    await press('100 BOB');
    await rerender(() => new Promise((r) => setTimeout(r, 20)));
    assert.equal(
      JSON.stringify(calls.filter(([name]) => name === 'createRampOrder')),
      JSON.stringify([['createRampOrder', 'q2']]),
    );
    await unmount();
  }

  // A verification with nothing to open says what the provider asks for.
  {
    saved = {
      direction: 'ONRAMP',
      order: order({
        kind: 'KYC',
        actionId: 'kyc',
        legIndex: 0,
        url: null,
        steps: [
          { stepId: 'abroad-kyc', status: 'required', url: null, instructions: 'Complete verification directly with Abroad.' },
        ],
      }),
    };
    client.pollRampOrder = async () => new Promise(() => {});
    texts = [];
    unmount = await render(React.createElement(RampWidget, { onClose() {} }));
    assert.match(shown(), /Complete verification directly with Abroad\./);
    assert.doesNotMatch(shown(), /reviewing your details/);
    await unmount();
    saved = null;
  }

  // A QR payment whose code did not arrive rendered says so instead of an empty screen.
  {
    saved = {
      direction: 'ONRAMP',
      order: order({
        kind: 'FIAT_PAYMENT',
        actionId: 'pay',
        legIndex: 0,
        expiresAt: later(600),
        instructions: { kind: 'qr', payload: '/9j/4AAQ', amount: '18', currency: 'BOB' },
      }),
    };
    client.pollRampOrder = async () => new Promise(() => {});
    texts = [];
    unmount = await render(React.createElement(RampWidget, { onClose() {} }));
    assert.match(shown(), /The payment code could not be shown/);
    await unmount();
    saved = null;
  }

  // --- Country names in the widget's language; the provider's language follows its prop and setLocale ---
  {
    const ars = { kind: 'fiat', currency: 'ARS', rail: 'BANK_TRANSFER', country: 'AR' };
    client.getRampRoutes = async () => ({
      routes: [
        { fiat: bob, asset: usdc, legs: ['PROVIDER_ONRAMP'] },
        { fiat: ars, asset: usdc, legs: ['PROVIDER_ONRAMP'] },
      ],
    });
    client.listRampOrders = async () => ({ orders: [], nextCursor: null });
    texts = [];
    unmount = await render(React.createElement(RampWidget, { onClose() {}, language: 'pt' }));
    const chipsShown = [...new Set(buttons.map(label))];
    const ar = chipsShown.indexOf('Argentina');
    const bo = chipsShown.indexOf('Bolívia');
    assert.ok(ar >= 0 && bo > ar, `country chips by name, in Portuguese; have: ${chipsShown.join(', ')}`);
    await unmount();

    const { ModalLanguageContext, useProviderLanguage, useInheritedLanguage } = load(
      'packages/react-native/src/language-context.ts',
    );
    let locale;
    const listeners = new Set();
    const host = {
      getLocale: () => locale,
      onLocaleChange: (cb) => (listeners.add(cb), () => listeners.delete(cb)),
      setLocale(next) {
        locale = next;
        for (const cb of listeners) cb(next);
      },
    };
    let current;
    const Modal = () => {
      current = useInheritedLanguage();
      return null;
    };
    const Provider = ({ language, dashboard }) =>
      React.createElement(
        ModalLanguageContext.Provider,
        { value: useProviderLanguage(host, dashboard, language) },
        React.createElement(Modal),
      );
    const container = document.createElement('div');
    const root = createRoot(container);
    const show = (props) => React.act(async () => root.render(React.createElement(Provider, props)));
    await show({ language: 'en' });
    assert.equal(current, 'en');
    await show({ language: 'es-AR' });
    assert.equal(current, 'es', 'an open modal follows the new prop');
    await show({ language: 'fr' });
    assert.equal(current, 'en', 'a tag the modals lack falls back (jsdom device: en-US)');
    await React.act(async () => host.setLocale('pt-BR'));
    assert.equal(current, 'pt', 'setLocale switches the open modal');
    await show({ language: 'es', dashboard: 'pt' });
    assert.equal(current, 'pt', 'the dashboard pin wins over the prop');
    await React.act(async () => root.unmount());
  }

  // --- Opened on options: the seed applies to the first routes of its direction, a dead end falls back ---
  {
    const brl = { kind: 'fiat', currency: 'BRL', rail: 'PIX', country: 'BR' };
    const xlm = { kind: 'asset', code: 'XLM', identifier: null, chain: 'STELLAR' };
    const routesFor = {
      ONRAMP: [
        { fiat: bob, asset: usdc, legs: ['PROVIDER_ONRAMP'] },
        { fiat: brl, asset: xlm, legs: ['PROVIDER_ONRAMP'] },
        { fiat: brl, asset: usdc, legs: ['PROVIDER_ONRAMP'] },
      ],
      // Brazil does not sell.
      OFFRAMP: [{ fiat: bob, asset: usdc, legs: ['PROVIDER_OFFRAMP'] }],
    };
    let hold = null;
    const asked = [];
    client.getRampRoutes = async (direction) => {
      asked.push(direction);
      if (hold) await hold;
      return { routes: routesFor[direction] };
    };
    client.listRampOrders = async () => ({ orders: [], nextCursor: null });
    saved = null;
    // The chips drawn with the accent border are the picked ones; a chip's last render is its state.
    const picked = () => {
      const last = new Map(buttons.map((b) => [label(b), b.style?.[1]?.borderColor === '#005DB4']));
      return [...last].filter(([, on]) => on).map(([name]) => name);
    };
    const amountValue = () => [...inputs].reverse().find((i) => i.keyboardType === 'decimal-pad')?.value;
    const open = async (initial) => {
      inputs = [];
      const done = await render(React.createElement(RampWidget, { onClose() {}, initial }));
      await rerender(() => new Promise((r) => setTimeout(r, 10)));
      return done;
    };

    unmount = await open({ country: 'br', direction: 'buy', asset: 'USDC', amount: '50' });
    assert.equal(asked.at(-1), 'ONRAMP');
    assert.ok(picked().includes('Brazil'), `the seeded country; picked: ${picked().join(', ')}`);
    assert.ok(
      picked().some((l) => l.startsWith('USDC')),
      'the seeded asset, not the country first one',
    );
    assert.equal(amountValue(), '50');
    await unmount();

    unmount = await open({ country: 'BR', direction: 'sell' });
    assert.equal(asked.at(-1), 'OFFRAMP', 'the requested direction stays');
    assert.ok(picked().includes('Bolivia'), 'a country that does not sell falls back to the default');
    assert.equal(amountValue(), '');
    await unmount();

    // A kept order wins over the options.
    saved = { direction: 'ONRAMP', order: order(null, { state: 'processing' }) };
    unmount = await open({ country: 'BR', direction: 'sell' });
    assert.notEqual(asked.at(-1), 'OFFRAMP', 'the kept order keeps its direction');
    await unmount();
    saved = null;

    let release;
    hold = new Promise((r) => (release = r));
    unmount = await open({ country: 'BR', amount: '20' });
    hold = null;
    await rerender(() => release());
    assert.ok(picked().includes('Brazil'), 'the seed applies once the routes load');
    assert.equal(amountValue(), '20');
    await unmount();
  }

  console.log(
    'React Native RampWidget v3: route, quote, details, order, QR, kept order, explicit signature, account approval resume, lapsed quotes, a provider KYC note, a missing payment code, country names, a runtime language and opening on options passed',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
