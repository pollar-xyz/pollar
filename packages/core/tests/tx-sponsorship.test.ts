// Who paid the fee reaches the transaction state once the platform says it,
// and stays on the later steps of the same transaction, never on the next one.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PollarClient, type TransactionState } from '../src/index';

type Probe = {
  _setTransactionState: (next: TransactionState) => void;
  getTransactionState: () => TransactionState | null;
};

function client(): Probe {
  return new PollarClient({ apiKey: 'pub_testnet_probe' } as never) as unknown as Probe;
}

const sponsoredOf = (state: TransactionState | null) => (state && 'sponsored' in state ? state.sponsored : undefined);

test('a signature the app paid for stays sponsored through submit and confirmation', () => {
  const c = client();
  c._setTransactionState({ step: 'signed', signedXdr: 'XDR', sponsored: true });
  c._setTransactionState({ step: 'submitting', signedXdr: 'XDR' });
  assert.equal(sponsoredOf(c.getTransactionState()), true);
  c._setTransactionState({ step: 'submitted', hash: 'H' });
  assert.equal(sponsoredOf(c.getTransactionState()), true);
  c._setTransactionState({ step: 'success', hash: 'H' });
  assert.equal(sponsoredOf(c.getTransactionState()), true);
});

test('the submit answer replaces what the signature said', () => {
  const c = client();
  c._setTransactionState({ step: 'signed', signedXdr: 'XDR', sponsored: false });
  c._setTransactionState({ step: 'success', hash: 'H', sponsored: true });
  assert.equal(sponsoredOf(c.getTransactionState()), true);
});

test('a finished transaction lends nothing to the next one', () => {
  const c = client();
  c._setTransactionState({ step: 'success', hash: 'H1', sponsored: true });
  c._setTransactionState({ step: 'submitting', signedXdr: 'XDR2' });
  assert.equal(sponsoredOf(c.getTransactionState()), undefined);
  c._setTransactionState({ step: 'submitted', hash: 'H2', sponsored: false });
  c._setTransactionState({ step: 'success', hash: 'H3' });
  assert.equal(sponsoredOf(c.getTransactionState()), undefined, 'a confirmation of another hash');
});

test('before the platform says, there is nothing to show', () => {
  const c = client();
  c._setTransactionState({ step: 'signing' });
  c._setTransactionState({ step: 'success', hash: 'H' });
  assert.equal(sponsoredOf(c.getTransactionState()), undefined);
});
