const assert = require('node:assert/strict');
const sdk = require('../packages/core/dist/index.js');
const native = require('../packages/core/dist/index.rn.js');

const route = { asset: { chain: 'POLYGON', network: 'mainnet' } };
const snapshot = {
  txId: 'enum-fixture',
  status: 'pending',
  transactionVersion: 1,
  chain: 'POLYGON',
  terms: { assetChain: 'POLYGON', cryptoAmount: '9007199254740993.123456789012', fiatAmount: '20.00' },
  nextAction: {
    kind: 'sign_transaction',
    actionId: 'enum-action',
    chain: 'POLYGON',
    network: 'mainnet',
    payload: { encoding: 'fixture-json', value: 'unsigned' },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
};
const invalid = ['solana', 'polygon', 'SOLONA', 'FUTURE_CHAIN', 'eip155:137', '', null];
const error = /Unsupported ramp chain/;

async function main() {
  assert.deepEqual(sdk.RampChain, { STELLAR: 'STELLAR', POLYGON: 'POLYGON', SOLANA: 'SOLANA' });
  assert.deepEqual(native.RampChain, sdk.RampChain);
  assert.equal(Object.isFrozen(sdk.RampChain), true);
  const client = new sdk.PollarClient({ apiKey: 'fixture', logLevel: 'silent' });
  client.destroy();
  let signs = 0;
  let continuations = 0;
  client.continueRamp = async () => {
    continuations++;
    return snapshot;
  };
  for (const chain of Object.values(sdk.RampChain)) {
    const current = { ...snapshot, chain, nextAction: { ...snapshot.nextAction, chain } };
    client.getRampTransaction = async () => current;
    const cleanup = client.registerRampSigningHandler(chain, 'fixture-json', async () => {
      signs++;
      return 'signed';
    });
    await client.signRampAction(current.txId, current);
    cleanup();
  }
  assert.equal(signs, 3);
  assert.equal(continuations, 3);
  for (const chain of invalid) {
    assert.throws(() => client.registerRampSigningHandler(chain, 'fixture-json', async () => 'signed'), error);
    const current = { ...snapshot, nextAction: { ...snapshot.nextAction, chain } };
    client.getRampTransaction = async () => current;
    await assert.rejects(client.signRampAction(current.txId, current), error);
  }
  assert.equal(signs, 3);
  assert.equal(continuations, 3);

  let content = snapshot;
  let requests = 0;
  const api = {
    GET: async () => {
      requests++;
      return { data: { content } };
    },
    POST: async () => ({ data: { content } }),
  };
  for (const chain of invalid) await assert.rejects(sdk.getRampsQuote(api, { chain }), error);
  assert.equal(requests, 0);
  const transactions = [
    () => sdk.createOnRamp(api, {}),
    () => sdk.createOffRamp(api, {}),
    () => sdk.completeWithdraw(api, snapshot.txId),
    () => sdk.submitRampSignature(api, snapshot.txId, {}),
    () => sdk.getRampTransaction(api, snapshot.txId),
    () => sdk.continueRamp(api, snapshot.txId, {}),
  ];
  for (const chain of Object.values(sdk.RampChain)) {
    content = {
      ...snapshot,
      chain,
      terms: { ...snapshot.terms, assetChain: chain },
      nextAction: { ...snapshot.nextAction, chain },
    };
    for (const read of transactions) {
      const result = await read();
      assert.equal(result.terms.cryptoAmount, '9007199254740993.123456789012');
      assert.equal(result.terms.fiatAmount, '20.00');
    }
  }
  for (const chain of invalid) {
    for (const badSnapshot of [
      { ...snapshot, chain },
      { ...snapshot, terms: { ...snapshot.terms, assetChain: chain } },
      { ...snapshot, nextAction: { ...snapshot.nextAction, chain } },
      { ...snapshot, nextAction: { kind: 'chain_transfer', chain: 'POLYGON', asset: { chain } } },
      { ...snapshot, nextAction: { kind: 'chain_transfer', chain, asset: { chain: 'POLYGON' } } },
    ]) {
      content = badSnapshot;
      for (const read of transactions) await assert.rejects(read(), error);
    }
    content = { routes: [{ ...route, asset: { ...route.asset, chain } }] };
    await assert.rejects(sdk.getRampRoutes(api), error);
    content = { quotes: [{ route: { ...route, asset: { ...route.asset, chain } } }] };
    await assert.rejects(sdk.getRampsQuote(api, {}), error);
    content = { quotes: [{ terms: { ...snapshot.terms, assetChain: chain } }] };
    await assert.rejects(sdk.getRampsQuote(api, {}), error);
  }
  content = { ...snapshot, chain: undefined, terms: undefined, nextAction: null };
  assert.equal(await sdk.getRampTransaction(api, snapshot.txId), content);
  content = { ...snapshot, nextAction: { kind: 'collect_information', fields: [{ key: 'chain', type: 'text' }] } };
  await sdk.continueRamp(api, snapshot.txId, { fields: { chain: 'an arbitrary form answer' } });
  console.log('Ramp chains: three supported chains, invalid input/response rejection and exact amounts passed.');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
