const assert = require('node:assert/strict');
const { PollarClient } = require('../packages/core/dist/index.js');

async function run(outcome, chain = 'SOLANA') {
  const states = [];
  const client = Object.create(PollarClient.prototype);
  client._setTransactionState = (state) => { client._transactionState = state; states.push(state); };
  client._earnWallet = () => ({ chain });
  client._performEarnBuildAndSubmit = async () => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  await client.earnDeposit({ provider: 'jupiter', opportunity: 'test', amount: '0.001' });
  assert.equal(states[0].step, 'building');
  return states.at(-1);
}

(async () => {
  assert.deepEqual(await run({ status: 'success', hash: 'signature' }), { step: 'success', hash: 'signature' });
  assert.deepEqual(await run({ status: 'pending', hash: 'signature' }), { step: 'submitted', hash: 'signature' });
  assert.equal((await run({ status: 'error', details: 'Wallet rejected' })).details, 'Wallet rejected');
  assert.equal((await run(new Error('Build failed'))).details, 'Build failed');
  assert.equal((await run({ status: 'prepared' })).step, 'idle');
  console.log('Earn state regression checks passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
