// @pollar smoke test: a session with no wallet (an app that creates wallets on
// demand) and PollarClient.createWallet().
//
// Run with `node tests/smoke-wallet-less.cjs` after the build. Mocks `fetch`,
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

const ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

(async () => {
  const apiKey = 'pk_smoke_wallet_less';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  const apiKeyHash = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const sessionKey = `pollar:${apiKeyHash}:session`;

  const storage = sdk.createMemoryAdapter();
  await storage.set(
    sessionKey,
    JSON.stringify({
      clientSessionId: 'cs',
      userId: 'u',
      status: 'CONSUMED',
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
      user: { ready: true },
      wallet: { type: 'internal', provider: 'email', address: null, chain: 'STELLAR', provisioning: 'NONE' },
      wallets: [],
    }),
  );

  const calls = [];
  let provisionResponse = { status: 201, body: null };
  globalThis.fetch = async (req) => {
    const url = new URL(req.url);
    calls.push(url.pathname);
    if (url.pathname.endsWith('/wallet/provision')) {
      return new Response(JSON.stringify(provisionResponse.body), { status: provisionResponse.status });
    }
    return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
  };

  console.log('\n── 1. A session with no wallet restores as signed in ─────────');
  const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test' });
  await client.ready();
  check('the session restores', client.getAuthState().step === 'authenticated', client.getAuthState());
  check('getWallet() is null', client.getWallet() === null);
  check('hasWallet() is false', client.hasWallet() === false);
  check('getWallets() is empty', client.getWallets().length === 0);

  console.log('\n── 2. Signing without a wallet fails locally with the code ───');
  const before = calls.length;
  const signed = await client.signTx('AAAA');
  check('signTx returns an error outcome', signed.status === 'error', signed);
  check('  with SDK_WALLET_REQUIRED', signed.code === sdk.WALLET_REQUIRED_CODE, signed);
  check('  that isWalletRequired() recognizes', sdk.isWalletRequired(signed) === true);
  check('  without calling the backend', !calls.slice(before).some((p) => p.includes('/tx/')), calls.slice(before));

  console.log('\n── 3. createWallet() fills the session ───────────────────────');
  const wallet = {
    type: 'internal',
    provider: 'email',
    publicKey: ADDRESS,
    address: ADDRESS,
    chain: 'STELLAR',
    network: 'testnet',
    existsOnStellar: false,
    provisioning: 'CREATING',
  };
  provisionResponse = {
    status: 201,
    body: { success: true, code: 'SDK_WALLET_PROVISIONED', content: { created: true, wallet, wallets: [wallet] } },
  };
  const states = [];
  const unsubscribe = client.onWalletStateChange((p) => states.push(p));
  const created = await client.createWallet();
  check('returns the wallet', created.address === ADDRESS, created);
  check('hasWallet() turns true', client.hasWallet() === true);
  check(
    'getWallets() lists it',
    client.getWallets().some((w) => w.address === ADDRESS),
  );
  check('the auth state carries it', client.getAuthState().session?.wallet?.address === ADDRESS);
  check('subscribers hear CREATING', states.includes('CREATING'), states);
  const persisted = JSON.parse(await storage.get(sessionKey));
  check('the stored session carries it', persisted.wallet.address === ADDRESS, persisted.wallet);
  unsubscribe();

  console.log('\n── 4. createWallet() surfaces the backend refusal ─────────────');
  provisionResponse = {
    status: 403,
    body: { success: false, code: 'SDK_WALLET_PROVISIONING_DISABLED' },
  };
  let thrown = null;
  try {
    await client.createWallet();
  } catch (err) {
    thrown = err;
  }
  check('throws a PollarApiError', sdk.isPollarApiError(thrown), thrown);
  check('  with the backend code', thrown?.code === 'SDK_WALLET_PROVISIONING_DISABLED', thrown);

  client.destroy();

  console.log('\n── 5. A Solana login has a wallet but no Stellar one ───────────');
  const SOLANA = 'BEiJauJ3W1vytWHmfTdtRgR9wYZmV3Xo2BvhNHCgTYmy';
  const solStorage = sdk.createMemoryAdapter();
  await solStorage.set(
    sessionKey,
    JSON.stringify({
      clientSessionId: 'cs-sol',
      userId: 'u',
      status: 'CONSUMED',
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
      user: { ready: true },
      wallet: { type: 'external', provider: 'wallet', address: null, chain: 'STELLAR' },
      wallets: [{ type: 'external', address: SOLANA, chain: 'SOLANA' }],
    }),
  );
  const sol = new sdk.PollarClient({ apiKey, storage: solStorage, baseUrl: 'https://x.test' });
  await sol.ready();
  check('the session restores', sol.getAuthState().step === 'authenticated');
  check('getWallet() (Stellar) is null', sol.getWallet() === null);
  check('hasWallet() is true', sol.hasWallet() === true);
  check('getWallets() has the Solana wallet', sol.getWallets()[0]?.address === SOLANA, sol.getWallets());
  sol.destroy();

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
