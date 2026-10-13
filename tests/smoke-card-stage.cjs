const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath) {
  const output = ts.transpileModule(fs.readFileSync(path.resolve(relativePath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scope = { exports: {}, require };
  vm.runInNewContext(output, scope);
  return scope.exports;
}

const step = (type, completed = false) => ({ position: 1, type, optionIds: [], completed });
const next = { type: 'KYC', optionId: 'option-1', status: 'none', position: 1, completed: 0, total: 3 };
const withRegistration = { steps: [step('KYC'), step('FORM'), step('PROVIDER_REGISTRATION')], next };
const registrationDone = {
  steps: [step('KYC', true), step('FORM', true), step('PROVIDER_REGISTRATION', true)],
  next: null,
};
const kycOnlyDone = { steps: [step('KYC', true)], next: null };

for (const file of ['packages/react', 'packages/react-native']) {
  const { cardStage } = load(`${file}/src/components/card-modal/card-kyc.ts`);
  const notStarted = { kycStatus: 'NOT_STARTED' };

  assert.equal(cardStage(undefined, withRegistration), null, `${file}: nothing while the holder loads`);
  // Requirements still loading must not read as "no steps": that showed the provider form for a moment.
  assert.equal(cardStage(notStarted, undefined), null, `${file}: nothing while the requirements load`);
  assert.equal(cardStage(null, undefined), null, `${file}: no holder, requirements loading`);
  assert.equal(cardStage(null, null), 'steps', `${file}: no holder starts with the steps`);
  assert.equal(cardStage(null, withRegistration), 'steps', `${file}: no holder, steps pending`);
  // A holder signed up before the app added steps still owes them, instead of seeing the provider form.
  assert.equal(cardStage(notStarted, withRegistration), 'steps', `${file}: holder with pending steps`);
  // With a registration step the platform owns the KYC: the provider form never shows, and a holder
  // still NOT_STARTED there (the KYC send failed) stays on the steps instead of a blank modal.
  assert.equal(cardStage(notStarted, registrationDone), 'steps', `${file}: registration owns the KYC`);
  assert.equal(cardStage(notStarted, kycOnlyDone), 'provider-form', `${file}: steps done, no registration`);
  assert.equal(cardStage(notStarted, null), 'provider-form', `${file}: no steps at all`);
  assert.equal(cardStage({ kycStatus: 'PENDING' }, withRegistration), null, `${file}: KYC already sent`);
  assert.equal(cardStage({ kycStatus: 'APPROVED' }, null), null, `${file}: approved`);
}

console.log('smoke-card-stage: ok');
