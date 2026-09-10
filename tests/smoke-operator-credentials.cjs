// @pollar smoke test — Server operator credential mode for /ramps.
//
// Closes issue #56: Server/operator credential mode for /ramps/onramp.

const path = require('node:path');

const SDK_DIST = path.resolve(__dirname, '../packages/core/dist/index.js');
const sdk = require(SDK_DIST);

let pass = 0;
let fail = 0;
function check(label, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  OK    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`, extra ?? '');
  }
}

(async () => {
  console.log('── 1. Server-Side Instantiation with Operator Credentials ──');

  const operatorSecret = 'sk_live_op_secret_99887766';
  const apiKey = 'pk_test_operator_ramp';

  const client = new sdk.PollarClient({
    apiKey,
    operatorKey: operatorSecret,
    stellarNetwork: 'testnet',
    storage: sdk.createMemoryAdapter(),
  });

  await client.ready();
  check('client.ready() resolves in operator mode', true);
  check('client.operatorKey reflects configured operatorKey', client.operatorKey === operatorSecret);

  // Dynamic setter
  client.setOperatorKey('sk_live_op_secret_updated');
  check('client.setOperatorKey updates the key', client.operatorKey === 'sk_live_op_secret_updated');
  client.setOperatorKey(operatorSecret);

  console.log('── 2. Request Header Injection for Ramps in Operator Mode ──');

  let capturedRequests = [];
  globalThis.fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    capturedRequests.push({
      url: req.url,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      body: req.method !== 'GET' ? await req.clone().text() : null,
    });

    if (req.url.includes('/ramps/onramp')) {
      return new Response(
        JSON.stringify({
          status: 'success',
          content: {
            id: 'ramp_tx_123',
            type: 'onramp',
            status: 'pending_user_transfer',
            depositAddress: 'GACCOUNT...',
            instructions: 'Send USD to anchor account',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (req.url.includes('/ramps/transaction/ramp_tx_123')) {
      return new Response(
        JSON.stringify({
          status: 'success',
          content: {
            id: 'ramp_tx_123',
            status: 'completed',
            cryptoAmount: '100',
            fiatAmount: '100',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ status: 'success', content: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const onrampResult = await client.createOnRamp({
    fiatAmount: '100',
    fiatCurrency: 'USD',
    cryptoAsset: 'USDC',
    destinationAddress: 'GACCOUNT1234567890',
  });

  check('createOnRamp returns data in operator mode', onrampResult?.id === 'ramp_tx_123');
  const onrampReq = capturedRequests[0];
  check('createOnRamp includes Authorization: Bearer <operatorKey>', onrampReq.headers['authorization'] === `Bearer ${operatorSecret}`);
  check('createOnRamp includes X-Operator-Key header', onrampReq.headers['x-operator-key'] === operatorSecret);
  check('createOnRamp does not require DPoP header', onrampReq.headers['dpop'] === undefined);

  console.log('── 3. GET /ramps/transaction/:id in Operator Mode ──');
  capturedRequests = [];
  const txStatus = await client.getRampTransaction('ramp_tx_123');
  check('getRampTransaction returns status', txStatus?.status === 'completed');
  const getReq = capturedRequests[0];
  check('getRampTransaction includes Authorization header', getReq.headers['authorization'] === `Bearer ${operatorSecret}`);
  check('getRampTransaction includes X-Operator-Key header', getReq.headers['x-operator-key'] === operatorSecret);

  console.log('── 4. Per-Call Operator Key Override ──');
  capturedRequests = [];
  const customKey = 'sk_override_per_call_custom';
  await client.createOnRamp(
    {
      fiatAmount: '50',
      fiatCurrency: 'BRL',
      cryptoAsset: 'USDC',
      destinationAddress: 'GACCOUNT9876543210',
    },
    { operatorKey: customKey },
  );

  const overrideReq = capturedRequests[0];
  check('Per-call operatorKey overrides client default Authorization', overrideReq.headers['authorization'] === `Bearer ${customKey}`);
  check('Per-call operatorKey overrides X-Operator-Key header', overrideReq.headers['x-operator-key'] === customKey);

  console.log('── 5. ServerSecretKey Config Alias Compatibility ──');
  const secretKeyClient = new sdk.PollarClient({
    apiKey,
    serverSecretKey: 'sk_via_server_secret_key_alias',
    stellarNetwork: 'testnet',
    storage: sdk.createMemoryAdapter(),
  });
  await secretKeyClient.ready();
  check('serverSecretKey is accepted as alias for operatorKey', secretKeyClient.operatorKey === 'sk_via_server_secret_key_alias');

  console.log(`\n${pass} pass, ${fail} fail\n`);
  if (fail > 0) process.exit(1);
})();
