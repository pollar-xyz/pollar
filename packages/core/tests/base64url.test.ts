// Base64 padding is stripped by index, so input from outside stays linear.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base64urlDecode, base64urlEncode, stripBase64Padding } from '../src/lib/base64url';
import { base64ToBytes } from '../src/cosign/stellar-hash';

test('stripBase64Padding removes only the trailing "="', () => {
  assert.equal(stripBase64Padding('YWJj'), 'YWJj');
  assert.equal(stripBase64Padding('YWI='), 'YWI');
  assert.equal(stripBase64Padding('YQ=='), 'YQ');
  assert.equal(stripBase64Padding('===='), '');
  assert.equal(stripBase64Padding('a=b='), 'a=b');
  assert.equal(stripBase64Padding(''), '');
});

test('decoding with and without padding gives the same bytes', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
  const encoded = base64urlEncode(bytes);
  assert.deepEqual(base64urlDecode(encoded), bytes);
  assert.deepEqual(base64urlDecode(`${encoded}==`), bytes);
  assert.deepEqual(base64ToBytes(Buffer.from(bytes).toString('base64')), bytes);
});

test('a long run of "=" is stripped in linear time', () => {
  const hostile = `${'='.repeat(100_000)}x${'='.repeat(100_000)}`;
  const started = Date.now();
  assert.equal(stripBase64Padding(hostile), `${'='.repeat(100_000)}x`);
  base64ToBytes(`QQ${'='.repeat(100_000)}`);
  assert.ok(Date.now() - started < 200);
});
