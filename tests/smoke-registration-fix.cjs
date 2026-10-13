const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath) {
  const output = ts.transpileModule(fs.readFileSync(path.resolve(relativePath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scope = { exports: {}, require: () => ({}) };
  vm.runInNewContext(output, scope);
  return scope.exports;
}

for (const pkg of ['packages/react', 'packages/react-native']) {
  const { registrationFixOf, REGISTRATION_COPY } = load(`${pkg}/src/components/registry-check-modal/registry-copy.ts`);
  const error = {
    code: 'KYC_REGISTRATION_MISSING_DATA',
    body: {
      missing: ['occupation', 'annual_salary'],
      invalid: ['annual_salary'],
      forms: [{ formId: 'profile', keys: ['occupation', 'annual_salary'] }, { formId: 7 }],
    },
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(registrationFixOf(error))),
    { invalid: ['annual_salary'], forms: [{ formId: 'profile', keys: ['occupation', 'annual_salary'] }] },
    `${pkg}: reads the answered keys and the forms, dropping a malformed entry`,
  );
  // An older server sends only `missing`: nothing to reopen, nothing marked invalid.
  assert.deepEqual(JSON.parse(JSON.stringify(registrationFixOf({ body: { missing: ['email'] } }))), { invalid: [], forms: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(registrationFixOf(null))), { invalid: [], forms: [] });
  for (const lang of ['en', 'es']) {
    assert.ok(REGISTRATION_COPY[lang].invalid.includes('{fields}'), `${pkg}: ${lang} invalid copy names the fields`);
    assert.ok(REGISTRATION_COPY[lang].fix, `${pkg}: ${lang} fix copy`);
  }
}

console.log('smoke-registration-fix: ok');
