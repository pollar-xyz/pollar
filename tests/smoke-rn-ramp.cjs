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
  copyText: async () => {},
  openCosignModal() {},
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
    if (id === '../../context') return { usePollar: () => pollarContext };
    if (id === '../commons') return { PollarOverlay: passthrough };
    if (id.startsWith('.')) return load(`${path.join(path.dirname(file), id)}.tsx`);
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
    signRampLeg: async (id, actionId) => {
      calls.push(['signRampLeg', id, actionId]);
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
  await press('Find routes');
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
  assert.deepEqual(calls.at(-1), ['signRampLeg', 'order-0001', 'sign']);
  await unmount();

  console.log('React Native RampWidget v3: route, quote, details, order, QR, kept order and explicit signature passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
