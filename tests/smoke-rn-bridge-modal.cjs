// React Native BridgeModal opened on options: the direction and amount given,
// a direction the user cannot move in falling back to the first one offered,
// an amount that is not a decimal left out, and onSuccess heard once when the
// USDC arrives.
//
// Run with `node tests/smoke-rn-bridge-modal.cjs` after `npm run build`.
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
const h = React.createElement;

let pressables = [];
let inputs = [];
const passthrough = ({ children }) => h(React.Fragment, null, children);
const reactNative = {
  View: passthrough,
  ScrollView: passthrough,
  Text: passthrough,
  KeyboardAvoidingView: passthrough,
  Modal: passthrough,
  Platform: { OS: 'ios', select: (o) => o.ios ?? o.default },
  Pressable: (props) => {
    pressables.push(props);
    return h(React.Fragment, null, props.children);
  },
  TextInput: (props) => {
    inputs.push(props);
    return null;
  },
  ActivityIndicator: () => null,
  Linking: { openURL: async () => {} },
};

let ctx;
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scope = { exports: {}, setInterval, clearInterval, setTimeout, clearTimeout, globalThis, AbortController };
  scope.require = (id) => {
    if (id === 'react-native') return reactNative;
    if (id === 'react-native-safe-area-context') return { SafeAreaProvider: passthrough, SafeAreaView: passthrough };
    if (id === '@pollar/core') return core;
    if (id === '../context' || id === '../../context') return { usePollar: () => ctx };
    if (id === '../language' || id === '../../language') return { useModalLanguage: () => 'en' };
    if (id === '../commons') return { PollarModalFooter: () => null };
    if (id === '../layout') return { useSurfaceColors: () => ({ bg: '#fff' }) };
    if (id.startsWith('.')) {
      const base = path.join(path.dirname(file), id);
      return load(fs.existsSync(path.resolve(__dirname, '..', `${base}.tsx`)) ? `${base}.tsx` : `${base}.ts`);
    }
    return require(id);
  };
  vm.runInNewContext(output, scope);
  return scope.exports;
}

const { BridgeModal } = load('packages/react-native/src/components/bridge-modal/BridgeModal.tsx');

const STELLAR = 'GBQ4ZKD7HMTNQOSWJRB7VP5PAKAQFGFUIGTDN2S4OOFE36QPLXZ2SRAN';
const SOLANA = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const calls = [];
const done = {
  id: 'bt-1',
  status: 'COMPLETED',
  fromChain: 'STELLAR',
  toChain: 'SOLANA',
  asset: 'USDC',
  amount: '5',
  amountOut: '5',
  fromAddress: STELLAR,
  toAddress: SOLANA,
  burnTxHash: 'burn-1',
  mintTxHash: 'mint-1',
  pendingAction: null,
  failure: null,
  etaSeconds: 300,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
};
const client = {
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
      ...params,
      asset: 'USDC',
      amountIn: params.amount,
      amountOut: params.amount,
      fee: null,
      etaSeconds: 300,
      signing: 'INTERNAL',
    };
  },
  bridge: async (params) => {
    calls.push(['bridge', params]);
    return { ...done, status: 'BURNED', mintTxHash: null, amountOut: null };
  },
  // Two reads that both see it complete: onSuccess must still be heard once.
  pollBridgeTransfer: async (_id, opts) => {
    opts.onUpdate(done);
    opts.onUpdate({ ...done });
    return done;
  },
  getBridgeTransfer: async () => done,
};
ctx = {
  styles: {},
  getClient: () => client,
  walletBalance: {
    step: 'loaded',
    data: { balances: [{ chain: 'STELLAR', code: 'USDC', balance: '50', available: '50' }] },
  },
  refreshWalletBalance: async () => {},
  openCosignModal: () => {},
};

let root;
let tick = 0;
const settle = () => new Promise((r) => setTimeout(r, 500));
// Effects run as each act ends: one act per step (render, config, quote debounce).
async function show(initial) {
  pressables = [];
  inputs = [];
  await React.act(async () => {
    root.render(h(BridgeModal, { onClose: () => {}, initial, key: `modal-${++tick}` }));
  });
  for (let step = 0; step < 3; step++) await React.act(settle);
}
const checked = () => pressables.filter((p) => p.accessibilityState?.checked).map((p) => p.accessibilityLabel);
const amount = () => inputs.filter((i) => i.accessibilityLabel === 'Amount (USDC)').at(-1)?.value;

(async () => {
  const container = document.createElement('div');
  root = createRoot(container);

  await show({ fromChain: 'POLYGON', toChain: 'SOLANA', amount: '5' });
  assert.deepEqual(checked().slice(-2), ['Polygon', 'Solana'], 'the direction given');
  assert.equal(amount(), '5', 'the amount given');
  assert.deepEqual(
    // A copy: the object was built inside the module's vm context, with its own prototype.
    { ...calls.find((c) => c[0] === 'quoteBridge')?.[1] },
    { fromChain: 'POLYGON', toChain: 'SOLANA', amount: '5' },
    'the seeded form is quoted',
  );

  await show({ fromChain: 'SOLANA', toChain: 'STELLAR', amount: 'ten' });
  assert.deepEqual(checked().slice(-2), ['Stellar', 'Solana'], 'a source the user cannot bridge from falls back to the first');
  assert.equal(amount(), '', 'an amount that is not a decimal is left out');

  await show({ fromChain: 'STELLAR', toChain: 'STELLAR' });
  assert.deepEqual(checked().slice(-2), ['Stellar', 'Solana'], 'a destination not offered from the source falls back');

  const arrived = [];
  await show({ fromChain: 'STELLAR', toChain: 'SOLANA', amount: '5', onSuccess: (t) => arrived.push(t.id) });
  const move = [...pressables].reverse().find((p) => p.accessibilityLabel === 'Move USDC' && !p.disabled);
  assert.ok(move, 'the Move USDC button is enabled once quoted');
  await React.act(async () => move.onPress());
  for (let step = 0; step < 2; step++) await React.act(settle);
  assert.equal(calls.find((c) => c[0] === 'bridge')?.[1].fromChain, 'STELLAR', 'the bridge starts on the seeded direction');
  assert.deepEqual(arrived, ['bt-1'], 'onSuccess heard once');

  await React.act(async () => root.unmount());
  console.log('React Native bridge modal options: direction, amount, fallbacks and onSuccess once passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
