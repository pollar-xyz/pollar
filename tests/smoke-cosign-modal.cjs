// The co-signed wallet prompt, web and React Native: the real modals, with the
// client faked the way core behaves. Every refresh of the pending list hands
// back new objects for the same requests, and that refresh lands before the
// slower Turnkey check; the check must survive it and enable Approve.
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

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  OK    ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    failed++;
  }
}

const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
const reactNative = {
  View: passthrough,
  ScrollView: passthrough,
  Text: passthrough,
  TouchableOpacity: (props) => React.createElement('button', { disabled: props.disabled }, props.children),
  Pressable: (props) => React.createElement('button', { disabled: props.disabled }, props.children),
  Image: () => null,
  ActivityIndicator: () => null,
  Modal: passthrough,
  Linking: { openURL: () => Promise.resolve() },
  Platform: { OS: 'ios', select: (options) => options.ios ?? options.default },
  StyleSheet: { create: (s) => s, absoluteFillObject: {}, hairlineWidth: 1 },
};
const reactNativeSvg = { __esModule: true, default: passthrough, Circle: () => null, Path: () => null, Rect: () => null };

function loader(mocks) {
  return function load(file) {
    const filename = path.resolve(__dirname, '..', file);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const scope = { exports: {}, setInterval, clearInterval, setTimeout, clearTimeout, globalThis };
    scope.require = (id) => {
      if (id in mocks) return mocks[id];
      if (id.endsWith('.css')) return {};
      if (id === '@pollar/core') return core;
      if (id.startsWith('.')) {
        const base = path.join(path.dirname(file), id);
        return load(fs.existsSync(path.resolve(__dirname, '..', `${base}.tsx`)) ? `${base}.tsx` : `${base}.ts`);
      }
      return require(id);
    };
    vm.runInNewContext(output, scope);
    return scope.exports;
  };
}

/** A client whose cosign store refreshes like core's: same requests, new objects. */
function fakeClient() {
  const listeners = new Set();
  let state = { pending: [] };
  const emit = () => listeners.forEach((cb) => cb({ ...state, pending: [...state.pending] }));
  const client = {
    getCosignState: () => ({ ...state, pending: [...state.pending] }),
    onCosignStateChange: (cb) => {
      listeners.add(cb);
      cb(client.getCosignState());
      return () => listeners.delete(cb);
    },
    onAuthStateChange: () => () => undefined,
    arrive(request) {
      state = { pending: [request] };
      emit();
    },
    resolve(resolved) {
      state = { pending: [], lastResolved: resolved };
      emit();
    },
    cosign: {
      pending: async () => {
        client.calls.pending++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        state = { ...state, pending: state.pending.map((r) => ({ ...r })) };
        emit();
        return state.pending;
      },
      inspectQuorum: async () => {
        client.calls.inspectQuorum++;
        return { ok: true };
      },
      verify: async () => {
        client.calls.verify++;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return { ok: true };
      },
    },
    calls: { pending: 0, inspectQuorum: 0, verify: 0 },
  };
  return client;
}

const request = {
  id: 'request-1',
  kind: 'TX',
  network: 'STELLAR',
  status: 'PENDING',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};
// Many short acts, not one long one: an async act holds every update until it
// ends, which would render the refreshed list only after the check resolved.
async function settle() {
  for (let i = 0; i < 30; i++) await React.act(() => new Promise((resolve) => setTimeout(resolve, 5)));
}

async function mount(element) {
  const container = document.createElement('div');
  const root = createRoot(container);
  await React.act(async () => root.render(element));
  return { container, unmount: () => React.act(async () => root.unmount()) };
}

