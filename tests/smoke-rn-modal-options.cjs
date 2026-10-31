// React Native send, swap and earn panels opened on options: the seed applies
// once its data loads, an option that matches nothing leaves the default, and
// onSuccess fires once per transaction the panel sends.
//
// Run with `node tests/smoke-rn-modal-options.cjs` after `npm run build`.
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
  Image: () => null,
  Pressable: (props) => {
    pressables.push(props);
    return h(React.Fragment, null, props.children);
  },
  TouchableOpacity: passthrough,
  TextInput: (props) => {
    inputs.push(props);
    return null;
  },
  ActivityIndicator: () => null,
  StyleSheet: { create: (s) => s, absoluteFillObject: {} },
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
    if (id === '@pollar/core') return core;
    if (id === 'react-native-qrcode-svg') return () => null;
    if (id === '../context' || id === '../../context' || id === './context') return { usePollar: () => ctx };
    if (id.startsWith('.')) {
      const base = path.join(path.dirname(file), id);
      return load(fs.existsSync(path.resolve(__dirname, '..', `${base}.tsx`)) ? `${base}.tsx` : `${base}.ts`);
    }
    return require(id);
  };
  vm.runInNewContext(output, scope);
  return scope.exports;
}

const { SendPanel, SwapPanel, EarnPanel } = load('packages/react-native/src/components/FeaturePanel.tsx');

const usdc = { chain: 'STELLAR', code: 'USDC', issuer: 'GA5Z', enabledInApp: true, trustlineEstablished: true };
function context(patch = {}) {
  return {
    verified: true,
    isAuthenticated: true,
    network: 'testnet',
    styles: {},
    wallet: { address: 'GUSER', chain: 'STELLAR' },
    wallets: [
      { address: 'GUSER', chain: 'STELLAR' },
      { address: 'SoLuser', chain: 'SOLANA' },
    ],
    enabledAssets: { step: 'loading' },
    refreshAssets: async () => {},
    tx: { step: 'idle' },
    copyText: async () => {},
    getClient: () => ({ getTxStatus: async () => null }),
    ...patch,
  };
}

let root;
let tick = 0;
// Renders, lets the loads settle, then renders once more so the recorded props are one pass's.
async function show(Panel, props) {
  await React.act(async () => {
    root.render(h(Panel, { ...props, key: 'panel', tick: ++tick }));
    await new Promise((r) => setTimeout(r, 10));
  });
  pressables = [];
  inputs = [];
  await React.act(async () => root.render(h(Panel, { ...props, key: 'panel', tick: ++tick })));
}
const checked = () => pressables.filter((p) => p.accessibilityState?.checked).map((p) => p.accessibilityLabel);
const input = (label) => inputs.find((i) => i.accessibilityLabel === label)?.value;
async function press(label) {
  const match = [...pressables].reverse().find((p) => p.accessibilityLabel === label && !p.disabled);
  assert.ok(match, `"${label}" not pressable; have: ${pressables.map((p) => p.accessibilityLabel).join(', ')}`);
  await React.act(async () => {
    match.onPress();
    await new Promise((r) => setTimeout(r, 10));
  });
}
async function mount() {
  const container = document.createElement('div');
  root = createRoot(container);
}
async function unmount() {
  await React.act(async () => root.unmount());
}

