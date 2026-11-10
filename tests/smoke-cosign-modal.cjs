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
    const scope = { exports: {}, setInterval, clearInterval, setTimeout, clearTimeout, globalThis, document };
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
function fakeClient({ quorum = { ok: true } } = {}) {
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
        return quorum;
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
  document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => root.render(element));
  // The web modals portal into body, so that is where their content is.
  return {
    container: document.body,
    unmount: async () => {
      await React.act(async () => root.unmount());
      container.remove();
    },
  };
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
    check('the request was verified', () => assert.match(view.container.textContent, /Checked/));
    const approve = [...view.container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Approve');
    check('Approve is enabled', () => assert.ok(approve && !approve.disabled, 'Approve missing or disabled'));
    await view.unmount();

    // A provider's sign-in reads as proving who the user is, never as its protocol's name.
    await React.act(async () => client.arrive({ ...request, id: 'sign-in', kind: 'SEP10', operation: 'provider_sign_in' }));
    const signIn = await mount(React.createElement(CosignModal, { onClose: () => undefined }));
    await settle();
    check("a sign-in is titled as confirming it's the user", () =>
      assert.match(signIn.container.textContent, /Confirm it's you/),
    );
    check('it says why the provider asks', () => assert.match(signIn.container.textContent, /confirm this account is yours/));
    check('it says no money moves and nothing is sent', () => {
      assert.match(signIn.container.textContent, /No money moves/);
      assert.match(signIn.container.textContent, /Nothing is sent/);
    });
    check('the protocol name is not shown', () => assert.doesNotMatch(signIn.container.textContent, /sep10|provider_sign_in/i));
    const approveSignIn = [...signIn.container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Approve');
    check('a checked sign-in can be approved', () => assert.ok(approveSignIn && !approveSignIn.disabled));
    await signIn.unmount();
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
    check('the request was verified', () => assert.match(view.container.textContent, /Checked/));
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

  // ── 3b. A flow of two approvals ─────────────────────────────────
  // The step already signed stays on screen as a row; its hash lives in that row's details.
  console.log('\n── 3b. web, a flow of two approvals ──────────────────────');
  {
    const client = fakeClient();
    const context = { getClient: () => client, isAuthenticated: true, styles: {}, network: 'mainnet' };
    const { CosignModal } = loader({
      '../../context': { usePollar: () => context },
      './context': { usePollar: () => context },
      '../commons': {
        CopyButton: () => null,
        cropAddress: (s) => s,
        PollarModalFooter: () => null,
        explorerTxUrl: () => null,
      },
    })('packages/react/src/components/cosign-modal/CosignModal.tsx');
    const first = { ...request, id: 'step-1', operation: 'change_trust', details: { code: 'USDC', asset: 'USDC:GA5Z' } };
    const hash = 'a'.repeat(64);
    await React.act(async () => client.arrive(first));
    const view = await mount(React.createElement(CosignModal, { nextStep: 'Send', onClose: () => undefined }));
    await settle();
    await React.act(async () => client.resolve({ ...first, status: 'APPROVED', submit: { hash } }));
    await settle();
    check('the signed step stays in the same view, said signed and sent', () => {
      assert.match(view.container.textContent, /Add USDC to your wallet/);
      assert.match(view.container.textContent, /Signed and sent/);
    });
    check('its hash is not on screen', () => assert.doesNotMatch(view.container.textContent, new RegExp(hash)));
    await React.act(async () => client.arrive({ ...request, id: 'step-2' }));
    await settle();
    const row = [...view.container.querySelectorAll('.pollar-cosign-step-head')].find((b) =>
      /Add USDC to your wallet/.test(b.textContent),
    );
    check('the next request shows under a row for the step already signed', () => {
      assert.ok(row, 'no row for the signed step');
      assert.match(row.textContent, /Signed/);
    });
    await React.act(async () => row?.click());
    check("opening the row shows that step's hash", () => assert.match(view.container.textContent, new RegExp(hash)));
    await view.unmount();
  }

  // ── 4. A device that is not enrolled ────────────────────────────
  // Another origin or install of the same user: its key is not among the
  // wallet's devices, so it is told to add itself and Approve stays off.
  const notEnrolled = { ok: false, code: 'DEVICE_NOT_ENROLLED', reason: 'not enrolled', deviceRegistered: false };
  console.log('\n── 4. web, device not enrolled ───────────────────────────');
  {
    const client = fakeClient({ quorum: notEnrolled });
    let closed = 0;
    let recoveryOpened = 0;
    const context = {
      getClient: () => client,
      isAuthenticated: true,
      styles: {},
      openRecoveryModal: () => recoveryOpened++,
    };
    const { CosignModal } = loader({
      '../../context': { usePollar: () => context },
      './context': { usePollar: () => context },
      '../commons': { CopyButton: () => null, cropAddress: (s) => s, PollarModalFooter: () => null },
    })('packages/react/src/components/cosign-modal/CosignModal.tsx');
    await React.act(async () => client.arrive(request));
    const view = await mount(React.createElement(CosignModal, { onClose: () => closed++ }));
    await settle();
    const buttons = () => [...view.container.querySelectorAll('button')];
    check('it says the device is not linked', () => assert.match(view.container.textContent, /isn't linked to your wallet/));
    check('it does not claim the request is verified', () => assert.doesNotMatch(view.container.textContent, /Checked/));
    const approve = buttons().find((b) => b.textContent.trim() === 'Approve');
    check('Approve is disabled', () => assert.ok(approve && approve.disabled, 'Approve missing or enabled'));
    const toggle = buttons().find((b) => b.textContent.trim() === 'Show details');
    await React.act(async () => toggle?.click());
    const reject = buttons().find((b) => b.textContent.trim() === 'Reject this request');
    check('Reject stays available in the details', () => assert.ok(reject && !reject.disabled, 'Reject missing or disabled'));
    await React.act(async () => view.container.querySelector('.pollar-overlay')?.click());
    check('a click outside does not close it', () => assert.equal(closed, 0));
    await React.act(async () => view.container.querySelector('button[aria-label="Close"]')?.click());
    check('the X asks before leaving the request unsigned', () => {
      assert.match(view.container.textContent, /Close without signing\?/);
      assert.equal(closed, 0);
    });
    await React.act(async () =>
      buttons()
        .find((b) => b.textContent.trim() === 'Go back and sign')
        ?.click(),
    );
    check('going back shows the request again', () => assert.match(view.container.textContent, /isn't linked to your wallet/));
    const link = buttons().find((b) => b.textContent.trim() === 'Link this device');
    await React.act(async () => link?.click());
    check('Link this device opens recovery and closes the prompt', () => {
      assert.equal(recoveryOpened, 1);
      assert.equal(closed, 1);
    });
    await view.unmount();
  }
  console.log('\n── 4. react-native, device not enrolled ──────────────────');
  {
    const client = fakeClient({ quorum: notEnrolled });
    const context = {
      getClient: () => client,
      styles: {},
      cosign: client.getCosignState(),
      openRecoveryModal: () => undefined,
    };
    const { CosignModal } = loader({
      'react-native': reactNative,
      'react-native-svg': reactNativeSvg,
      '../../context': { usePollar: () => context },
      './context': { usePollar: () => context },
      '../commons': { PollarOverlay: passthrough, PollarModalFooter: () => null },
    })('packages/react-native/src/components/cosign-modal/CosignModal.tsx');
    await React.act(async () => client.arrive(request));
    context.cosign = client.getCosignState();
    const view = await mount(React.createElement(CosignModal, { onClose: () => undefined }));
    await settle();
    check('it says the device is not linked', () => assert.match(view.container.textContent, /isn't linked to your wallet/));
    check('it does not claim the request is verified', () => assert.doesNotMatch(view.container.textContent, /Checked/));
    const approve = [...view.container.querySelectorAll('button')].find((b) => /Approve/.test(b.textContent));
    check('Approve is disabled', () => assert.ok(approve && approve.disabled, 'Approve missing or enabled'));
    check('it offers to link the device', () => assert.match(view.container.textContent, /Link this device/));
    await view.unmount();
  }

  // ── 5. Recovery: asking another device ──────────────────────────
  // The approval happens on the other device; the modal must notice it on its
  // own instead of telling the user this device is still not part of the wallet.
  console.log('\n── 5. web RecoveryModal, waiting for another device ──────');
  {
    const THIS_KEY = '03' + 'cd'.repeat(32);
    const OTHER_KEY = '02' + 'ab'.repeat(32);
    const device = (id, publicKey) => ({
      id,
      publicKey,
      tkApiKeyId: `tk-${id}`,
      label: id,
      enrolledVia: 'ONBOARDING',
      lastSeenAt: null,
      createdAt: '',
    });
    let approved = false;
    let enrollmentRequests = 0;
    let deviceReads = 0;
    const client = {
      onAuthStateChange: () => () => undefined,
      cosign: {
        publicKeyHex: async () => THIS_KEY,
        devices: async () => {
          deviceReads++;
          return {
            subOrgId: 'sub-1',
            endUserId: 'tk-user',
            custody: 'COSIGNED',
            quorumState: 'VERIFIED',
            devices: approved ? [device('d0', OTHER_KEY), device('d1', THIS_KEY)] : [device('d0', OTHER_KEY)],
            enrollments: [],
          };
        },
        recovery: {
          passkeyAvailable: false,
          status: async () => ({
            required: true,
            configured: true,
            subOrgId: 'sub-1',
            endUserId: 'tk-user',
            walletId: 'w-1',
            authProxyConfigId: 'cfg',
            email: { address: null, verified: false },
            passkeys: [],
            devices: [{ apiKeyId: 'k0', name: 'phone', publicKey: OTHER_KEY, createdAt: '' }],
          }),
          requestDeviceEnrollment: async () => {
            enrollmentRequests++;
            return { id: 'e1', expiresAt: new Date(Date.now() + 900_000).toISOString() };
          },
        },
      },
    };
    const context = { getClient: () => client, styles: {}, refreshRecovery: () => undefined, appConfig: {} };
    const { RecoveryModal } = loader({
      '../../context': { usePollar: () => context },
      './context': { usePollar: () => context },
      '../commons': { PollarModalFooter: () => null },
    })('packages/react/src/components/recovery-modal/RecoveryModal.tsx');
    const view = await mount(React.createElement(RecoveryModal, { onClose: () => undefined }));
    await settle();
    check('a device that is not part of the wallet is told so', () =>
      assert.match(view.container.textContent, /isn't part of your wallet yet/),
    );
    const ask = [...view.container.querySelectorAll('button')].find((b) => /Ask another device/.test(b.textContent));
    await React.act(async () => ask?.click());
    await settle();
    check('asking sends one enrollment request', () => assert.equal(enrollmentRequests, 1));
    check('it says the request was sent', () => assert.match(view.container.textContent, /Request sent/));
    const readsBeforeApproval = deviceReads;
    approved = true;
    await React.act(() => new Promise((resolve) => setTimeout(resolve, 3_300)));
    await settle();
    check('it reads the devices again while it waits', () => assert.ok(deviceReads > readsBeforeApproval));
    check('it notices the approval on its own', () => assert.match(view.container.textContent, /Device added/));
    check('it no longer says the device is not part of the wallet', () =>
      assert.doesNotMatch(view.container.textContent, /isn't part of your wallet yet/),
    );
    const readsAfterAdded = deviceReads;
    await React.act(() => new Promise((resolve) => setTimeout(resolve, 3_300)));
    check('it stops reading once the device is in', () => assert.equal(deviceReads, readsAfterAdded));
    await view.unmount();
  }

  console.log(`\n${passed} pass, ${failed} fail`);
  process.exit(failed ? 1 : 0);
})();
