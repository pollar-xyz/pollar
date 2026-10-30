// Reading an sdk-api error envelope field by field. Pure.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiErrorFields, isRecord, stringField } from '../src/api/error-fields';

test('the string fields of an error envelope are read, the rest ignored', () => {
  assert.deepEqual(
    apiErrorFields({ success: false, code: 'TX_SUBMIT_FAILED', message: 'fee too high', details: 7, resultCode: 'tx_failed' }),
    { code: 'TX_SUBMIT_FAILED', message: 'fee too high', resultCode: 'tx_failed' },
  );
  assert.deepEqual(apiErrorFields({ error: 'LEGACY_CODE' }), { error: 'LEGACY_CODE' });
});

test('anything that is not an object reads as no fields', () => {
  for (const value of [undefined, null, 'TX_SUBMIT_FAILED', 42, true]) {
    assert.deepEqual(apiErrorFields(value), {});
    assert.equal(stringField(value, 'code'), undefined);
    assert.equal(isRecord(value), false);
  }
});

test('a nested field is read through its parent', () => {
  const body = { verification: { reason: 'payload mismatch' } };
  assert.equal(stringField(body.verification, 'reason'), 'payload mismatch');
  assert.equal(stringField(body, 'verification'), undefined);
});
