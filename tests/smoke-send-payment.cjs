// @pollar smoke test: PollarClient.sendPayment on Solana and Polygon - the
// wallet is taken from wallets[] (session.wallet is the Stellar one by
// contract), and the body the atomic route gets carries the chain's own asset
// field.
//
// Run with `node tests/smoke-send-payment.cjs` after the build. Mocks `fetch`,
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

const POLYGON_WALLET = '0x2222222222222222222222222222222222222222';
const POLYGON_DEST = '0x4444444444444444444444444444444444444444';
const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const SOLANA_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

async function clientWith(wallets, apiKey) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  const apiKeyHash = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const storage = sdk.createMemoryAdapter();
  await storage.set(
    `pollar:${apiKeyHash}:session`,
    JSON.stringify({
      clientSessionId: 'cs',
      userId: 'u',
      status: 'CONSUMED',
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
      user: { ready: true },
      wallet: { type: 'internal', provider: 'email', address: null, chain: 'STELLAR' },
      wallets,
    }),
  );
  const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test' });
  await client.ready();
  return client;
}

(async () => {
  const bodies = [];
  globalThis.fetch = async (req) => {
    const url = new URL(req.url);
    // The app's dashboard signs without asking: these checks are about the send, not the prompt.
    if (url.pathname.endsWith('/applications/config')) {
      return new Response(
        JSON.stringify({
          success: true,
          content: { application: { signConfirmation: { mode: 'AUTO', windowSeconds: 0, maxUsd: '0' } } },
        }),
        { status: 200 },
      );
    }
    if (url.pathname.endsWith('/tx/build-sign-submit')) {
      bodies.push(JSON.parse(await req.text()));
      return new Response(
        JSON.stringify({
          success: true,
          code: 'SDK_TX_SUBMIT',
          content: { hash: `0x${'ab'.repeat(32)}`, status: 'SUCCESS', summary: {}, sponsored: false },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
  };

  console.log('\n── 1. A Polygon payment from a custodial wallet ──────────────');
  const polygon = await clientWith(
    [{ type: 'internal', provider: 'email', address: POLYGON_WALLET, chain: 'POLYGON' }],
    'pk_smoke_send_polygon',
  );
  const sent = await polygon.sendPayment({
    chain: 'POLYGON',
    destination: POLYGON_DEST,
    amount: '1500000',
    mint: USDC_POLYGON,
  });
  check('it succeeds', sent.status === 'success', sent);
  const body = bodies[0] ?? {};
  check('the body names the Polygon chain', body.chain === 'POLYGON', body);
  check('the ERC-20 contract travels as `token`', body.params && body.params.token === USDC_POLYGON, body.params);
  check('  and not as `mint`', body.params && body.params.mint === undefined, body.params);
  check('the amount is passed through in base units', body.params && body.params.amount === '1500000', body.params);
  check('an idempotency key is sent', typeof body.idempotencyKey === 'string' && body.idempotencyKey.length > 0, body);

  console.log('\n── 2. Native POL carries no token ────────────────────────────');
  bodies.length = 0;
  await polygon.sendPayment({ chain: 'POLYGON', destination: POLYGON_DEST, amount: '1000' });
  check('no token field for native POL', bodies[0] && bodies[0].params.token === undefined, bodies[0]);

  console.log('\n── 3. No wallet on the chain fails locally ───────────────────');
  bodies.length = 0;
  const none = await polygon.sendPayment({ chain: 'SOLANA', destination: SOLANA_WALLET, amount: '1' });
  check('a user with no Solana wallet gets an error', none.status === 'error' && /Solana wallet/.test(none.details), none);
  check('  without calling the backend', bodies.length === 0);

  console.log('\n── 4. A Solana payment keeps `mint` ──────────────────────────');
  const solana = await clientWith(
    [{ type: 'internal', provider: 'email', address: SOLANA_WALLET, chain: 'SOLANA' }],
    'pk_smoke_send_solana',
  );
  bodies.length = 0;
  await solana.sendPayment({
    chain: 'SOLANA',
    destination: SOLANA_WALLET,
    amount: '5',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  });
  check(
    'the SPL mint travels as `mint`',
    bodies[0] && bodies[0].params.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    bodies[0],
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
