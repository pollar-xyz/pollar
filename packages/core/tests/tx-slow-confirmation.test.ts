// A transaction still pending when its confirmation window closes keeps being
// read in the background: its state settles by itself instead of leaving a
// prompt on a spinner. Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { PollarClient, type TransactionState } from '../src/index';

type TxStatus = { status: 'SUCCESS' | 'FAILED' | 'PENDING'; resultCode?: string };
type Probe = {
  _setTransactionState: (next: TransactionState) => void;
  _watchSlowTx: (hash: string, phase: 'submitting', buildData: undefined, gen: number) => void;
  _sessionGeneration: number;
  getTransactionState: () => TransactionState | null;
  getTxStatus: (hash: string) => Promise<TxStatus>;
  destroy: () => void;
};

function client(answers: TxStatus[]): Probe & { reads: number } {
  const c = new PollarClient({ apiKey: 'pub_testnet_probe' } as never) as unknown as Probe & { reads: number };
  c.reads = 0;
  c.getTxStatus = async () => {
    c.reads++;
    return answers.shift() ?? { status: 'PENDING' };
  };
  return c;
}

async function advance(ms: number) {
  mock.timers.tick(ms);
  // Let the read the timer started resolve before the next tick.
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

test('a transaction confirmed after the window ends as success, marked slow meanwhile', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const c = client([{ status: 'PENDING' }, { status: 'SUCCESS' }]);
    c._setTransactionState({ step: 'submitted', hash: 'H' });
    c._watchSlowTx('H', 'submitting', undefined, c._sessionGeneration);
    const slow = c.getTransactionState();
    assert.equal(slow?.step, 'submitted');
    assert.equal(slow && 'slow' in slow ? slow.slow : undefined, true);
    await advance(5_000);
    assert.equal(c.getTransactionState()?.step, 'submitted', 'still pending on the first read');
    await advance(5_000);
    assert.equal(c.getTransactionState()?.step, 'success');
    c.destroy();
  } finally {
    mock.timers.reset();
  }
});

test('one that never lands ends as TX_NOT_CONFIRMED after ten minutes', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const c = client([]);
    c._setTransactionState({ step: 'submitted', hash: 'H' });
    c._watchSlowTx('H', 'submitting', undefined, c._sessionGeneration);
    for (let elapsed = 0; elapsed <= 11 * 60_000; elapsed += 5_000) await advance(5_000);
    const end = c.getTransactionState();
    assert.equal(end?.step, 'error');
    assert.equal(end && 'code' in end ? end.code : undefined, 'TX_NOT_CONFIRMED');
    c.destroy();
  } finally {
    mock.timers.reset();
  }
});

test('a newer transaction is never overwritten by the old one settling', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const c = client([{ status: 'SUCCESS' }]);
    c._setTransactionState({ step: 'submitted', hash: 'OLD' });
    c._watchSlowTx('OLD', 'submitting', undefined, c._sessionGeneration);
    c._setTransactionState({ step: 'submitting', signedXdr: 'NEW' });
    await advance(5_000);
    assert.equal(c.getTransactionState()?.step, 'submitting');
    assert.equal(c.reads, 0, 'nothing is read for a transaction that was replaced');
    c.destroy();
  } finally {
    mock.timers.reset();
  }
});
