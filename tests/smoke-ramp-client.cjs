// @pollar smoke test - the v3 ramp client: routes, quotes, orders and a leg's
// signature on /v3/ramps, polling at the server's pace, and the helpers a UI
// reads an order with.
//
// Run with `node tests/smoke-ramp-client.cjs` after `npm run build`. Mocks
// `fetch`; no network.
const assert = require('node:assert/strict');
const sdk = require('../packages/core/dist/index.js');

const later = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();
const usdc = {
  kind: 'asset',
  code: 'USDC',
  identifier: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  chain: 'STELLAR',
};
const bob = { kind: 'fiat', currency: 'BOB', rail: 'QR', country: 'BO' };
const usdt = { kind: 'asset', code: 'USDT', identifier: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', chain: 'POLYGON' };
const field = (key, optional) => ({ key, label: key, type: 'text', ...(optional ? { optional } : {}) });
const quote = {
  quoteId: 'q1',
  expiresAt: later(60),
  amountIn: '100',
  amountOut: '14.2',
  etaSeconds: 300,
  legs: [
    {
      index: 0,
      kind: 'PROVIDER_ONRAMP',
      from: bob,
      to: usdt,
      amountIn: '100',
      amountOut: '14.3',
      providerFees: [],
      fees: [],
      etaSeconds: 60,
      expiresAt: null,
      wallet: null,
      requiredFields: [field('name'), field('taxId', true)],
    },
    {
      index: 1,
      kind: 'SWAP',
      from: usdt,
      to: { ...usdc, chain: 'POLYGON' },
      amountIn: '14.3',
      amountOut: '14.25',
      providerFees: [],
      fees: [],
      etaSeconds: 30,
      expiresAt: null,
      wallet: null,
      requiredFields: [field('name')],
    },
    {
      index: 2,
      kind: 'BRIDGE',
      from: { ...usdc, chain: 'POLYGON' },
      to: usdc,
      amountIn: '14.25',
      amountOut: '14.2',
      providerFees: [],
      fees: [],
      etaSeconds: 210,
      expiresAt: null,
      wallet: null,
      requiredFields: [],
    },
  ],
};
const leg = (index, status, from, to) => ({
  index,
  kind: ['PROVIDER_ONRAMP', 'SWAP', 'BRIDGE'][index],
  status,
  from,
  to,
  amountInPlanned: '1',
  amountOutPlanned: '1',
  amountInActual: null,
  amountOutActual: null,
  onchainTxHash: null,
  signingMode: null,
  fundsLocation: null,
  failure: null,
});
const order = (patch) => ({
  id: 'o1',
  direction: 'ONRAMP',
  state: 'awaiting_payment',
  createdAt: later(0),
  updatedAt: later(0),
  legs: [leg(0, 'AWAITING_ACTION', bob, usdt), leg(1, 'PENDING', usdt, usdc), leg(2, 'PENDING', usdc, usdc)],
  pendingAction: null,
  failure: null,
  nextPollAfter: later(0.05),
  ...patch,
});

(async () => {
  const requests = [];
  let reads = [];
  globalThis.fetch = async (request) => {
    const url = new URL(request.url);
    const body =
      request.method === 'GET'
        ? null
        : await request
            .clone()
            .json()
            .catch(() => null);
    requests.push({ method: request.method, path: url.pathname + url.search, body });
    const answer = (content, status = 200) =>
      new Response(JSON.stringify(status < 300 ? { success: true, content } : content), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.pathname === '/v3/ramps/routes')
      return answer({ routes: [{ fiat: bob, asset: usdc, legs: ['PROVIDER_ONRAMP', 'SWAP', 'BRIDGE'] }] });
    if (url.pathname === '/v3/ramps/quotes')
      return body.amount.value === '0.01'
        ? answer(
            {
              success: false,
              code: 'SDK_RAMPS_NO_ROUTE',
              rejected: [{ legs: [], failure: { resolutionAction: 'change_amount' } }],
            },
            422,
          )
        : answer({ quotes: [quote], rejected: [] });
    if (url.pathname === '/v3/ramps/orders' && request.method === 'POST')
      return body.payee?.name
        ? answer(order({}), 201)
        : answer({ success: false, code: 'VALIDATION_ERROR', message: 'name is required' }, 400);
    if (url.pathname === '/v3/ramps/orders') return answer({ orders: [order({})], nextCursor: null });
    if (url.pathname === '/v3/ramps/orders/o1/legs/1/signature') return answer(order({ state: 'processing' }));
    if (url.pathname === '/v3/ramps/orders/o1') {
      const next = reads.length > 1 ? reads.shift() : reads[0];
      return next?.failWith ? answer({ success: false, code: next.failWith }, next.status) : answer(next);
    }
    return answer({ success: false, code: 'NOT_FOUND' }, 404);
  };

  const client = new sdk.PollarClient({
    apiKey: 'pk_ramp_fixture',
    baseUrl: 'https://api.test',
    logLevel: 'silent',
    retry: { attempts: 1 },
  });

  // --- The calls and their paths ---
  const { routes } = await client.getRampRoutes('ONRAMP');
  assert.equal(routes.length, 1);
  const quotes = await client.quoteRamp({
    direction: 'ONRAMP',
    fiat: { currency: 'BOB', rail: 'QR', country: 'BO' },
    asset: { code: 'USDC', identifier: usdc.identifier, chain: 'STELLAR' },
    amount: { value: '100', denomination: 'in' },
  });
  assert.equal(quotes.quotes[0].quoteId, 'q1');
  const noRoute = await client
    .quoteRamp({
      direction: 'ONRAMP',
      fiat: { currency: 'BOB', rail: 'QR', country: 'BO' },
      asset: { code: 'USDC', identifier: null, chain: 'STELLAR' },
      amount: { value: '0.01', denomination: 'in' },
    })
    .catch((error) => error);
  assert.equal(sdk.isPollarApiError(noRoute), true);
  assert.equal(noRoute.code, 'SDK_RAMPS_NO_ROUTE');
  assert.equal(noRoute.body.rejected.length, 1, 'a quote with no route keeps why each route dropped out');
  const refused = await client.createRampOrder({ quoteId: 'q1' }).catch((error) => error);
  assert.deepEqual([refused.code, refused.body.message], ['VALIDATION_ERROR', 'name is required']);
  const created = await client.createRampOrder({ quoteId: 'q1', payee: { name: 'Ana' } });
  assert.equal(created.id, 'o1');
  await client.listRampOrders({ pending: 'true', limit: 5 });
  assert.deepEqual(
    requests.map((r) => `${r.method} ${r.path}`),
    [
      'GET /v3/ramps/routes?direction=ONRAMP',
      'POST /v3/ramps/quotes',
      'POST /v3/ramps/quotes',
      'POST /v3/ramps/orders',
      'POST /v3/ramps/orders',
      'GET /v3/ramps/orders?pending=true&limit=5',
    ],
  );
  assert.deepEqual(requests[4].body, { quoteId: 'q1', payee: { name: 'Ana' } });

  // --- Helpers ---
  assert.deepEqual(
    sdk.rampQuoteFields(quote).map((f) => f.key),
    ['name', 'taxId'],
    'every field once, across legs',
  );
  assert.deepEqual(sdk.rampCountries(routes), [{ country: 'BO', fiats: [bob] }]);
  assert.deepEqual(
    quote.legs.map((l) => sdk.rampLegTitle(l)),
    ['Buy USDT on Polygon', 'Convert USDT to USDC', 'Send to Stellar'],
  );
  assert.deepEqual(
    ['SPEI', 'QR', 'BANK_TRANSFER', 'CASH', 'CARD', 'HOSTED', 'WIRE'].map((rail) => sdk.rampRailLabel(rail)),
    ['SPEI', 'QR', 'Bank transfer', 'Cash', 'Card', 'Chosen at the provider', 'WIRE'],
    'named schemes keep their name; an unknown rail shows as it came',
  );
  assert.deepEqual(
    ['BREB', 'BANK_TRANSFER', 'CASH', 'CARD', 'HOSTED'].map((rail) => sdk.rampRailLabel(rail, { language: 'es' })),
    ['BREB', 'Transferencia bancaria', 'Efectivo', 'Tarjeta', 'Se elige en el proveedor'],
  );
  assert.equal(sdk.rampRailLabel('HOSTED', { language: 'es', provider: 'Anclap' }), 'Se elige en Anclap');
  assert.equal(sdk.rampRailLabel('HOSTED', { provider: 'Anclap' }), 'Chosen at Anclap');
  assert.deepEqual(
    ['COMPLETED', 'ACTIVE', 'PENDING', 'HELD'].map((status) => sdk.rampLegStatus({ status, failure: null })),
    ['done', 'active', 'pending', 'failed'],
  );
  assert.match(sdk.rampResolutionText({ resolutionAction: 'change_amount' }), /amount/);
  assert.match(sdk.rampResolutionText({ resolutionAction: 'something_new' }), /support/);
  const scannable = {
    kind: 'pix',
    payload: '000201',
    payloadLabel: 'Payment code',
    image: { mediaType: 'image/svg+xml', encoding: 'utf8', data: '<svg/>', inlineSafe: true },
  };
  const qr = sdk.describeRampAction(
    order({
      pendingAction: {
        kind: 'FIAT_PAYMENT',
        actionId: 'a',
        legIndex: 0,
        instructions: { kind: 'qr', payload: '000201', amount: '100', currency: 'BOB', scannable },
        expiresAt: null,
      },
    }),
  );
  assert.deepEqual([qr.title, qr.scannable], ['Pay 100 BOB', scannable]);
  const bank = sdk.describeRampAction(
    order({
      pendingAction: {
        kind: 'FIAT_PAYMENT',
        actionId: 'a',
        legIndex: 0,
        instructions: {
          kind: 'bank_transfer',
          amount: '5',
          currency: 'MXN',
          details: [{ label: 'CLABE', value: '012' }],
          reference: 'R1',
        },
        expiresAt: null,
      },
    }),
  );
  assert.deepEqual(bank.details, [
    { label: 'CLABE', value: '012' },
    { label: 'Reference', value: 'R1' },
  ]);
  assert.equal(
    sdk.describeRampAction(
      order({ pendingAction: { kind: 'COSIGN_APPROVAL', actionId: 'c', legIndex: 0, cosignRequestId: 'r', summary: 's' } }),
    ).canApprove,
    true,
  );
  assert.equal(
    sdk.describeRampAction(
      order({ pendingAction: { kind: 'KYC', actionId: 'k', legIndex: 0, steps: [], url: 'http://insecure.test' } }),
    ).link,
    null,
    'only https links open',
  );
  assert.equal(
    sdk.describeRampAction(
      order({ pendingAction: { kind: 'KYC', actionId: 'k', legIndex: 0, steps: [], url: 'https://kyc.test/x' } }),
    ).link,
    'https://kyc.test/x',
  );
  assert.equal(sdk.safeRampUrl, undefined, 'URL vetting stays internal');

  // --- Signing a leg: only the action the user saw, through the right signer ---
  const signature = (actionId, encoding = 'xdr', seconds = 60) => ({
    kind: 'SIGNATURE',
    actionId,
    legIndex: 1,
    chain: 'STELLAR',
    payload: { encoding, value: 'unsigned-xdr' },
    summary: 'payment',
    expiresAt: later(seconds),
  });
  reads = [order({ pendingAction: signature('s1') })];
  await assert.rejects(client.signRampLeg('o1', 'old'), /action changed/);
  reads = [order({ pendingAction: signature('s1', 'xdr', -1) })];
  await assert.rejects(client.signRampLeg('o1', 's1'), /action changed/, 'an expired action is not signed');
  let walletSigned = 0;
  client.signTx = async () => {
    walletSigned++;
    return { status: 'signed', signedXdr: 'signed-by-wallet' };
  };
  reads = [order({ pendingAction: signature('s1') })];
  await assert.rejects(client.signRampLeg('o1', 's1'), /Register a ramp signing handler for STELLAR\/xdr/);
  assert.equal(walletSigned, 0, 'core has no built-in ramp signer, not even for a Stellar XDR');
  requests.length = 0;
  const cleanup = client.registerRampSigningHandler('STELLAR', 'xdr', async (action) => `app-${action.actionId}`);
  const signed = await client.signRampLeg('o1', 's1');
  assert.equal(signed.state, 'processing');
  assert.deepEqual(requests.at(-1), {
    method: 'POST',
    path: '/v3/ramps/orders/o1/legs/1/signature',
    body: { actionId: 's1', signedPayload: 'app-s1' },
  });
  cleanup();
  reads = [order({ pendingAction: signature('s2', 'evm-eip1559-json') })];
  await assert.rejects(client.signRampLeg('o1', 's2'), /Register a ramp signing handler for STELLAR\/evm-eip1559-json/);

  // --- Signing a Solana transaction with the user's external wallet: base64 in and out ---
  await assert.rejects(client.signSolanaTransaction('AAEC'), /cannot sign a Solana transaction/);
  const seenChains = [];
  client._walletAdapter = {
    type: 'phantom',
    signSolanaTransaction: async (bytes, chain) => {
      seenChains.push(chain);
      return Uint8Array.from([...bytes, 0xff, 0xfe]);
    },
  };
  const unsignedTx = Buffer.from([0, 1, 2, 250, 251]).toString('base64');
  const signedTx = await client.signSolanaTransaction(unsignedTx);
  assert.deepEqual([...Buffer.from(signedTx, 'base64')], [0, 1, 2, 250, 251, 0xff, 0xfe]);
  assert.equal(signedTx, Buffer.from([0, 1, 2, 250, 251, 0xff, 0xfe]).toString('base64'), 'standard base64, padded');
  assert.deepEqual(seenChains, ['solana:devnet']);
  client._walletAdapter = null;

  // --- Polling: at the server's pace, until the order settles ---
  reads = [order({}), order({ state: 'processing' }), order({ state: 'completed', nextPollAfter: null })];
  const seen = [];
  const settled = await client.pollRampOrder('o1', { onUpdate: (o) => seen.push(o.state) });
  assert.equal(settled.state, 'completed');
  assert.deepEqual(seen, ['awaiting_payment', 'processing', 'completed']);
  // A read the API fails (a deploy's 502) is reported and read again; only a vanished order ends it.
  reads = [order({}), { failWith: 'GATEWAY_ERROR', status: 502 }, order({ state: 'completed', nextPollAfter: null })];
  const pollErrors = [];
  const recovered = await client.pollRampOrder('o1', { onError: (e) => pollErrors.push(e.code) });
  assert.equal(recovered.state, 'completed');
  assert.deepEqual(pollErrors, ['GATEWAY_ERROR']);
  reads = [{ failWith: 'SDK_RAMPS_TX_NOT_FOUND', status: 404 }];
  await assert.rejects(client.pollRampOrder('o1'), (e) => e.code === 'SDK_RAMPS_TX_NOT_FOUND');
  const controller = new AbortController();
  reads = [order({ nextPollAfter: later(30) })];
  const stopped = client.pollRampOrder('o1', { signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(stopped, (error) => error.name === 'AbortError');

  client.destroy();
  console.log('Ramp client v3: paths, payee errors, helpers, leg signing, polling and polling through errors passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
