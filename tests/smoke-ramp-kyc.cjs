const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Internal UI helper: transpile without exporting it as public SDK surface.
const source = fs.readFileSync(path.join(__dirname, '../packages/react/src/components/ramp-widget/ramp-kyc.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const scope = { exports: {} };
vm.runInNewContext(output, scope);
const { requiredRampKyc } = scope.exports;
const error = { code: 'SDK_RAMPS_KYC_REQUIRED', body: { rampProviderId: 'ramp-a', kycProviderId: 'option-a', corridorId: 'corridor-a' } };
assert.equal(requiredRampKyc(error).rampProviderId, 'ramp-a');
assert.equal(requiredRampKyc(error).kycProviderId, 'option-a');
for (const invalid of [null, new Error('SDK_RAMPS_KYC_REQUIRED'),
  { ...error, code: 'SDK_RAMPS_PROVIDER_NOT_CONFIGURED' },
  { ...error, code: 'SDK_RAMPS_ANCHOR_ERROR' },
  { ...error, body: undefined }, { ...error, body: { rampProviderId: 'ramp-a' } },
  { ...error, body: { rampProviderId: '', kycProviderId: 'option-a' } },
  { ...error, body: { rampProviderId: 'ramp-a', kycProviderId: 42 } }]) {
  assert.equal(requiredRampKyc(invalid), null);
}
console.log('Ramp KYC gate accepts only explicit scoped backend requirements');

// Exercise the real widget's hooks; stub only its context and presentation.
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.invalid/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
let rampProps;
let kycProps;
let client;
const widgetSource = fs.readFileSync(path.join(__dirname, '../packages/react/src/components/ramp-widget/RampWidget.tsx'), 'utf8');
const widgetOutput = ts.transpileModule(widgetSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const widgetScope = { exports: {}, setInterval, clearInterval, require: (id) => {
  if (id.startsWith('react')) return require(id);
  if (id === '../../context') return { usePollar: () => ({ getClient: () => client, styles: {}, network: 'testnet', wallet: { address: 'wallet' }, signTx: () => { throw new Error('must not sign before approval'); } }) };
  if (id === './RampWidgetTemplate') return { RampWidgetTemplate: (props) => { rampProps = props; kycProps = null; return null; } };
  if (id === '../kyc-modal/KycModal') return { KycModal: (props) => { kycProps = props; return null; } };
  if (id === '../modal-theme') return { modalChrome: () => ({}) };
  if (id === './ramp-kyc') return { requiredRampKyc };
  if (id.endsWith('.css')) return {};
  throw new Error(`Unexpected import: ${id}`);
} };
vm.runInNewContext(widgetOutput, widgetScope);

async function exercise(direction, outcome) {
  let attempts = 0;
  const bodies = [];
  const quote = { quoteId: 'same-quote', provider: 'Test ramp' };
  async function start(body) {
    attempts++;
    bodies.push(body);
    if (attempts === 1 || outcome === 'repeat-gate') throw error;
    if (outcome === 'expired') throw { code: 'SDK_RAMPS_QUOTE_EXPIRED' };
    return { txId: 'tx', provider: 'Test ramp', status: 'completed' };
  }
  client = {
    getRampCountries: async () => ({ countries: [{ code: 'BO', currency: 'BOB' }] }),
    getRampsQuote: async () => ({ quotes: [quote] }),
    createOnRamp: start, createOffRamp: start,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => root.render(React.createElement(widgetScope.exports.RampWidget, { onClose() {} })));
  await React.act(async () => { rampProps.onAmountChange('10'); rampProps.onDirectionChange(direction); });
  await React.act(async () => rampProps.onFindRoute());
  await React.act(async () => rampProps.onSelectQuote(quote));
  assert.equal(attempts, 1);
  assert.equal(kycProps.corridorId, 'corridor-a');
  assert.equal(kycProps.country, 'BO');
  const approve = kycProps.onApproved;
  if (outcome === 'cancel') {
    await React.act(async () => kycProps.onClose());
    await React.act(async () => approve()); // A late poll after cancellation must not transact.
    assert.equal(attempts, 1);
    assert.equal(rampProps.amount, '10');
    assert.equal(rampProps.direction, direction);
    assert.equal(rampProps.step, 'select_route');
  } else {
    await React.act(async () => { approve(); approve(); }); // Duplicate notifications retry once only.
    assert.equal(attempts, 2);
    assert.equal(bodies[1].quoteId, bodies[0].quoteId);
    assert.equal(bodies[1].amount, 10);
    assert.equal(kycProps, null);
    assert.equal(rampProps.step, outcome === 'approve' ? 'status' : 'error');
  }
  await React.act(async () => root.unmount());
  container.remove();
}

(async () => {
  for (const direction of ['onramp', 'offramp']) {
    for (const outcome of ['cancel', 'approve', 'repeat-gate', 'expired']) await exercise(direction, outcome);
  }
  console.log('Buy/Sell open KYC; cancel preserves input; approval retries once; repeated gates and expired quotes stop safely');
  dom.window.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