(async () => {
  // --- Send: chain, destination and amount at once; the asset once the enabled assets load ---
  {
    const hashes = [];
    ctx = context({
      sendPayment: async () => {
        ctx.tx = { step: 'success', hash: 'h1' };
        return { status: 'success', hash: 'h1' };
      },
    });
    await mount();
    const initial = {
      chain: 'STELLAR',
      asset: 'usdc',
      destination: 'GDEST',
      amount: '5',
      onSuccess: (r) => hashes.push(r.hash),
    };
    await show(SendPanel, { initial });
    assert.deepEqual(checked(), ['STELLAR', 'Native'], 'the asset waits for the enabled assets');
    assert.equal(input('Destination address'), 'GDEST');
    assert.equal(input('Amount'), '5');
    ctx.enabledAssets = { step: 'loaded', data: { assets: [usdc] } };
    await show(SendPanel, { initial });
    assert.deepEqual(checked(), ['STELLAR', 'STELLAR:USDC:GA5Z'], 'the seeded asset once it loads');

    await press('Review payment');
    await press('Confirm payment');
    await show(SendPanel, { initial });
    await show(SendPanel, { initial });
    assert.deepEqual(hashes, ['h1'], 'onSuccess once per transaction');
    await unmount();

    ctx = context({ enabledAssets: { step: 'loaded', data: { assets: [usdc] } } });
    await mount();
    await show(SendPanel, { initial: { chain: 'POLYGON', asset: 'NOPE', amount: '1e3' } });
    assert.deepEqual(checked(), ['STELLAR', 'Native'], 'an unknown chain and asset keep the defaults');
    assert.equal(input('Amount'), '', 'an amount that is not a plain decimal is left out');
    await unmount();
  }

  // --- Swap: the sell and buy tokens once the token list loads ---
  {
    const hashes = [];
    const tokens = [
      { code: 'XLM', chain: 'STELLAR' },
      { code: 'USDC', issuer: 'GA5Z', chain: 'STELLAR' },
    ];
    ctx = context({
      getSwapTokens: async () => tokens,
      getSwapConfig: async () => ({ venues: ['soroswap'] }),
      getSwapQuote: async () => [{ provider: 'soroswap', amountOut: '1' }],
      swap: async () => {
        ctx.tx = { step: 'success', hash: 's1' };
        return { status: 'success', hash: 's1' };
      },
    });
    await mount();
    const initial = { sell: 'xlm', buy: 'USDC', amount: '10', onSuccess: (r) => hashes.push(r.hash) };
    await show(SwapPanel, { initial });
    assert.deepEqual(checked(), ['STELLAR:XLM:native', 'STELLAR:USDC:GA5Z']);
    assert.equal(input('Amount'), '10');
    await press('Get quotes');
    await press('Confirm swap via soroswap');
    await show(SwapPanel, { initial });
    assert.deepEqual(hashes, ['s1']);
    await unmount();

    ctx = context({ getSwapTokens: async () => tokens, getSwapConfig: async () => ({}) });
    await mount();
    await show(SwapPanel, { initial: { sell: 'NOPE', buy: 'usdc' } });
    assert.deepEqual(checked(), ['STELLAR:USDC:GA5Z'], 'an unknown token leaves its picker on the default');
    await unmount();
  }

  // --- Earn: the provider, then its opportunity, once each loads ---
  {
    const hashes = [];
    ctx = context({
      getEarnProviders: async () => ['defindex', 'blend'],
      getEarnOpportunities: async () => [{ id: 'o1' }, { id: 'o2' }],
      getEarnPosition: async () => ({ withdrawUnit: 'shares' }),
      earnDeposit: async () => {
        ctx.tx = { step: 'success', hash: 'e1' };
        return { status: 'success', hash: 'e1' };
      },
    });
    await mount();
    const initial = { provider: 'blend', opportunityId: 'o2', amount: '3', onSuccess: (r) => hashes.push(r.hash) };
    await show(EarnPanel, { initial });
    assert.deepEqual(checked(), ['blend', 'o2']);
    assert.equal(input('Amount'), '3');
    await press('Review deposit');
    await press('Confirm deposit');
    await show(EarnPanel, { initial });
    assert.deepEqual(hashes, ['e1']);
    await unmount();

    ctx = context({
      getEarnProviders: async () => ['defindex', 'blend'],
      getEarnOpportunities: async () => [{ id: 'o1' }],
      getEarnPosition: async () => ({}),
    });
    await mount();
    await show(EarnPanel, { initial: { provider: 'blend', opportunityId: 'missing' } });
    assert.deepEqual(checked(), ['blend'], 'a missing opportunity is left unpicked, the provider still applies');
    await unmount();
    ctx = context({ getEarnProviders: async () => ['defindex'] });
    await mount();
    await show(EarnPanel, { initial: { provider: 'blend' } });
    assert.deepEqual(checked(), [], 'a provider the app lacks opens on no provider, as today');
    await unmount();
  }

  console.log(
    'React Native modal options: send, swap and earn seeds, late data, unknown values falling back and onSuccess once passed',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