(async () => {
  // ── 1. Web ──────────────────────────────────────────────────────
  console.log('\n── 1. web CosignModal ────────────────────────────────────');
  {
    const client = fakeClient();
    const getClient = () => client;
    const context = { getClient, isAuthenticated: true, styles: {} };
    const load = loader({
      '../../context': { usePollar: () => context },
      './context': { usePollar: () => context },
      '../commons': { CopyButton: () => null, cropAddress: (s) => s, PollarModalFooter: () => null },
    });
    const { CosignModal } = load('packages/react/src/components/cosign-modal/CosignModal.tsx');
    await React.act(async () => client.arrive(request));
    const view = await mount(React.createElement(CosignModal, { onClose: () => undefined }));
    await settle();
    check('the check against Turnkey ran once', () => assert.equal(client.calls.verify, 1));
    check('the request was verified', () => assert.match(view.container.textContent, /Verified/));
    const approve = [...view.container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Approve');
    check('Approve is enabled', () => assert.ok(approve && !approve.disabled, 'Approve missing or disabled'));
    await view.unmount();
  }

  // ── 2. React Native ─────────────────────────────────────────────
  console.log('\n── 2. react-native CosignModal ───────────────────────────');
  {
    const client = fakeClient();
    const getClient = () => client;
    const context = { getClient, styles: {}, cosign: client.getCosignState() };
    const load = loader({
      'react-native': reactNative,
      'react-native-svg': reactNativeSvg,
      '../../context': { usePollar: () => context },
      './context': { usePollar: () => context },
      '../commons': { PollarOverlay: passthrough, PollarModalFooter: () => null },
    });
    const { CosignModal } = load('packages/react-native/src/components/cosign-modal/CosignModal.tsx');
    // The provider re-renders the modal with each new cosign state, as its context does.
    function Host() {
      const [, rerender] = React.useState(0);
      React.useEffect(
        () =>
          client.onCosignStateChange((state) => {
            context.cosign = state;
            rerender((n) => n + 1);
          }),
        [],
      );
      return React.createElement(CosignModal, { onClose: () => undefined });
    }
    await React.act(async () => client.arrive(request));
    context.cosign = client.getCosignState();
    const view = await mount(React.createElement(Host));
    await settle();
    check('the pending list was read once', () => assert.equal(client.calls.pending, 1));
    check('the quorum was inspected once', () => assert.equal(client.calls.inspectQuorum, 1));
    check('the check against Turnkey ran once', () => assert.equal(client.calls.verify, 1));
    check('the request was verified', () => assert.match(view.container.textContent, /Verified/));
    const approve = [...view.container.querySelectorAll('button')].find((b) => /Approve/.test(b.textContent));
    check('Approve is enabled', () => assert.ok(approve && !approve.disabled, 'Approve missing or disabled'));
    await view.unmount();
  }

  // ── 3. Auto-close ───────────────────────────────────────────────
  // An outcome that needs nothing from the user closes after 3s; a sent
  // transaction leaves its hash on screen for 5s first.
  const wait = (ms) => React.act(() => new Promise((resolve) => setTimeout(resolve, ms)));
  const outcomes = [
    ['approved, nothing signed', { ...request, status: 'APPROVED' }, 3],
    ['approved and sent', { ...request, status: 'APPROVED', submit: { hash: 'f'.repeat(64) } }, 5],
  ];
  for (const platform of ['web', 'react-native']) {
    console.log(`\n── 3. ${platform} auto-close ─────────────────────────────`);
    for (const [name, resolved, seconds] of outcomes) {
      const client = fakeClient();
      let closed = 0;
      const onClose = () => closed++;
      let CosignModal;
      let Host;
      if (platform === 'web') {
        const context = { getClient: () => client, isAuthenticated: true, styles: {}, network: 'mainnet' };
        ({ CosignModal } = loader({
          '../../context': { usePollar: () => context },
          './context': { usePollar: () => context },
          '../commons': {
            CopyButton: () => null,
            cropAddress: (s) => s,
            PollarModalFooter: () => null,
            explorerTxUrl: () => null,
          },
        })('packages/react/src/components/cosign-modal/CosignModal.tsx'));
        Host = () => React.createElement(CosignModal, { onClose });
      } else {
        const context = { getClient: () => client, styles: {}, cosign: client.getCosignState() };
        ({ CosignModal } = loader({
          'react-native': reactNative,
          'react-native-svg': reactNativeSvg,
          'react-native-svg': reactNativeSvg,
          '../../context': { usePollar: () => context },
          './context': { usePollar: () => context },
          '../commons': { PollarOverlay: passthrough, PollarModalFooter: () => null },
        })('packages/react-native/src/components/cosign-modal/CosignModal.tsx'));
        Host = () => {
          const [, rerender] = React.useState(0);
          React.useEffect(
            () =>
              client.onCosignStateChange((state) => {
                context.cosign = state;
                rerender((n) => n + 1);
              }),
            [],
          );
          return React.createElement(CosignModal, { onClose });
        };
      }
      await React.act(async () => client.arrive(request));
      const view = await mount(React.createElement(Host));
      await settle();
      await React.act(async () => client.resolve(resolved));
      await wait(50);
      check(`${name}: counts down from ${seconds}s`, () =>
        assert.match(view.container.textContent, new RegExp(`Closing in ${seconds}s`)),
      );
      await wait(seconds * 1000 + 100);
      check(`${name}: closes on its own`, () => assert.equal(closed, 1));
      await view.unmount();
    }
  }

  console.log(`\n${passed} pass, ${failed} fail`);
  process.exit(failed ? 1 : 0);
})();
