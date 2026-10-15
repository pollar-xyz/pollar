const assert = require('node:assert/strict');
const sdk = require('../packages/core/dist/index.js');
async function main() {
  const requests = [];
  const view = {
    txId: 'tx',
    transactionVersion: 7,
    nextAction: { kind: 'wait', actionId: 'next', reason: 'provider_processing' },
  };
  const api = {
    GET: async (path) => {
      requests.push({ path, method: 'GET' });
      return { data: { content: { routes: [] } } };
    },
    POST: async (path, options) => {
      requests.push({ path, method: 'POST', options });
      return { data: { content: view } };
    },
  };
  assert.deepEqual(await sdk.getRampRoutes(api), { routes: [] });
  const body = { actionId: 'auth-action', transactionVersion: 6, signedPayload: 'signed-challenge' };
  assert.deepEqual(await sdk.continueRampTransaction(api, 'tx', body), view);
  assert.deepEqual(requests[1], {
    path: '/ramps/transaction/{txId}/continue',
    method: 'POST',
    options: { params: { path: { txId: 'tx' } }, body },
  });
  // The public client methods reuse the same authenticated transport. No raw
  // fetch, alternate token path, or automatic XDR broadcast is introduced.
  await sdk.PollarClient.prototype.getRampRoutes.call({ _api: api });
  await sdk.PollarClient.prototype.continueRampTransaction.call({ _api: api }, 'tx', body);
  assert.equal(requests.filter((r) => r.method === 'POST').length, 2);
  await assert.rejects(
    sdk.continueRampTransaction(
      { POST: async () => ({ error: { code: 'SDK_RAMPS_ASSET_NOT_ENABLED', details: 'stale_ramp_action' } }) },
      'tx',
      body,
    ),
    (e) => e.message === 'SDK_RAMPS_ASSET_NOT_ENABLED',
  );
  console.log('Ramp workflow transport checks passed');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
