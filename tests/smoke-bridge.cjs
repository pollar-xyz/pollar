// @pollar smoke test: the USDC bridge between the user's own wallets. `bridge()`
// starts a transfer with its idempotency key; `signBridgeStep` signs the
// SIGNATURE action through the handler registered for its chain and encoding
// and sends it for the action the user saw; an action that changed is refused
// before anything is signed; `pollBridgeTransfer` reads until it settles.
//
// Run with `node tests/smoke-bridge.cjs` after the build. Mocks `fetch`,
// `window` and `localStorage`, so no network is needed.

const path = require('node:path');

globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const sdk = require(path.resolve(__dirname, '../packages/core/dist/index.js'));

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

const STELLAR_WALLET = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

async function clientWith(apiKey) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  const apiKeyHash = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const storage = sdk.createMemoryAdapter();
  const wallet = { type: 'external', provider: 'freighter', address: STELLAR_WALLET, chain: 'STELLAR' };
  await storage.set(
    `pollar:${apiKeyHash}:session`,
    JSON.stringify({
      clientSessionId: 'cs',
      userId: 'u',
      status: 'CONSUMED',
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
      user: { ready: true },
      wallet,
      wallets: [wallet],
    }),
  );
  const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test' });
  await client.ready();
  return client;
}

const later = new Date(Date.now() + 3_600_000).toISOString();
const transfer = (overrides = {}) => ({
  id: 'bt-1',
  status: 'PENDING',
  fromChain: 'STELLAR',
  toChain: 'SOLANA',
  asset: 'USDC',
  amount: '2.5',
  amountOut: null,
  fromAddress: STELLAR_WALLET,
  toAddress: 'So11111111111111111111111111111111111111112',
  burnTxHash: null,
  mintTxHash: null,
  pendingAction: null,
  failure: null,
  etaSeconds: 300,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: null,
  ...overrides,
});
const signature = (actionId, value) => ({
  kind: 'SIGNATURE',
  actionId,
  chain: 'STELLAR',
  payload: { encoding: 'xdr', value },
  summary: 'Bridge 2.5 USDC (bridge)',
  expiresAt: later,
});

(async () => {
  const calls = [];
  let current = transfer({ status: 'AWAITING_ACTION', pendingAction: signature('a-1', 'UNSIGNED_APPROVE') });
  const reads = [];
  globalThis.fetch = async (req) => {
    const url = new URL(req.url);
    const body = req.method === 'GET' ? null : JSON.parse((await req.text()) || 'null');
    calls.push({ method: req.method, path: url.pathname, body });
    const json = (status, payload) => new Response(JSON.stringify(payload), { status });
    if (url.pathname.endsWith('/applications/config')) {
      return json(200, {
        success: true,
        content: { application: { signConfirmation: { mode: 'AUTO', windowSeconds: 0, maxUsd: '0' } } },
      });
    }
    if (url.pathname.endsWith('/bridge/config'))
      return json(200, {
        success: true,
        code: 'SDK_BRIDGE_CONFIG',
        content: {
          available: true,
          reason: null,
          asset: 'USDC',
          directions: [
            { fromChain: 'STELLAR', toChain: 'SOLANA' },
            { fromChain: 'STELLAR', toChain: 'POLYGON' },
            { fromChain: 'POLYGON', toChain: 'STELLAR' },
          ],
        },
      });
    if (url.pathname.endsWith('/bridge/transfers') && req.method === 'POST')
      return json(201, { success: true, code: 'SDK_BRIDGE_TRANSFER_CREATED', content: { transfer: current } });
    if (url.pathname.endsWith('/bridge/transfers/bt-1/signature')) {
      current = transfer({ status: 'BURNED', burnTxHash: 'burn-1' });
      return json(200, { success: true, code: 'SDK_BRIDGE_SIGNATURE_ACCEPTED', content: { transfer: current } });
    }
    if (url.pathname.endsWith('/bridge/transfers/bt-1')) {
      const next = reads.shift();
      if (next) current = next;
      return json(200, { success: true, code: 'SDK_BRIDGE_TRANSFER', content: { transfer: current } });
    }
    return json(200, { success: true, content: {} });
  };

  const client = await clientWith('pk_smoke_bridge');

  console.log('\n-- 1. The config lists where the user can bridge from and to --');
  const config = await client.getBridgeConfig();
  check('sources in order, once each', JSON.stringify(sdk.bridgeSourceChains(config)) === '["STELLAR","POLYGON"]');
  check('targets of Stellar', JSON.stringify(sdk.bridgeTargetChains(config, 'STELLAR')) === '["SOLANA","POLYGON"]');

  console.log('\n-- 2. bridge() starts the transfer under its idempotency key --');
  const started = await client.bridge({ fromChain: 'STELLAR', toChain: 'SOLANA', amount: '2.5', idempotencyKey: 'intent-1' });
  const create = calls.find((c) => c.path.endsWith('/bridge/transfers') && c.method === 'POST');
  check(
    'the body carries the direction, amount and key',
    create &&
      create.body.fromChain === 'STELLAR' &&
      create.body.toChain === 'SOLANA' &&
      create.body.amount === '2.5' &&
      create.body.idempotencyKey === 'intent-1',
    create && create.body,
  );
  check('the transfer waits on a signature', started.pendingAction && started.pendingAction.kind === 'SIGNATURE');

  console.log('\n-- 3. signBridgeStep signs with the handler of the chain and encoding, for the action read --');
  const signed = [];
  const release = client.registerRampSigningHandler('STELLAR', 'xdr', async (action) => {
    signed.push(action);
    return `signed:${action.payload.value}`;
  });
  let refused = null;
  try {
    await client.signBridgeStep('bt-1', 'not-this-action');
  } catch (error) {
    refused = error;
  }
  check('an action that changed is refused before signing', refused && signed.length === 0, refused);
  const afterSign = await client.signBridgeStep('bt-1', 'a-1');
  const sent = calls.find((c) => c.path.endsWith('/bridge/transfers/bt-1/signature'));
  check('the handler signed the payload as built', signed.length === 1 && signed[0].payload.value === 'UNSIGNED_APPROVE');
  check(
    'the signature goes for the action the user saw',
    sent && sent.body.actionId === 'a-1' && sent.body.signedPayload === 'signed:UNSIGNED_APPROVE',
    sent && sent.body,
  );
  check('the transfer comes back burned', afterSign.status === 'BURNED' && afterSign.burnTxHash === 'burn-1', afterSign);
  release();

  console.log('\n-- 4. pollBridgeTransfer reads until the transfer settles --');
  reads.push(
    transfer({ status: 'ATTESTED', burnTxHash: 'burn-1' }),
    transfer({ status: 'COMPLETED', burnTxHash: 'burn-1', mintTxHash: 'mint-1', amountOut: '2.5' }),
  );
  const seen = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
  const settled = await client.pollBridgeTransfer('bt-1', { onUpdate: (t) => seen.push(t.status) });
  globalThis.setTimeout = realSetTimeout;
  check('it stops at COMPLETED', settled.status === 'COMPLETED' && settled.mintTxHash === 'mint-1', settled);
  check('  having seen each step', JSON.stringify(seen) === '["ATTESTED","COMPLETED"]', seen);
  check('isBridgeSettled agrees', sdk.isBridgeSettled(settled) && !sdk.isBridgeSettled({ status: 'BURNED' }));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
