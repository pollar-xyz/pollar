// @pollar smoke test — built-in auth providers + wallet-adapter dispatch.
//
// Run with `node tests/smoke-providers.cjs` after `pnpm build`. Mocks `fetch`,
// `localStorage` and `window` so PollarClient runs as if in a browser.
//
// NOTE: `config.providers` (registering arbitrary custom auth providers) was
// REMOVED when wallet integrations were unified into `config.walletAdapters`.
// So this file now covers (a) the built-in email provider via `login()` /
// `providerAction()`, and (b) the wallet-adapter dispatch path that replaced
// custom providers (`login({ provider: adapter.type })` -> loginWithAdapter).

const path = require('node:path');

globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: () => {},
  removeEventListener: () => {},
  open: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

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

async function waitFor(cond, timeoutMs = 1000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condition not met within timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

(async () => {
  const apiKey = 'pk_smoke_providers';

  // fetch mock: only the endpoints the email flow + construction touch.
  const calls = [];
  globalThis.fetch = async (req) => {
    const url = req.url;
    let body = null;
    try {
      body = await req.clone().json();
    } catch {}
    calls.push({ url, method: req.method, body });
    if (url.includes('/auth/session') && !url.includes('/status') && !url.includes('/resume')) {
      return new Response(JSON.stringify({ success: true, content: { clientSessionId: 'cs_test' } }), { status: 200 });
    }
    // /auth/email and /auth/email/verify-code: success but NO SDK_EMAIL_CODE_VERIFIED
    // code, so verify lands on the generic EMAIL_VERIFY_FAILED branch (block 4).
    if (url.includes('/auth/email')) {
      return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
  };

  // A wallet adapter whose isAvailable() parks at a gate — to prove a cancel
  // during the wallet flow maps to `idle` (AbortError rethrow), not an error.
  let releaseGate;
  const gate = new Promise((r) => {
    releaseGate = r;
  });
  let gatedProbed = false;
  const gatedAdapter = {
    type: 'gated',
    meta: { label: 'Gated' },
    isAvailable: async () => {
      await gate;
      gatedProbed = true;
      return false;
    },
    connect: async () => ({ address: 'G' }),
    signTransaction: async () => ({ signedTxXdr: 'x' }),
    signAuthEntry: async () => ({ signedAuthEntry: 'x' }),
  };

  // A wallet adapter whose isAvailable() throws SYNCHRONOUSLY — must be routed to
  // an error state, not thrown out of login()'s public API.
  const throwingAdapter = {
    type: 'throwing',
    meta: { label: 'Throwing' },
    isAvailable: () => {
      throw new Error('sync boom');
    },
    connect: async () => ({ address: 'G' }),
    signTransaction: async () => ({ signedTxXdr: 'x' }),
    signAuthEntry: async () => ({ signedAuthEntry: 'x' }),
  };

  console.log('── 1. Construction with wallet adapters ──────────────────────');
  const client = new sdk.PollarClient({
    apiKey,
    storage: sdk.createMemoryAdapter(),
    baseUrl: 'https://x.test',
    walletAdapters: [gatedAdapter, throwingAdapter],
  });
  await client.ready();
  check('client.ready() resolves', true);
  check(
    'listWalletAdapters() reports the built-ins + the two custom adapters',
    client
      .listWalletAdapters()
      .map((a) => a.id)
      .sort()
      .join(',') === 'albedo,freighter,gated,throwing',
    JSON.stringify(client.listWalletAdapters().map((a) => a.id)),
  );

  console.log('\n── 2. built-in email provider works via login() ──────────────');
  calls.length = 0;
  client.login({ provider: 'email', email: 'a@b.test' });
  await waitFor(() => calls.some((c) => c.url.includes('/auth/email')));
  check(
    'email login created a session',
    calls.some((c) => c.url.endsWith('/auth/session')),
  );
  check(
    '  POST /auth/email fired with the address',
    calls.find((c) => c.url.includes('/auth/email'))?.body?.email === 'a@b.test',
  );

  console.log('\n── 3. unknown provider → clean error state ───────────────────');
  client.login({ provider: 'does_not_exist' });
  await waitFor(() => client.getAuthState().step === 'error');
  check('unknown provider sets error state', client.getAuthState().step === 'error');

  console.log('\n── 4. email verify generic failure is retryable (B1) ─────────');
  client.login({ provider: 'email', email: 'retry@b.test' });
  await waitFor(() => client.getAuthState().step === 'entering_code');
  client.verifyEmailCode('000000');
  await waitFor(() => client.getAuthState().errorCode === sdk.AUTH_ERROR_CODES.EMAIL_VERIFY_FAILED);
  check(
    'generic verify failure → EMAIL_VERIFY_FAILED',
    client.getAuthState().errorCode === sdk.AUTH_ERROR_CODES.EMAIL_VERIFY_FAILED,
  );
  check('  error state carries clientSessionId so it can retry', !!client.getAuthState().clientSessionId);
  let verifyThrew = false;
  try {
    client.verifyEmailCode('111111'); // retryable now — no synchronous PollarFlowError
  } catch {
    verifyThrew = true;
  }
  check('  verifyEmailCode is retryable after a generic failure (no throw)', verifyThrew === false);

  console.log('\n── 5. providerAction rejects an unknown action ───────────────');
  let actionThrew = false;
  try {
    client.providerAction('email', 'nope');
  } catch (e) {
    actionThrew = e && e.code === 'INVALID_FLOW';
  }
  check('unknown action throws PollarFlowError(INVALID_FLOW)', actionThrew);

  console.log('\n── 6. cancel during a wallet flow maps to idle, not error ────');
  client.login({ provider: 'gated' }); // parks at adapter.isAvailable()
  client.cancelLogin(); // aborts the signal
  check('cancelLogin set idle', client.getAuthState().step === 'idle', client.getAuthState().step);
  releaseGate(); // adapter.isAvailable() resolves now (flow already aborted)
  await waitFor(() => gatedProbed);
  await new Promise((r) => setTimeout(r, 10));
  check(
    '  the cancelled wallet flow did NOT clobber idle (AbortError → idle)',
    client.getAuthState().step === 'idle',
    client.getAuthState().step,
  );

  console.log('\n── 7. a wallet adapter that throws synchronously is handled ───');
  let loginThrew = false;
  try {
    client.login({ provider: 'throwing' }); // adapter.isAvailable() throws synchronously
  } catch {
    loginThrew = true;
  }
  check('login() did not throw out of the public API', loginThrew === false);
  await waitFor(() => client.getAuthState().errorCode === sdk.AUTH_ERROR_CODES.WALLET_CONNECT_FAILED);
  check(
    '  the synchronous throw was routed to a WALLET_CONNECT_FAILED error state',
    client.getAuthState().step === 'error' && client.getAuthState().errorCode === sdk.AUTH_ERROR_CODES.WALLET_CONNECT_FAILED,
    `${client.getAuthState().step}/${client.getAuthState().errorCode}`,
  );

  console.log('\n── 8. email flow validates a blank email before the API ──────');
  calls.length = 0;
  client.login({ provider: 'email', email: '' }); // missing email
  await waitFor(() => client.getAuthState().errorCode === sdk.AUTH_ERROR_CODES.EMAIL_SEND_FAILED);
  check(
    'blank email → error (EMAIL_SEND_FAILED), not an opaque API 400',
    client.getAuthState().step === 'error' && client.getAuthState().errorCode === sdk.AUTH_ERROR_CODES.EMAIL_SEND_FAILED,
  );
  check(
    '  no blank email was POSTed to /auth/email',
    !calls.some((c) => c.url.includes('/auth/email') && !c.url.includes('verify-code')),
    JSON.stringify(calls.map((c) => c.url)),
  );
  check(
    '  and no orphaned /auth/session was minted (providers.ts up-front guard)',
    !calls.some((c) => c.url.endsWith('/auth/session')),
    JSON.stringify(calls.map((c) => c.url)),
  );

  console.log(`\n${fail === 0 ? '✅' : '❌'} providers smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
