// A modal that retries in place asks for the new confirmation while the last
// outcome is still the transaction state: the stale error hid the Confirm button
// and showed "Transaction failed" under the new swap's review.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PollarClient } from '../src/index';

type Probe = {
  _transactionState: { step: string; code?: string } | null;
  _beginTx: () => void;
  _confirm: (input: unknown) => Promise<{ ok: true } | { ok: false; code: string; details: string }>;
  getWallets: () => unknown[];
  swapSolana: PollarClient['swapSolana'];
};

const client = () => new PollarClient({ apiKey: 'pub_testnet_probe' } as never) as unknown as Probe;

test('a finished outcome is cleared when the next transaction begins', () => {
  for (const step of ['success', 'error']) {
    const c = client();
    c._transactionState = { step };
    c._beginTx();
    assert.equal(c._transactionState?.step, 'idle', step);
  }
});

test('a live state is the same or a running transaction and stays', () => {
  for (const step of ['built', 'submitted', 'signing', 'idle']) {
    const c = client();
    const state = { step };
    c._transactionState = state;
    c._beginTx();
    assert.equal(c._transactionState, state, step);
  }
});

test('a Solana swap asks for its confirmation without the previous error, and a decline is its own outcome', async () => {
  const c = client();
  c._transactionState = { step: 'error', code: 'TX_SUBMIT_FAILED' };
  c.getWallets = () => [{ chain: 'SOLANA', custody: 'external', address: 'So1' }];
  let seenWhileAsking: string | undefined;
  c._confirm = async () => {
    seenWhileAsking = c._transactionState?.step;
    return { ok: false, code: 'SDK_CONFIRMATION_DECLINED', details: 'declined' };
  };
  const outcome = await c.swapSolana({
    provider: 'jupiter',
    inputMint: 'in',
    outputMint: 'out',
    inAmount: '1',
    outAmount: '1',
    minOut: '1',
  } as never);
  assert.equal(seenWhileAsking, 'idle');
  assert.equal(outcome.status, 'error');
  assert.equal(c._transactionState?.step, 'error');
  assert.equal(c._transactionState?.code, 'SDK_CONFIRMATION_DECLINED');
});
