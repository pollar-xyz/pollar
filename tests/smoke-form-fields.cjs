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

const code = { key: 'phone_country_code', type: 'text', validation: { pattern: '^[0-9]{1,4}$', maxLength: 4 } };
const amount = { key: 'amount', type: 'number', validation: { min: 1, max: 10 } };
const broken = { key: 'odd', type: 'text', validation: { pattern: '(?<' } };

for (const pkg of ['packages/react', 'packages/react-native']) {
  const { localFieldError, localFieldErrors, visibleFields } = load(
    `${pkg}/src/components/requirement-form-modal/form-fields.ts`,
  );
  assert.equal(localFieldError(code, '+591'), 'pattern', `${pkg}: the field's pattern is checked before sending`);
  assert.equal(localFieldError(code, '591'), null, `${pkg}: a matching value passes`);
  assert.equal(localFieldError(code, '59100'), 'too_long', `${pkg}: maxLength is checked`);
  assert.equal(localFieldError(code, '  '), null, `${pkg}: empty is left to the server's required`);
  assert.equal(localFieldError(amount, '11'), 'too_large', `${pkg}: number range is checked`);
  assert.equal(localFieldError(broken, 'x'), null, `${pkg}: a pattern the engine cannot compile is left to the server`);
  assert.deepEqual(
    JSON.parse(JSON.stringify(localFieldErrors([code, amount], { phone_country_code: '+591', amount: '5' }))),
    { phone_country_code: 'pattern' },
    `${pkg}: every field is checked at submit`,
  );

  const activity = { key: 'activity', type: 'select', options: [{ value: 'trade' }, { value: 'other' }] };
  const other = { key: 'activity_other', type: 'text', required: true, showIf: { key: 'activity', in: ['other'] } };
  const pep = { key: 'pep', type: 'checkbox' };
  const role = { key: 'pep_role', type: 'text', showIf: { key: 'pep', in: ['true'] } };
  const tags = { key: 'tags', type: 'multiselect', options: [{ value: 'a' }, { value: 'b' }] };
  const tagNote = { key: 'tag_note', type: 'text', showIf: { key: 'tags', in: ['b'] } };
  const nested = { key: 'other_detail', type: 'text', showIf: { key: 'activity_other', in: ['x'] } };
  const all = [activity, other, pep, role, tags, tagNote, nested];
  const keys = (values) => JSON.parse(JSON.stringify(visibleFields(all, values).map((field) => field.key)));
  assert.deepEqual(
    keys({ activity: 'trade', pep: false, tags: ['a'] }),
    ['activity', 'pep', 'tags'],
    `${pkg}: a field whose condition does not hold is hidden`,
  );
  assert.deepEqual(
    keys({ activity: 'other', activity_other: 'y', pep: true, tags: ['a', 'b'] }),
    ['activity', 'activity_other', 'pep', 'pep_role', 'tags', 'tag_note'],
    `${pkg}: select, checkbox and multiselect answers show their fields`,
  );
  assert.deepEqual(
    keys({ activity: 'trade', activity_other: 'x' }),
    ['activity', 'pep', 'tags'],
    `${pkg}: a field under a hidden field stays hidden`,
  );
}

console.log(
  "Form fields: the field's pattern, length and range are checked before sending, and showIf hides fields, in web and React Native",
);
