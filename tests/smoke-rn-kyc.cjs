// React Native KYC: the real container, with react-native mocked as plain
// components so its buttons and inputs can be driven from Node.
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
const pollarContext = { getClient: () => client, walletAddress: 'wallet', styles: {}, ramp: null, setRamp() {} };

function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scope = { exports: {}, setInterval, clearInterval, setTimeout, clearTimeout, globalThis };
  scope.require = (id) => {
    if (id === 'react-native') return reactNative;
    if (id === '@pollar/core') return core;
    if (id === 'react-native-qrcode-svg') return () => null;
    if (id === 'react-native-safe-area-context') return { SafeAreaProvider: passthrough, SafeAreaView: passthrough };
    if (id === '../../context' || id === '../context' || id === './context') return { usePollar: () => pollarContext };
    if (id === '../commons') return { PollarModalFooter: () => null, PollarOverlay: passthrough };
    if (id === './KycStatus') return { KycStatus: () => null };
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

const { KycModal } = load('packages/react-native/src/components/kyc-modal/KycModal.tsx');
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

  console.log('React Native: hosted KYC opens in the browser and checks on return');
  dom.window.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
