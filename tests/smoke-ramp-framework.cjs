const assert = require('node:assert/strict');
const sdk = require('../packages/core/dist/index.js');
const endpoints = sdk;
const snapshot = {
  txId: 'fixture-tx',
  status: 'pending',
  lifecycleState: 'awaiting_payment',
  transactionVersion: 2,
  reconciliationRequired: false,
  terms: {
    fiatAmount: '20.00',
    fiatCurrency: 'PEN',
    cryptoAmount: '1.123456789012',
    assetCode: 'NATIVE',
    assetChain: 'POLYGON',
    assetIssuer: null,
    feeAmount: '0',
    feeCurrency: 'PEN',
  },
  nextAction: {
    kind: 'sign_transaction',
    actionId: 'fixture-action',
    purpose: 'withdrawal_payment',
    chain: 'POLYGON',
    network: 'mainnet',
    challengeRef: 'fixture-challenge',
    payload: { encoding: 'fixture-json', value: 'fixture-unsigned' },
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  },
};
(async () => {
  assert.equal(sdk.mergeRampSnapshot(snapshot, { ...snapshot, transactionVersion: 1 }).transactionVersion, 2);
  assert.equal(sdk.mergeRampSnapshot(snapshot, { ...snapshot, txId: 'other' }).txId, snapshot.txId);
  assert.equal(sdk.describeRampAction(snapshot).canSign, true);
  assert.equal(sdk.describeRampAction({ ...snapshot, reconciliationRequired: true }).canSign, false);
  assert.deepEqual(sdk.mergeRampCountries([], [{ country: 'ZZ', fiatCurrency: 'ANY_COIN' }]), [
    { code: 'ZZ', currency: 'ANY_COIN' },
  ]);
  assert.equal(
    sdk.describeRampAction({
      ...snapshot,
      nextAction: {
        kind: 'qr_payment',
        actionId: 'expired',
        payload: 'code',
        amount: '20',
        currency: 'PEN',
        expiresAt: '2000-01-01T00:00:00Z',
      },
    }).qr,
    null,
  );
  assert.equal(sdk.RampSigningRegistry, undefined);
  assert.equal(sdk.safeRampUrl, undefined);
  assert.deepEqual(
    sdk.describeRampAction({ ...snapshot, nextAction: { kind: 'redirect', url: 'javascript:alert(1)' } }).links,
    [],
  );
  const verification = sdk.describeRampAction({
    ...snapshot,
    nextAction: {
      kind: 'verification',
      actionId: 'verify',
      order: 'parallel',
      steps: [
        {
          stepId: 'kyc',
          purpose: 'verification',
          status: 'required',
          url: 'https://fixture.invalid/kyc',
          instructions: 'Verify',
        },
        { stepId: 'terms', purpose: 'terms', status: 'required', url: 'https://fixture.invalid/terms', instructions: 'Terms' },
      ],
    },
  });
  assert.equal(verification.links.length, 2);
  const sequential = sdk.describeRampAction({ ...snapshot, nextAction: { ...verification.action, order: 'sequential' } });
  assert.equal(sequential.links.length, 1);
  let signs = 0,
    continuations = 0;
  const client = new sdk.PollarClient({ apiKey: 'fixture', logLevel: 'silent' });
  client.destroy();
  client.getRampTransaction = async () => snapshot;
  client.continueRamp = async (txId, body) => {
    assert.equal(txId, snapshot.txId);
    assert.equal(body.actionId, snapshot.nextAction.actionId);
    assert.equal(body.signedPayload, 'fixture-signed');
    continuations++;
    return { ...snapshot, transactionVersion: 3 };
  };
  await client.getRampTransaction(snapshot.txId);
  assert.equal(signs, 0);
  await assert.rejects(client.signRampAction(snapshot.txId, snapshot), /Register a ramp signing handler/);
  client.registerRampSigningHandler('POLYGON', 'fixture-json', async (action) => {
    assert.equal(action.payload.value, 'fixture-unsigned');
    signs++;
    return 'fixture-signed';
  });
  await assert.rejects(client.signRampAction(snapshot.txId, { ...snapshot, transactionVersion: 1 }), /action changed/);
  assert.equal(signs, 0);
  await client.signRampAction(snapshot.txId, snapshot);
  assert.equal(signs, 1);
  assert.equal(continuations, 1);
  const calls = [];
  const api = {
    GET: async (path, params) => {
      calls.push([path, params]);
      return { data: { content: path === '/ramps/routes' ? { routes: [] } : snapshot } };
    },
    POST: async (path, params) => {
      calls.push([path, params]);
      return { data: { content: snapshot } };
    },
  };
  await endpoints.getRampRoutes(api);
  await endpoints.getRampTransaction(api, snapshot.txId);
  assert.equal(
    calls.some(([path]) => path.endsWith('/continue')),
    false,
  );
  await endpoints.continueRamp(api, snapshot.txId, { actionId: 'fixture-action', transactionVersion: 2 });
  assert.equal(calls[2][0], '/ramps/transaction/{txId}/continue');
  console.log(
    'Ramp SDK: Polygon signing, explicit continuation, stale versions, verification and read-only restoration passed.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
