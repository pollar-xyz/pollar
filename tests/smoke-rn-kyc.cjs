// React Native KYC + ramp gate: the real containers, with react-native mocked as
// plain components so their buttons and inputs can be driven from Node.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.invalid/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// Node 20, the CI runtime, has no global navigator; react-dom reads it on load.
globalThis.navigator = dom.window.navigator;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const core = require('../packages/core/dist/index.js');

let buttons = [];
let inputs = [];
let routes = [];
const opened = [];
let appStateListener = null;
const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
const reactNative = {
  View: passthrough,
  ScrollView: passthrough,
  Text: passthrough,
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
  Linking: { openURL: async (url) => opened.push(url) },
  AppState: {
    addEventListener: (_event, listener) => {
      appStateListener = listener;
      return { remove: () => (appStateListener = null) };
    },
  },
};

let client;
const pollarContext = { getClient: () => client, walletAddress: 'wallet', styles: {} };

function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scope = { exports: {}, setInterval, clearInterval, setTimeout, clearTimeout, globalThis };
  scope.require = (id) => {
    if (id === 'react-native') return reactNative;
    if (id === '@pollar/core') return core;
    if (id === '../../context') return { usePollar: () => pollarContext };
    if (id === '../commons') return { PollarModalFooter: () => null };
    if (id === './KycStatus') return { KycStatus: () => null };
    if (id === './RouteDisplay') {
      return {
        RouteDisplay: (props) => {
          routes.push(props);
          return null;
        },
      };
    }
    if (id === '../kyc-modal/KycModal') return load('packages/react-native/src/components/kyc-modal/KycModal.tsx');
    if (id.startsWith('.')) {
      // Containers (.tsx) and helpers (.ts) import each other without an extension.
      const base = path.join(path.dirname(file), id);
      return load(fs.existsSync(path.resolve(__dirname, '..', `${base}.tsx`)) ? `${base}.tsx` : `${base}.ts`);
    }
    return require(id);
  };
  vm.runInNewContext(output, scope);
  return scope.exports;
}

const label = (props) => {
  const child = props.children;
  const text = child && child.props ? child.props.children : child;
  return Array.isArray(text) ? text.join('') : String(text);
};
function press(text) {
  const match = [...buttons].reverse().find((b) => label(b) === text);
  assert.ok(match, `button "${text}" not rendered; have: ${[...new Set(buttons.map(label))].join(', ')}`);
  return React.act(async () => match.onPress());
}
const has = (text) => buttons.some((b) => label(b) === text);
async function render(element) {
  const container = document.createElement('div');
  const root = createRoot(container);
  buttons = [];
  await React.act(async () => root.render(element));
  return async () => React.act(async () => root.unmount());
}

const { RampWidget } = load('packages/react-native/src/components/ramp-widget/RampWidget.tsx');
const { KycModal } = load('packages/react-native/src/components/kyc-modal/KycModal.tsx');
const gate = new core.PollarApiError('SDK_RAMPS_KYC_REQUIRED', {
  code: 'SDK_RAMPS_KYC_REQUIRED',
  rampProviderId: 'ramp-a',
  kycProviderId: 'option-a',
  corridorId: 'corridor-a',
});
const option = { id: 'option-a', name: 'Didit', flow: 'iframe', levels: ['basic'] };

