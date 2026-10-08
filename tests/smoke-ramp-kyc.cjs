const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Internal UI helpers: transpile without exporting them as public SDK surface.
function loadHelper(relative) {
  const source = fs.readFileSync(path.join(__dirname, '../packages/react/src/components', relative), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const scope = {
    exports: {},
    require: (id) => {
      if (id === '../kyc-modal/kyc-messages') return loadHelper('kyc-modal/kyc-messages.ts');
      throw new Error(`Unexpected import: ${id}`);
    },
  };
  vm.runInNewContext(output, scope);
  return scope.exports;
}
const rampKyc = loadHelper('ramp-widget/ramp-kyc.ts');
const { requiredRampKyc, lockedRouteCopy } = rampKyc;
const error = {
  code: 'SDK_RAMPS_KYC_REQUIRED',
  body: { rampProviderId: 'ramp-a', kycProviderId: 'option-a', corridorId: 'corridor-a' },
};
// The KYC-only body (v1) names the option as kycProviderId.
// Spread: the helper runs in its own vm realm, so its objects have another Object prototype.
assert.deepEqual(
  { ...requiredRampKyc(error) },
  { rampProviderId: 'ramp-a', corridorId: 'corridor-a', type: 'KYC', optionId: 'option-a' },
);
// v2 names the pending step and its option; a KYC step still carries kycProviderId for older readers.
const v2 = (requirementType, optionId) => ({
  code: 'SDK_RAMPS_KYC_REQUIRED',
  body: {
    rampProviderId: 'ramp-a',
    corridorId: 'corridor-a',
    requirementType,
    optionId,
    ...(requirementType === 'KYC' ? { kycProviderId: optionId } : {}),
  },
});
for (const type of ['KYC', 'FORM', 'REGISTRY_CHECK', 'PROVIDER_REGISTRATION']) {
  assert.deepEqual(
    { ...requiredRampKyc(v2(type, `${type}-id`)) },
    {
      rampProviderId: 'ramp-a',
      corridorId: 'corridor-a',
      type,
      optionId: `${type}-id`,
    },
  );
}
for (const invalid of [
  null,
  new Error('SDK_RAMPS_KYC_REQUIRED'),
  { ...error, code: 'SDK_RAMPS_PROVIDER_NOT_CONFIGURED' },
  { ...error, code: 'SDK_RAMPS_ANCHOR_ERROR' },
  { ...error, body: undefined },
  { ...error, body: { rampProviderId: 'ramp-a' } },
  { ...error, body: { rampProviderId: '', kycProviderId: 'option-a' } },
  { ...error, body: { rampProviderId: 'ramp-a', kycProviderId: 42 } },
  { ...error, body: { rampProviderId: 'ramp-a', corridorId: 'corridor-a', requirementType: 'FORM' } },
]) {
  assert.equal(requiredRampKyc(invalid), null);
}
console.log('Ramp KYC gate accepts only explicit scoped backend requirements');

assert.deepEqual(
  { ...lockedRouteCopy({ status: 'none' }) },
  { message: 'Verify your identity to see this route', action: 'Verify' },
);
assert.deepEqual(
  { ...lockedRouteCopy({ status: 'expired' }) },
  { message: 'Your verification expired', action: 'Verify again' },
);
assert.deepEqual({ ...lockedRouteCopy({ status: 'pending' }) }, { message: 'Verification in progress', action: 'Continue' });
assert.deepEqual(
  { ...lockedRouteCopy({ status: 'pending', reviewReason: 'MANUAL' }) },
  { message: 'Your verification is under review', action: null },
);
assert.match(
  lockedRouteCopy({ status: 'pending', reviewReason: 'DUPLICATE_DOCUMENT' }).message,
  /already linked to another account/,
);
assert.equal(lockedRouteCopy({ status: 'pending', reviewReason: 'DUPLICATE_DOCUMENT' }).action, null);
assert.deepEqual({ ...lockedRouteCopy({ status: 'rejected' }) }, { message: 'Verification was not approved', action: null });
assert.equal(lockedRouteCopy({ type: 'FORM', status: 'none' }).action, 'Continue');
assert.equal(lockedRouteCopy({ type: 'PROVIDER_REGISTRATION', status: 'none' }).action, 'Continue');
assert.equal(lockedRouteCopy({ type: 'REGISTRY_CHECK', status: 'none' }).action, 'Confirm');
// A registry check SEGIP did not confirm waits for a person: nothing to press.
assert.deepEqual(
  { ...lockedRouteCopy({ type: 'REGISTRY_CHECK', status: 'pending', reviewReason: 'REGISTRY_MISMATCH' }) },
  { message: 'Your details are under review', action: null },
);
console.log('Locked routes offer a button only when the user can act on the step');

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
let stepProps; // the FORM / REGISTRY_CHECK / PROVIDER_REGISTRATION modal the widget opened
let client;
const widgetSource = fs.readFileSync(
  path.join(__dirname, '../packages/react/src/components/ramp-widget/RampWidget.tsx'),
  'utf8',
);
const widgetOutput = ts.transpileModule(widgetSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const widgetScope = {
  exports: {},
  setInterval,
  clearInterval,
  require: (id) => {
    if (id.startsWith('react')) return require(id);
    if (id === '../../context')
      return {
        usePollar: () => ({
          getClient: () => client,
          styles: {},
          network: 'testnet',
          wallet: { address: 'wallet' },
          signTx: () => {
            throw new Error('must not sign before approval');
          },
        }),
      };
    if (id === './RampWidgetTemplate')
      return {
        RampWidgetTemplate: (props) => {
          rampProps = props;
          kycProps = null;
          stepProps = null;
          return null;
        },
      };
    if (id === '../kyc-modal/KycModal')
      return {
        KycModal: (props) => {
          kycProps = props;
          return null;
        },
      };
    const stepModal = (name) => ({
      [name]: (props) => {
        stepProps = { name, ...props };
        return null;
      },
    });
    if (id === '../requirement-form-modal/RequirementFormModal') return stepModal('RequirementFormModal');
    if (id === '../registry-check-modal/RegistryCheckModal') return stepModal('RegistryCheckModal');
    if (id === '../provider-registration-modal/ProviderRegistrationModal') return stepModal('ProviderRegistrationModal');
    if (id === '../modal-theme') return { modalChrome: () => ({}) };
    if (id === './ramp-kyc') return rampKyc;
    if (id.endsWith('.css')) return {};
    throw new Error(`Unexpected import: ${id}`);
  },
};
vm.runInNewContext(widgetOutput, widgetScope);

async function exercise(direction, outcome) {
  let attempts = 0;
  let quoteCalls = 0;
  const bodies = [];
  const quote = { quoteId: 'first-quote', provider: 'Test ramp' };
  const fresh = { quoteId: 'fresh-quote', provider: 'Test ramp' };
  async function start(body) {
    attempts++;
    bodies.push(body);
    if (attempts === 1) throw error;
    return { txId: 'tx', provider: 'Test ramp', status: 'completed' };
  }
  client = {
    getRampCountries: async () => ({ countries: [{ code: 'BO', currency: 'BOB' }] }),
    getRampsQuote: async () => {
      quoteCalls++;
      if (quoteCalls === 1) return { quotes: [quote] };
      if (outcome === 'requote-fails') throw { code: 'SDK_RAMPS_ANCHOR_ERROR' };
      if (outcome === 'requote-empty') return { quotes: [] };
      return { quotes: [fresh] };
    },
    createOnRamp: start,
    createOffRamp: start,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => root.render(React.createElement(widgetScope.exports.RampWidget, { onClose() {} })));
  await React.act(async () => {
    rampProps.onAmountChange('10');
    rampProps.onDirectionChange(direction);
  });
  await React.act(async () => rampProps.onFindRoute());
  await React.act(async () => rampProps.onSelectQuote(quote));
  assert.equal(attempts, 1);
  assert.equal(kycProps.corridorId, 'corridor-a');
  assert.equal(kycProps.providerId, 'option-a'); // the gate's option opens directly
  assert.equal(kycProps.country, 'BO');
  const approve = kycProps.onApproved;
  if (outcome === 'cancel') {
    await React.act(async () => kycProps.onClose());
    await React.act(async () => approve()); // A late poll after cancellation must not transact or re-quote.
    assert.equal(attempts, 1);
    assert.equal(quoteCalls, 1);
    assert.equal(rampProps.amount, '10');
    assert.equal(rampProps.direction, direction);
    assert.equal(rampProps.step, 'select_route');
  } else {
    await React.act(async () => {
      approve();
      approve();
    }); // Duplicate notifications re-quote once only.
    assert.equal(kycProps, null);
    assert.equal(quoteCalls, 2);
    assert.equal(attempts, 1); // Approval never starts an order by itself.
    if (outcome === 'approve') {
      assert.equal(rampProps.step, 'select_route');
      assert.deepEqual(rampProps.quotes, [fresh]);
      assert.match(rampProps.noticeMsg, /verified/);
      assert.equal(rampProps.amount, '10');
      assert.equal(rampProps.direction, direction);
      await React.act(async () => rampProps.onSelectQuote(fresh));
      assert.equal(attempts, 2);
      assert.equal(bodies[1].quoteId, 'fresh-quote');
      assert.equal(bodies[1].amount, 10);
      assert.equal(rampProps.step, 'status');
    } else {
      assert.equal(rampProps.step, 'error');
    }
  }
  await React.act(async () => root.unmount());
  container.remove();
}

// Quote-time gate: the backend leaves a route with a pending step out of `quotes` and
// names the step in `requirementsRequired`.
async function exerciseLockedRoute(direction) {
  let quoteCalls = 0;
  let attempts = 0;
  const locked = {
    provider: 'Locked ramp',
    rampProviderId: 'ramp-b',
    corridorId: 'corridor-b',
    position: 1,
    completed: 0,
    total: 1,
    type: 'KYC',
    optionId: 'option-b',
    status: 'none',
  };
  const unlocked = { quoteId: 'unlocked-quote', provider: 'Locked ramp' };
  client = {
    getRampCountries: async () => ({ countries: [{ code: 'BO', currency: 'BOB' }] }),
    getRampsQuote: async () => {
      quoteCalls++;
      return quoteCalls === 1
        ? { quotes: [], requirementsRequired: [locked] }
        : { quotes: [unlocked], requirementsRequired: [] };
    },
    createOnRamp: async () => {
      attempts++;
      return { txId: 'tx', provider: 'Locked ramp', status: 'completed' };
    },
    createOffRamp: async () => {
      attempts++;
      return { txId: 'tx', provider: 'Locked ramp', status: 'completed' };
    },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => root.render(React.createElement(widgetScope.exports.RampWidget, { onClose() {} })));
  await React.act(async () => {
    rampProps.onAmountChange('10');
    rampProps.onDirectionChange(direction);
  });
  await React.act(async () => rampProps.onFindRoute());
  // Empty quotes with a locked route is a route list, not "no providers".
  assert.equal(rampProps.step, 'select_route');
  assert.equal(rampProps.errorMsg, null);
  assert.deepEqual(rampProps.quotes, []);
  assert.deepEqual(rampProps.kycRequired, [locked]);
  await React.act(async () => rampProps.onVerifyRoute(locked));
  assert.equal(kycProps.providerId, 'option-b');
  assert.equal(kycProps.corridorId, 'corridor-b');
  assert.equal(kycProps.country, 'BO');
  const approve = kycProps.onApproved;
  await React.act(async () => {
    approve();
    approve();
  });
  assert.equal(kycProps, null);
  assert.equal(quoteCalls, 2); // approval re-quotes the same input once
  assert.equal(attempts, 0);
  assert.equal(rampProps.step, 'select_route');
  assert.deepEqual(rampProps.quotes, [unlocked]);
  assert.deepEqual(rampProps.kycRequired, []);
  assert.equal(rampProps.amount, '10');
  assert.equal(rampProps.direction, direction);
  assert.match(rampProps.noticeMsg, /verified/);
  await React.act(async () => root.unmount());
  container.remove();
}

// The other step types open their own modal with the id that step needs: the form
// (optionId), the registry option (optionId) or the route (corridorId); completing
// the step re-quotes once, cancelling keeps the input.
async function exerciseStepRoute(type, outcome) {
  let quoteCalls = 0;
  const locked = {
    provider: 'Step ramp',
    rampProviderId: 'ramp-c',
    corridorId: 'corridor-c',
    position: 2,
    completed: 1,
    total: 3,
    type,
    optionId: `${type}-id`,
    status: 'none',
  };
  const unlocked = { quoteId: 'step-quote', provider: 'Step ramp' };
  client = {
    getRampCountries: async () => ({ countries: [{ code: 'BO', currency: 'BOB' }] }),
    getRampsQuote: async () => {
      quoteCalls++;
      return quoteCalls === 1
        ? { quotes: [], requirementsRequired: [locked] }
        : { quotes: [unlocked], requirementsRequired: [] };
    },
    createOnRamp: async () => {
      throw new Error('must not start before the step is complete');
    },
    createOffRamp: async () => {
      throw new Error('must not start before the step is complete');
    },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => root.render(React.createElement(widgetScope.exports.RampWidget, { onClose() {} })));
  await React.act(async () => {
    rampProps.onAmountChange('10');
    rampProps.onDirectionChange('onramp');
  });
  await React.act(async () => rampProps.onFindRoute());
  assert.deepEqual(rampProps.kycRequired, [locked]);
  await React.act(async () => rampProps.onVerifyRoute(locked));
  assert.equal(kycProps, null); // not the KYC modal
  const expected = {
    FORM: { name: 'RequirementFormModal', id: { formId: 'FORM-id' }, done: 'onSubmitted' },
    REGISTRY_CHECK: { name: 'RegistryCheckModal', id: { optionId: 'REGISTRY_CHECK-id' }, done: 'onApproved' },
    PROVIDER_REGISTRATION: { name: 'ProviderRegistrationModal', id: { corridorId: 'corridor-c' }, done: 'onRegistered' },
  }[type];
  assert.equal(stepProps.name, expected.name);
  for (const [key, value] of Object.entries(expected.id)) assert.equal(stepProps[key], value);
  assert.deepEqual({ ...stepProps.progress }, { position: 2, total: 3 });
  if (outcome === 'cancel') {
    await React.act(async () => stepProps.onClose());
    assert.equal(quoteCalls, 1);
    assert.equal(rampProps.amount, '10');
    assert.equal(rampProps.step, 'select_route');
  } else {
    const done = stepProps[expected.done];
    await React.act(async () => {
      done();
      done();
    }); // Duplicate notifications re-quote once only.
    assert.equal(stepProps, null);
    assert.equal(quoteCalls, 2);
    assert.equal(rampProps.step, 'select_route');
    assert.deepEqual(rampProps.quotes, [unlocked]);
    assert.match(rampProps.noticeMsg, /details are saved/);
  }
  await React.act(async () => root.unmount());
  container.remove();
}

(async () => {
  for (const direction of ['onramp', 'offramp']) {
    for (const outcome of ['cancel', 'approve', 'requote-fails', 'requote-empty']) await exercise(direction, outcome);
  }
  console.log(
    'Buy/Sell open the gate option; cancel preserves input; approval re-quotes once and waits for the user to choose',
  );
  for (const direction of ['onramp', 'offramp']) await exerciseLockedRoute(direction);
  console.log('A route locked by KYC shows instead of "no providers"; Verify opens its option and approval re-quotes');
  for (const type of ['FORM', 'REGISTRY_CHECK', 'PROVIDER_REGISTRATION']) {
    for (const outcome of ['cancel', 'done']) await exerciseStepRoute(type, outcome);
  }
  console.log('Form, registry and registration steps open their own modal with the right id and re-quote once when done');
  dom.window.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
