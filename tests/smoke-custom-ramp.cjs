const assert = require('node:assert/strict');
const sdk = require('../packages/core/dist/index.js');
const portable = require('@pollar/core/ramps');

(async () => {
  const transport = { secret: 'server-only-fixture' };
  const adapter = portable.defineRampAdapter({
    adapterId: 'custom-bank',
    async capabilities() {
      return {
        routes: [],
        callbacks: false,
        polling: true,
        providerIdempotency: false,
        operationLookup: false,
        fiatPayoutEvidence: false,
        keyRetentionSeconds: null,
      };
    },
    async quote() {
      throw new Error('Not used in the application');
    },
    async create() {
      throw new Error('Not used in the application');
    },
    async status() {
      throw new Error('Not used in the application');
    },
    async reconcile() {
      return null;
    },
  });
  const registration = portable.defineRampAdapterRegistration('custom-bank', {
    defaultChain: 'STELLAR',
    async resolveConfiguration(scope) {
      return {
        configurationId: `${scope.providerId}:testnet:v1`,
        client: transport,
        timeoutMs: 1000,
        clock: () => new Date(),
        logger: { warn() {} },
      };
    },
    factory(dependencies) {
      assert.equal(dependencies.client, transport);
      return adapter;
    },
  });
  const dependencies = await registration.resolveConfiguration({
    applicationId: 'app',
    providerId: 'provider',
    network: 'testnet',
  });
  assert.equal(registration.factory(dependencies), adapter);
  assert.throws(() => portable.defineRampAdapterRegistration('', registration), portable.isRampAdapterError);
  assert.throws(() => portable.defineRampAdapter({ adapterId: 'incomplete' }), portable.isRampAdapterError);
  assert.equal(sdk.isRampAdapterError(new portable.RampAdapterError('INVALID_INPUT', 'operator')), true);
  const esm = await import('@pollar/core/ramps');
  const native = require('../packages/core/dist/index.rn.js');
  assert.equal(native.isRampAdapterError(new esm.RampAdapterError('QUOTE_EXPIRED', 'requote')), true);
  assert.equal(typeof native.defineRampAdapterRegistration, 'function');
  assert.equal(sdk.RampAdapterClient, undefined);
  assert.equal(sdk.PollarClient.prototype.registerRampAdapter, undefined);

  const originalFetch = globalThis.fetch;
  const requests = [];
  const client = new sdk.PollarClient({
    apiKey: 'app-fixture-key',
    baseUrl: 'https://pollar.fixture',
    logLevel: 'silent',
    retry: { attempts: 1 },
  });
  globalThis.fetch = async (request) => {
    assert.equal(new URL(request.url).origin, 'https://pollar.fixture');
    assert.equal(request.headers.get('x-pollar-api-key'), 'app-fixture-key');
    requests.push({ method: request.method, path: new URL(request.url).pathname });
    const path = new URL(request.url).pathname;
    const content = path.endsWith('/routes')
      ? { routes: [] }
      : path.endsWith('/quotes')
        ? { quotes: [], rejected: [] }
        : { id: 'backend-issued-order', direction: 'ONRAMP', state: 'created', legs: [], pendingAction: null };
    return new Response(JSON.stringify({ success: true, content }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    await client.getRampRoutes('ONRAMP');
    await client.quoteRamp({
      direction: 'ONRAMP',
      fiat: { currency: 'USD', rail: 'ACH', country: 'US' },
      asset: { code: 'USDC', identifier: null, chain: 'STELLAR' },
      amount: { value: '10', denomination: 'in' },
    });
    const order = await client.createRampOrder({ quoteId: 'backend-issued-quote' });
    assert.equal(order.id, 'backend-issued-order');
    await client.getRampOrder(order.id);
    assert.deepEqual(requests, [
      { method: 'GET', path: '/v3/ramps/routes' },
      { method: 'POST', path: '/v3/ramps/quotes' },
      { method: 'POST', path: '/v3/ramps/orders' },
      { method: 'GET', path: '/v3/ramps/orders/backend-issued-order' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    client.destroy();
  }
  console.log('Core adapter contract and server registration passed; all application ramp calls use the Pollar backend.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
