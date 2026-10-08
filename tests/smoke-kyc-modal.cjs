const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(relativePath, overrides = {}) {
  const filename = path.resolve(relativePath);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // tsup defines the version at build time; the footer reads it.
  const scope = { exports: {}, setTimeout, clearTimeout, globalThis, __POLLAR_VERSION__: 'test' };
  // Theme is a .ts utility rather than a React component.
  scope.require = (id) => {
    if (id in overrides) return overrides[id];
    if (id.endsWith('.css')) return {};
    if (!id.startsWith('.')) return require(id);
    const base = path.resolve(path.dirname(filename), id);
    return load(fs.existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`, overrides);
  };
  vm.runInNewContext(output, scope);
  return scope.exports;
}

const { KycModalTemplate } = load('packages/react/src/components/kyc-modal/KycModalTemplate.tsx');
const props = {
  theme: 'light',
  accentColor: '#0060b8',
  providers: [],
  selectedProvider: { id: 'didit-test', name: 'Didit', flow: 'iframe' },
  session: { kycUrl: 'https://verification.example/session' },
  kycStatus: 'pending',
  isLoading: false,
  onSelectProvider() {},
  onDoneVerifying() {},
  onStartAgain() {},
  onRefresh() {},
  onClose() {},
};
const render = (changes) => renderToStaticMarkup(React.createElement(KycModalTemplate, { ...props, ...changes }));
const verifying = render({ step: 'verifying' });
assert.match(verifying, /pollar-kyc-modal--verifying/);
assert.match(verifying, /Check status/);
assert.match(verifying, /Open in new tab/);
assert.match(verifying, /allow="camera; microphone"/);
assert.match(render({ step: 'done' }), /still being reviewed/);
assert.doesNotMatch(render({ step: 'done' }), /not approved/);
assert.match(render({ step: 'done', reviewReason: 'DUPLICATE_DOCUMENT' }), /already linked to another account/);
assert.match(render({ step: 'done', kycStatus: 'expired' }), /Start again/);
assert.doesNotMatch(render({ step: 'done', kycStatus: 'expired' }), /Check again/);
assert.match(render({ step: 'done', kycStatus: 'approved' }), /verified successfully/);
assert.match(render({ step: 'verifying', error: 'Try again shortly' }), /role="alert"/);
assert.doesNotMatch(
  render({ step: 'verifying', selectedProvider: { ...props.selectedProvider, flow: 'redirect' } }),
  /<iframe/,
);
console.log('KYC modal: embed, redirect, pending, review, expired, approved and retryable errors passed');

// Exercise the real modal's hooks against a mocked client; stub only the presentation.
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.invalid/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// Node 20, the CI runtime, has no global navigator; react-dom reads it on load.
globalThis.navigator = dom.window.navigator;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');
const core = require('../packages/core/dist/index.js');
let view;
let client;
const pollarContext = { getClient: () => client, styles: {} };
const { KycModal } = load('packages/react/src/components/kyc-modal/KycModal.tsx', {
  '@pollar/core': core,
  // The provider memoizes getClient; a fresh function per render would reload the list forever.
  '../../context': { usePollar: () => pollarContext },
  './KycModalTemplate': {
    KycModalTemplate: (p) => {
      view = p;
      return null;
    },
  },
  '../modal-theme': { modalChrome: () => ({}) },
});
const option = { id: 'option-a', name: 'Didit', flow: 'iframe' }; // no `levels`: must not crash
const apiError = (code) => new core.PollarApiError(code, { code });

async function mount(extra, mockClient) {
  client = mockClient;
  const container = document.createElement('div');
  const root = createRoot(container);
  await React.act(async () => root.render(React.createElement(KycModal, { onClose() {}, country: 'BO', ...extra })));
  return () => React.act(async () => root.unmount());
}

(async () => {
  // The gate's option opens directly, with a stable idempotency key across retries.
  const starts = [];
  let failNext = 'SDK_KYC_PROVIDER_ERROR';
  let unmount = await mount(
    { providerId: 'option-a', corridorId: 'corridor-a' },
    {
      getKycProviders: async () => ({ providers: [option] }),
      resolveKyc: async (...args) => {
        starts.push(args);
        if (failNext) {
          const code = failNext;
          failNext = null;
          throw apiError(code);
        }
        return { alreadyApproved: false, sessionId: 's', kycUrl: 'https://kyc.example' };
      },
    },
  );
  assert.equal(starts.length, 1);
  assert.equal(starts[0][0], 'option-a');
  assert.equal(starts[0][1], 'basic');
  assert.equal(starts[0][3], 'corridor-a');
  assert.match(view.error, /not responding/);
  assert.equal(view.step, 'select_provider');
  await React.act(async () => view.onSelectProvider(option));
  assert.equal(starts[1][4], starts[0][4]);
  assert.equal(view.step, 'verifying');
  await unmount();

  // An expired session drops the key so the next start opens a fresh one.
  starts.length = 0;
  failNext = 'SDK_KYC_SESSION_EXPIRED';
  unmount = await mount(
    { providerId: 'option-a' },
    {
      getKycProviders: async () => ({ providers: [option] }),
      resolveKyc: async (...args) => {
        starts.push(args);
        if (failNext) {
          const code = failNext;
          failNext = null;
          throw apiError(code);
        }
        return { alreadyApproved: false, sessionId: 's', kycUrl: 'https://kyc.example' };
      },
    },
  );
  assert.match(view.error, /expired/);
  await React.act(async () => view.onSelectProvider(option));
  assert.notEqual(starts[1][4], starts[0][4]);
  await unmount();

  // Already approved on start counts as approved.
  let approved = 0;
  unmount = await mount(
    { providerId: 'option-a', onApproved: () => approved++ },
    {
      getKycProviders: async () => ({ providers: [option] }),
      resolveKyc: async () => {
        throw apiError('SDK_KYC_ALREADY_APPROVED');
      },
    },
  );
  assert.equal(view.step, 'done');
  assert.equal(view.kycStatus, 'approved');
  assert.equal(approved, 1);
  await unmount();

  // Not configured is said, not swallowed.
  unmount = await mount(
    {},
    {
      getKycProviders: async () => {
        throw apiError('SDK_KYC_NOT_CONFIGURED');
      },
    },
  );
  assert.match(view.error, /not available for this app/);
  await unmount();

  // Polling: manual review shows the review result; expired offers a fresh start.
  for (const [read, status, reason] of [
    [
      { status: 'pending', decisionStatus: 'manual_review', reviewReason: 'DUPLICATE_DOCUMENT' },
      'pending',
      'DUPLICATE_DOCUMENT',
    ],
    [{ status: 'none', decisionStatus: 'expired' }, 'expired', null],
    [{ status: 'rejected', decisionStatus: 'rejected' }, 'rejected', null],
  ]) {
    unmount = await mount(
      { providerId: 'option-a', corridorId: 'corridor-a' },
      {
        getKycProviders: async () => ({ providers: [option] }),
        resolveKyc: async () => ({ alreadyApproved: false, sessionId: 's', kycUrl: 'https://kyc.example' }),
        pollKycDecision: async (_id, opts) => {
          assert.equal(opts.corridorId, 'corridor-a');
          return read;
        },
      },
    );
    await React.act(async () => view.onDoneVerifying());
    assert.equal(view.step, 'done');
    assert.equal(view.kycStatus, status);
    assert.equal(view.reviewReason, reason);
    await unmount();
  }

  // A transport failure while polling stays retryable.
  unmount = await mount(
    { providerId: 'option-a' },
    {
      getKycProviders: async () => ({ providers: [option] }),
      resolveKyc: async () => ({ alreadyApproved: false, sessionId: 's', kycUrl: 'https://kyc.example' }),
      pollKycDecision: async () => {
        throw new TypeError('fetch failed');
      },
    },
  );
  await React.act(async () => view.onDoneVerifying());
  assert.equal(view.step, 'verifying');
  assert.match(view.error, /does not mean your verification was rejected/);
  await unmount();

  console.log('KYC modal: gate option opens directly, codes surface, keys reuse/rotate, review and expiry settle');
  dom.window.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