(async () => {
  // KYC modal: opens the gate's option, hands the URL to the browser, checks on return.
  let decisions = 0;
  client = {
    getKycProviders: async (_country, corridorId) => {
      assert.equal(corridorId, 'corridor-a');
      return { providers: [option] };
    },
    resolveKyc: async () => ({ alreadyApproved: false, sessionId: 's', kycUrl: 'https://kyc.example/s' }),
    pollKycDecision: async () => {
      decisions++;
      return { status: 'pending', decisionStatus: 'manual_review', reviewReason: 'DUPLICATE_DOCUMENT' };
    },
  };
  let unmount = await render(
    React.createElement(KycModal, { onClose() {}, country: 'BO', corridorId: 'corridor-a', providerId: 'option-a' }),
  );
  await press('Open verification');
  assert.deepEqual(opened, ['https://kyc.example/s']);
  await React.act(async () => appStateListener('active'));
  assert.equal(decisions, 1);
  assert.ok(has('Check again')); // manual review settles into the review result
  await unmount();

  // Ramp: gate -> KYC on the named option -> approval -> fresh quotes -> user picks.
  let quoteCalls = 0;
  const starts = [];
  client = {
    getRampCountries: async () => ({ countries: [{ code: 'BO', currency: 'BOB' }] }),
    getRampsQuote: async () => {
      quoteCalls++;
      return { quotes: [{ quoteId: quoteCalls === 1 ? 'first' : 'fresh', provider: 'Stereum' }] };
    },
    createOnRamp: async (body) => {
      starts.push(body);
      if (starts.length === 1) throw gate;
      return { txId: 'tx', provider: 'Stereum', status: 'pending_user_transfer_start' };
    },
    getRampTransaction: async () => ({ status: 'pending_user_transfer_start' }),
    getKycProviders: async () => ({ providers: [option] }),
    resolveKyc: async () => ({ alreadyApproved: true }),
  };
  routes = [];
  unmount = await render(React.createElement(RampWidget, { onClose() {} }));
  await React.act(async () => inputs[inputs.length - 1].onChangeText('10'));
  routes = [];
  await press('Find routes');
  assert.equal(quoteCalls, 1);
  const first = routes[routes.length - 1];
  assert.equal(first.quote.quoteId, 'first');
  routes = [];
  await React.act(async () => first.onSelect(first.quote));
  // The modal auto-opened the named option and it was already approved: back to fresh quotes.
  assert.equal(quoteCalls, 2);
  assert.equal(starts.length, 1); // approval never starts an order by itself
  const fresh = routes[routes.length - 1];
  assert.equal(fresh.quote.quoteId, 'fresh');
  await React.act(async () => fresh.onSelect(fresh.quote));
  assert.equal(starts.length, 2);
  assert.equal(starts[1].quoteId, 'fresh');
  assert.equal(starts[1].amount, 10);
  await unmount();

  // Quote-time gate: a route with a pending step arrives in `requirementsRequired`, not in `quotes`.
  const locked = {
    provider: 'Stereum',
    rampProviderId: 'ramp-b',
    corridorId: 'corridor-b',
    position: 1,
    completed: 0,
    total: 1,
    type: 'KYC',
    optionId: 'option-b',
    status: 'none',
  };
  quoteCalls = 0;
  starts.length = 0;
  const resolved = [];
  client = {
    getRampCountries: async () => ({ countries: [{ code: 'BO', currency: 'BOB' }] }),
    getRampsQuote: async () => {
      quoteCalls++;
      return quoteCalls === 1
        ? { quotes: [], requirementsRequired: [locked] }
        : { quotes: [{ quoteId: 'unlocked', provider: 'Stereum' }] };
    },
    createOnRamp: async (body) => {
      starts.push(body);
      return { txId: 'tx', provider: 'Stereum', status: 'pending_user_transfer_start' };
    },
    getRampTransaction: async () => ({ status: 'pending_user_transfer_start' }),
    getKycProviders: async (country, corridorId) => {
      assert.equal(country, 'BO');
      assert.equal(corridorId, 'corridor-b');
      return { providers: [{ ...option, id: 'option-b' }] };
    },
    resolveKyc: async (providerId, _level, _country, corridorId) => {
      resolved.push({ providerId, corridorId });
      return { alreadyApproved: true };
    },
  };
  routes = [];
  unmount = await render(React.createElement(RampWidget, { onClose() {} }));
  await React.act(async () => inputs[inputs.length - 1].onChangeText('10'));
  routes = [];
  await press('Find routes');
  assert.equal(quoteCalls, 1);
  assert.equal(routes.length, 0);
  assert.ok(has('Verify')); // the locked row, not the "no providers" error
  assert.ok(!has('Try again'));
  routes = [];
  await press('Verify');
  assert.deepEqual(resolved, [{ providerId: 'option-b', corridorId: 'corridor-b' }]);
  assert.equal(quoteCalls, 2); // approval re-quotes the same input
  assert.equal(starts.length, 0);
  const unlocked = routes[routes.length - 1];
  assert.equal(unlocked.quote.quoteId, 'unlocked');
  await React.act(async () => unlocked.onSelect(unlocked.quote));
  assert.equal(starts.length, 1);
  assert.equal(starts[0].quoteId, 'unlocked');
  assert.equal(starts[0].amount, 10);
  await unmount();

  console.log('React Native: hosted KYC opens in the browser and checks on return; ramp gate re-quotes after approval');
  console.log('React Native: a route locked by KYC shows instead of "no providers"; Verify opens its option and re-quotes');
  dom.window.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
