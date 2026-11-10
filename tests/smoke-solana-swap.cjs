// @pollar smoke test: Solana swaps. The venues and the quote are asked for with
// `chain: 'SOLANA'`; an external wallet's swap is built by the backend
// (/swap/build), signed in the connected wallet and submitted under the same
// idempotency key (/tx/submit); a co-signed wallet's build answers with a
// co-sign request instead.
//
// Run with `node tests/smoke-solana-swap.cjs` after the build. Mocks `fetch`,
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

const SOLANA_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const UNSIGNED = 'aa'.repeat(8);

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
      wallet: sessionWallet ?? { type: 'internal', provider: 'email', address: null, chain: 'STELLAR' },
      wallets,
    }),
  );
  const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test' });
  await client.ready();
  return client;
}

const quote = {
  chain: 'SOLANA',
  provider: 'titan',
  inputMint: SOL,
  outputMint: USDC,
  inAmount: '1000000000',
  outAmount: '150000000',
  minOut: '148500000',
  priceImpactPct: null,
  route: { hops: ['Titan'] },
};

(async () => {
  const calls = [];
  let buildAnswer = null;
  globalThis.fetch = async (req) => {
    const url = new URL(req.url);
    const body = req.method === 'GET' ? null : JSON.parse((await req.text()) || 'null');
    calls.push({ method: req.method, path: url.pathname, query: url.search, body });
    // The app's dashboard signs without asking: these checks are about the swap, not the prompt.
    if (url.pathname.endsWith('/applications/config')) {
      return new Response(
        JSON.stringify({
          success: true,
          content: { application: { signConfirmation: { mode: 'AUTO', windowSeconds: 0, maxUsd: '0' } } },
        }),
        { status: 200 },
      );
    }
    if (url.pathname.endsWith('/swap/config')) {
      return new Response(
        JSON.stringify({ success: true, code: 'SDK_SWAP_CONFIG', content: { venues: ['jupiter', 'titan'] } }),
        { status: 200 },
      );
    }
    if (url.pathname.endsWith('/swap/quote')) {
      return new Response(
        JSON.stringify({ success: true, code: 'SDK_SWAP_QUOTE', content: { quotes: [quote], best: 'titan' } }),
        { status: 200 },
      );
    }
    if (url.pathname.endsWith('/swap/build')) return buildAnswer();
    if (url.pathname.endsWith('/tx/submit')) {
      return new Response(
        JSON.stringify({
          success: true,
          code: 'SDK_TX_SUBMIT',
          content: { hash: 'sig-1', status: 'SUCCESS', summary: {}, sponsored: true },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
  };

  console.log('\n-- 1. Venues and quotes are asked for on Solana --');
  const external = await clientWith(
    [{ type: 'external', provider: 'phantom', address: SOLANA_WALLET, chain: 'SOLANA' }],
    'pk_smoke_swap_solana_external',
    { type: 'external', provider: 'phantom', address: null, chain: 'STELLAR' },
  );
  const venues = await external.getSolanaSwapConfig();
  check('the Solana venues come back', venues.join() === 'jupiter,titan', venues);
  check('  asked for with ?chain=SOLANA', calls.at(-1).query === '?chain=SOLANA', calls.at(-1));
  const quotes = await external.getSolanaSwapQuote({ inputMint: SOL, outputMint: USDC, amount: '1000000000' });
  check('the quotes come back', quotes.length === 1 && quotes[0].provider === 'titan', quotes);
  const quoted = calls.at(-1).body;
  check(
    'the quote body names the chain and the mints',
    quoted.chain === 'SOLANA' && quoted.inputMint === SOL && quoted.outputMint === USDC && quoted.amount === '1000000000',
    quoted,
  );

  console.log('\n-- 2. An external wallet signs the build and submits it under its key --');
  buildAnswer = () =>
    new Response(
      JSON.stringify({
        success: true,
        code: 'SDK_TX_BUILT',
        content: {
          chain: 'SOLANA',
          quote,
          unsignedTransaction: UNSIGNED,
          idempotencyKey: 'from-build',
          recentBlockhash: 'hash',
          lastValidBlockHeight: 100,
          feeLamports: '5000',
          feePayer: SOLANA_WALLET,
          sponsored: false,
        },
      }),
      { status: 200 },
    );
  const signedBy = [];
  external._walletAdapter = {
    type: 'phantom',
    signSolanaTransaction: async (bytes, chain) => {
      signedBy.push({ bytes: [...bytes], chain });
      return Uint8Array.from([...bytes, 0xbb]);
    },
  };
  calls.length = 0;
  const swapped = await external.swapSolana(quote, { slippageBps: 100 });
  check('the swap succeeds', swapped.status === 'success' && swapped.hash === 'sig-1', swapped);
  const build = calls.find((c) => c.path.endsWith('/swap/build'));
  const submit = calls.find((c) => c.path.endsWith('/tx/submit'));
  check(
    'the build carries the quoted venue, mints and amount',
    build &&
      build.body.chain === 'SOLANA' &&
      build.body.provider === 'titan' &&
      build.body.inputMint === SOL &&
      build.body.outputMint === USDC &&
      build.body.amount === '1000000000' &&
      build.body.slippageBps === 100,
    build && build.body,
  );
  check(
    'the wallet signs the unsigned transaction as built',
    signedBy.length === 1 && signedBy[0].bytes.length === 8,
    signedBy,
  );
  check(
    'the submit carries the signed transaction under the build key',
    submit &&
      submit.body.chain === 'SOLANA' &&
      submit.body.signedTransaction === `${UNSIGNED}bb` &&
      submit.body.idempotencyKey === build.body.idempotencyKey,
    submit && submit.body,
  );

  console.log('\n-- 3. A refused build is the error, and nothing is signed --');
  buildAnswer = () =>
    new Response(JSON.stringify({ success: false, code: 'SDK_SWAP_NO_ROUTE', message: 'titan has no route' }), {
      status: 422,
    });
  signedBy.length = 0;
  calls.length = 0;
  const refused = await external.swapSolana(quote);
  check('the swap fails with the backend code', refused.status === 'error' && refused.code === 'SDK_SWAP_NO_ROUTE', refused);
  check('  without signing or submitting', signedBy.length === 0 && !calls.some((c) => c.path.endsWith('/tx/submit')));

  console.log('\n-- 4. No Solana wallet fails locally --');
  const none = await clientWith([], 'pk_smoke_swap_solana_none');
  calls.length = 0;
  const missing = await none.swapSolana(quote);
  check(
    'a user with no Solana wallet gets an error',
    missing.status === 'error' && /Solana wallet/.test(missing.details),
    missing,
  );
  check('  without calling the backend', !calls.some((c) => c.path.endsWith('/swap/build')));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
