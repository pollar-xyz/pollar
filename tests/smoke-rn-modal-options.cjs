// React Native send, swap, earn panels and the history opened on options: the seed applies
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
  TouchableWithoutFeedback: passthrough,
  FlatList: () => null,
  Modal: passthrough,
  Platform: { OS: 'ios', select: (o) => o.ios ?? o.default },
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
const { TxHistoryModal } = load('packages/react-native/src/components/tx-history-modal/TxHistoryModal.tsx');

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
    walletBalance: { step: 'idle' },
    refreshAssets: async () => {},
    refreshWalletBalance: async () => {},
    getSolanaSwapConfig: async () => [],
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
let container;
async function mount() {
  container = document.createElement('div');
  root = createRoot(container);
}
const texts = () => container.textContent;
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
    assert.deepEqual(checked(), ['STELLAR', 'Native', 'Text'], 'the asset waits for the enabled assets');
    assert.equal(input('Destination address'), 'GDEST');
    assert.equal(input('Amount'), '5');
    ctx.enabledAssets = { step: 'loaded', data: { assets: [usdc] } };
    await show(SendPanel, { initial });
    assert.deepEqual(checked(), ['STELLAR', 'STELLAR:USDC:GA5Z', 'Text'], 'the seeded asset once it loads');

    await press('Review payment');
    await press('Confirm payment');
    await show(SendPanel, { initial });
    await show(SendPanel, { initial });
    assert.deepEqual(hashes, ['h1'], 'onSuccess once per transaction');
    await unmount();

    ctx = context({ enabledAssets: { step: 'loaded', data: { assets: [usdc] } } });
    await mount();
    await show(SendPanel, { initial: { chain: 'POLYGON', asset: 'NOPE', amount: '1e3' } });
    assert.deepEqual(checked(), ['STELLAR', 'Native', 'Text'], 'an unknown chain and asset keep the defaults');
    assert.equal(input('Amount'), '', 'an amount that is not a plain decimal is left out');
    await unmount();

    // The memo: seeded, validated like the web form, and sent as the build option.
    const sent = [];
    ctx = context({
      enabledAssets: { step: 'loaded', data: { assets: [usdc] } },
      sendPayment: async (params) => {
        sent.push(params);
        return { status: 'success', hash: 'h2' };
      },
    });
    await mount();
    const memoed = { destination: 'GDEST', amount: '1', memo: '12345', memoType: 'id' };
    await show(SendPanel, { initial: memoed });
    assert.deepEqual(checked(), ['STELLAR', 'Native', 'ID']);
    assert.equal(input('Memo (optional)'), '12345');
    await press('Review payment');
    await press('Confirm payment');
    assert.deepEqual(JSON.parse(JSON.stringify(sent[0].options)), { memo: { type: 'id', value: '12345' } });
    await unmount();

    ctx = context({ sendPayment: async (params) => sent.push(params) });
    await mount();
    await show(SendPanel, { initial: { destination: 'GDEST', amount: '1', memo: 'abc', memoType: 'hash' } });
    await press('Review payment');
    await press('Confirm payment');
    assert.equal(sent.length, 1, 'an invalid hash memo is refused before sending');
    await unmount();
    ctx = context();
    await mount();
    await show(SendPanel, { initial: { chain: 'SOLANA', memo: 'x' } });
    assert.equal(input('Memo (optional)'), undefined, 'no memo field off Stellar');
    await unmount();
  }

  // --- Swap: the sell asset from the balances, the buy asset once the catalog loads, Max, the venue ---
  {
    const hashes = [];
    const stellarQuotes = [];
    const tokens = [
      { code: 'XLM', chain: 'STELLAR' },
      { code: 'USDC', issuer: 'GA5Z', chain: 'STELLAR' },
    ];
    const stellarBalances = {
      step: 'loaded',
      data: {
        balances: [
          { chain: 'STELLAR', type: 'native', code: 'XLM', balance: '100', available: '98.5' },
          { chain: 'STELLAR', type: 'credit_alphanum4', code: 'USDC', issuer: 'GA5Z', balance: '5', available: '5' },
        ],
      },
    };
    const stellar = {
      walletBalance: stellarBalances,
      getSwapTokens: async () => tokens,
      getSwapConfig: async () => ['soroswap', 'aquarius'],
      getSwapQuote: async (params) => {
        stellarQuotes.push(params);
        return [{ provider: 'aquarius', amountOut: '1' }];
      },
      swap: async () => {
        ctx.tx = { step: 'success', hash: 's1' };
        return { status: 'success', hash: 's1' };
      },
    };
    ctx = context(stellar);
    await mount();
    const initial = { sell: 'xlm', buy: 'USDC', amount: '10', onSuccess: (r) => hashes.push(r.hash) };
    await show(SwapPanel, { initial });
    assert.deepEqual(checked(), ['XLM', 'USDC', 'Best price'], 'sell and buy by code, the venue on auto');
    assert.equal(input('Amount'), '10');
    await press('Max');
    await show(SwapPanel, { initial });
    assert.equal(input('Amount'), '98.5', 'Max fills what the wallet can spend of the sell asset');
    await press('Aquarius');
    await press('Get quotes');
    assert.deepEqual(JSON.parse(JSON.stringify(stellarQuotes.at(-1))), {
      sellAsset: { type: 'native' },
      buyAsset: { type: 'credit_alphanum4', code: 'USDC', issuer: 'GA5Z' },
      amount: '98.5',
      provider: 'aquarius',
      slippageBps: 50,
    });
    await press('Confirm swap via aquarius');
    await show(SwapPanel, { initial });
    assert.deepEqual(hashes, ['s1']);
    await unmount();

    ctx = context(stellar);
    await mount();
    await show(SwapPanel, { initial: { sell: 'NOPE', buy: 'usdc' } });
    assert.deepEqual(checked(), ['USDC', 'Best price'], 'an unknown asset leaves its picker on the default');
    await unmount();

    // The buy list: the app's enabled assets, the catalog, and a token the user adds (with its trustline notice).
    const AQUA_ISSUER = `G${'A'.repeat(55)}`;
    ctx = context({
      ...stellar,
      getSwapTokens: async () => [],
      enabledAssets: {
        step: 'loaded',
        data: {
          assets: [
            { chain: 'STELLAR', type: 'native', code: 'XLM', trustlineEstablished: true },
            { chain: 'STELLAR', type: 'credit_alphanum4', code: 'EURC', issuer: 'GEUR', trustlineEstablished: true },
          ],
        },
      },
    });
    await mount();
    await show(SwapPanel, { initial: { sell: 'XLM', buy: 'EURC', amount: '1' } });
    assert.deepEqual(checked(), ['XLM', 'EURC', 'Best price'], 'an enabled asset is buyable');
    await React.act(async () => {
      inputs.find((i) => i.accessibilityLabel === 'Code (e.g. USDC)').onChangeText('aqua');
      inputs.find((i) => i.accessibilityLabel === 'Issuer (G...)').onChangeText('GBAD');
    });
    await show(SwapPanel, { initial: { sell: 'XLM', buy: 'EURC', amount: '1' } });
    await press('Add token');
    await show(SwapPanel, { initial: { sell: 'XLM', buy: 'EURC', amount: '1' } });
    assert.match(texts(), /Issuer must be a Stellar address/, 'a malformed issuer is refused');
    await React.act(async () => inputs.find((i) => i.accessibilityLabel === 'Issuer (G...)').onChangeText(AQUA_ISSUER));
    await show(SwapPanel, { initial: { sell: 'XLM', buy: 'EURC', amount: '1' } });
    await press('Add token');
    await show(SwapPanel, { initial: { sell: 'XLM', buy: 'EURC', amount: '1' } });
    assert.deepEqual(checked(), ['XLM', 'AQUA', 'Best price'], 'the added token is bought');
    assert.match(texts(), /To receive AQUA your wallet needs a trustline/);
    await press('Get quotes');
    assert.deepEqual(JSON.parse(JSON.stringify(stellarQuotes.at(-1).buyAsset)), {
      type: 'credit_alphanum4',
      code: 'AQUA',
      issuer: AQUA_ISSUER,
    });
    await unmount();

    // Solana: the network picker, the mints from the balances, and the quote in base units.
    const solQuotes = [];
    const solana = {
      getSwapTokens: async () => tokens,
      getSwapConfig: async () => ['soroswap'],
      getSolanaSwapConfig: async () => ['jupiter'],
      walletBalance: {
        step: 'loaded',
        data: { balances: [{ chain: 'SOLANA', type: 'native', code: 'SOL', balance: '2', available: '2' }] },
      },
      enabledAssets: {
        step: 'loaded',
        data: { assets: [{ chain: 'SOLANA', type: 'token', code: 'USDC', issuer: 'EPjF', decimals: 6 }] },
      },
      getSolanaSwapQuote: async (params) => {
        solQuotes.push(params);
        return [{ provider: 'jupiter', outAmount: '1' }];
      },
      swapSolana: async () => {
        ctx.tx = { step: 'success', hash: 'sol1' };
        return { status: 'success', hash: 'sol1' };
      },
    };
    const solHashes = [];
    ctx = context(solana);
    await mount();
    const onSolana = { chain: 'SOLANA', sell: 'sol', buy: 'USDC', amount: '1.5', onSuccess: (r) => solHashes.push(r.hash) };
    await show(SwapPanel, { initial: onSolana });
    assert.deepEqual(checked(), ['SOLANA', 'SOL', 'USDC', 'Best price'], 'the network, the mints by code, auto venue');
    await press('Get quotes');
    assert.deepEqual(JSON.parse(JSON.stringify(solQuotes[0])), {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjF',
      amount: '1500000000',
      slippageBps: 50,
    });
    await press('Confirm swap via jupiter');
    await show(SwapPanel, { initial: onSolana });
    assert.deepEqual(solHashes, ['sol1']);
    await unmount();

    ctx = context({ ...solana, getSolanaSwapConfig: async () => [] });
    await mount();
    await show(SwapPanel, { initial: { chain: 'SOLANA', sell: 'XLM' } });
    assert.deepEqual(checked(), ['Best price'], 'a network the app lacks falls back to Stellar, with no picker');
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
    assert.deepEqual(checked(), ['blend', 'o2', 'Deposit']);
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
    assert.deepEqual(checked(), ['blend', 'Deposit'], 'a missing opportunity is left unpicked, the provider still applies');
    await unmount();
    ctx = context({ getEarnProviders: async () => ['defindex'] });
    await mount();
    await show(EarnPanel, { initial: { provider: 'blend' } });
    assert.deepEqual(checked(), ['Deposit'], 'a provider the app lacks opens on no provider, as today');
    await unmount();

    const withdrawn = [];
    ctx = context({
      getEarnProviders: async () => ['blend'],
      getEarnOpportunities: async () => [{ id: 'o1' }],
      getEarnPosition: async () => ({ withdrawUnit: 'shares' }),
      earnWithdraw: async (params) => withdrawn.push(params),
    });
    await mount();
    await show(EarnPanel, { initial: { provider: 'blend', opportunityId: 'o1', tab: 'withdraw', amount: '2' } });
    assert.deepEqual(checked(), ['blend', 'o1', 'Withdraw']);
    await press('Review withdraw');
    await press('Confirm withdraw');
    assert.deepEqual(JSON.parse(JSON.stringify(withdrawn)), [{ provider: 'blend', opportunity: 'o1', amount: '2' }]);
    await unmount();
  }

  // --- History: the chain option, and one the app does not offer falling back ---
  {
    const fetched = [];
    ctx = context({
      appConfig: { application: { chains: ['STELLAR', 'SOLANA'] } },
      txHistory: { step: 'idle' },
      getClient: () => ({ fetchTxHistory: async (params) => fetched.push(params) }),
    });
    await mount();
    await show(TxHistoryModal, { onClose() {}, initial: { chain: 'SOLANA' } });
    assert.deepEqual(JSON.parse(JSON.stringify(fetched[0])), { chain: 'SOLANA' });
    await unmount();
    fetched.length = 0;
    await mount();
    await show(TxHistoryModal, { onClose() {}, initial: { chain: 'POLYGON' } });
    assert.deepEqual(
      JSON.parse(JSON.stringify(fetched[0])),
      { chain: 'STELLAR' },
      'a chain the app lacks falls back to its first',
    );
    await unmount();
  }

  console.log(
    'React Native modal options: send (memo), swap (Solana, network, Max, venue, enabled and custom buy assets), earn (tabs) and history (network) seeds, late data, unknown values falling back and onSuccess once passed',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
