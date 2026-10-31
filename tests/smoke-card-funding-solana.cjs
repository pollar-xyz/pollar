// @pollar smoke test: funding a card from Solana. `fundCard({ chain: 'SOLANA' })`
// asks for that chain; an external wallet signs the transfer the backend built
// and submits it under its idempotency key (/tx/submit), and the funding is
// read again; a wallet that declines leaves the funding `cancelled` with nothing
// submitted; a custodial wallet's funding comes back as is.
//
// Run with `node tests/smoke-card-funding-solana.cjs` after the build. Mocks
// `fetch`, `window` and `localStorage`, so no network is needed.

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

const SOLANA_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const UNSIGNED = 'aa'.repeat(8);
const KEY = 'card-funding-fund-1';

async function clientWith(wallets, apiKey, sessionWallet) {
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
      wallet: sessionWallet,
      wallets,
    }),
  );
  const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test' });
  await client.ready();
  return client;
}

const funding = (overrides = {}) => ({
  id: 'fund-1',
  status: 'CREATED',
  amount: '1',
  asset: 'USDC',
  chain: 'SOLANA',
  depositAddress: '6m2YhU678QMqN7PPtvMNNvK39iEVKNckzegiWmsfmC84',
  chainId: 900,
  sourceTxHash: null,
  stellarTxHash: null,
  burnTxHash: null,
  polygonMintTxHash: null,
  providerTxId: null,
  error: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

(async () => {
  const calls = [];
  let pending = { kind: 'solana', unsignedTransaction: UNSIGNED, idempotencyKey: KEY, lastValidBlockHeight: 100 };
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
    if (url.pathname.endsWith('/cards/funding') && req.method === 'POST') {
      return json(201, {
        success: true,
        code: 'SDK_CARDS_FUNDING_CREATED',
        content: { funding: funding({ chain: body.chain ?? 'STELLAR' }), ...(pending && { pendingSignature: pending }) },
      });
    }
    if (url.pathname.endsWith('/cards/funding/fund-1')) {
      return json(200, {
        success: true,
        code: 'SDK_CARDS_FUNDING_STATUS',
        content: { funding: funding({ status: 'SENT', sourceTxHash: 'sig-1' }) },
      });
    }
    if (url.pathname.endsWith('/tx/submit')) {
      return json(200, {
        success: true,
        code: 'SDK_TX_SUBMIT',
        content: { hash: 'sig-1', status: 'SUCCESS', summary: {}, sponsored: true },
      });
    }
    return json(200, { success: true, content: {} });
  };

  console.log('\n-- 1. An external wallet signs the built transfer and submits it under its key --');
  const external = await clientWith(
    [{ type: 'external', provider: 'phantom', address: SOLANA_WALLET, chain: 'SOLANA' }],
    'pk_smoke_card_funding_solana_external',
    { type: 'external', provider: 'phantom', address: SOLANA_WALLET, chain: 'SOLANA' },
  );
  const signedBy = [];
  external._walletAdapter = {
    type: 'phantom',
    signSolanaTransaction: async (bytes, chain) => {
      signedBy.push({ bytes: [...bytes], chain });
      return Uint8Array.from([...bytes, 0xbb]);
    },
  };
  const funded = await external.fundCard({ amount: '1', chain: 'SOLANA' });
  const create = calls.find((c) => c.path.endsWith('/cards/funding') && c.method === 'POST');
  const submit = calls.find((c) => c.path.endsWith('/tx/submit'));
  check('the funding is asked for on Solana', create && create.body.chain === 'SOLANA' && create.body.amount === '1', create);
  check('the wallet signs the transfer as built', signedBy.length === 1 && signedBy[0].bytes.length === 8, signedBy);
  check(
    'the submit carries the signed transfer under the funding key',
    submit &&
      submit.body.chain === 'SOLANA' &&
      submit.body.signedTransaction === `${UNSIGNED}bb` &&
      submit.body.idempotencyKey === KEY,
    submit && submit.body,
  );
  check(
    'fundCard returns the funding read again after the send',
    funded.status === 'ok' && funded.funding.status === 'SENT' && funded.funding.sourceTxHash === 'sig-1',
    funded,
  );

  console.log('\n-- 2. A wallet that declines to sign cancels, and nothing is submitted --');
  external._walletAdapter = {
    type: 'phantom',
    signSolanaTransaction: async () => {
      throw new Error('User rejected the request.');
    },
  };
  calls.length = 0;
  const declined = await external.fundCard({ amount: '1', chain: 'SOLANA' });
  check('fundCard is cancelled', declined.status === 'cancelled' && declined.funding.id === 'fund-1', declined);
  check('  without submitting', !calls.some((c) => c.path.endsWith('/tx/submit')));

  console.log('\n-- 3. A custodial wallet pays on the server: no signature asked --');
  pending = null;
  const custodial = await clientWith(
    [{ type: 'internal', provider: 'email', address: SOLANA_WALLET, chain: 'SOLANA' }],
    'pk_smoke_card_funding_solana_custodial',
    { type: 'internal', provider: 'email', address: SOLANA_WALLET, chain: 'SOLANA' },
  );
  calls.length = 0;
  const paid = await custodial.fundCard({ amount: '1', chain: 'SOLANA' });
  check('fundCard returns the funding as created', paid.status === 'ok' && paid.funding.status === 'CREATED', paid);
  check('  without signing or submitting', !calls.some((c) => c.path.endsWith('/tx/submit')));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
