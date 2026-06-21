// @pollar smoke test — custom auth providers: registry, dispatch, context.
//
// Run with `node tests/smoke-providers.cjs` after `pnpm build`. Mocks `fetch`,
// `localStorage` and `window` so PollarClient runs as if in a browser, and
// exercises the new pluggable-provider surface end-to-end without a real server.

const path = require('node:path');

globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: () => {},
  removeEventListener: () => {},
  // OAuth default opener calls window.open; we inject our own opener below, but
  // keep a stub so nothing throws if a path reaches it.
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

  // ─── fetch mock ────────────────────────────────────────────────────────────
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
    if (url.includes('/auth/email')) {
      return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
    }
    if (url.includes('/auth/external')) {
      // Fail when the caller asks us to (lets us assert the error path).
      const ok = !(body && body.shouldFail);
      return new Response(JSON.stringify({ success: ok }), { status: ok ? 200 : 401 });
    }
    return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
  };

  // ─── A custom provider that records the context it receives ─────────────────
  const recorder = {
    ctx: null,
    options: null,
    sessionId: undefined,
    exchanged: undefined,
  };
  const recorderProvider = {
    id: 'recorder',
    async login(ctx, options) {
      recorder.ctx = ctx;
      recorder.options = options;
      const clientSessionId = await ctx.createSession();
      recorder.sessionId = clientSessionId;
      if (clientSessionId) {
        recorder.exchanged = await ctx.exchangeExternalToken(clientSessionId, {
          token: 'ext_token',
          shouldFail: options.shouldFail === true,
        });
      }
      // Deliberately NOT calling ctx.authenticate() — that path needs the
      // session-status stream, out of scope for this dispatch smoke test.
    },
    actions: {
      ping: async (ctx, payload) => {
        recorder.pinged = payload;
      },
    },
  };

  // Override the built-in google provider to prove config wins by id.
  let googleOverridden = false;
  const fakeGoogle = {
    id: 'google',
    async login() {
      googleOverridden = true;
    },
  };

  console.log('── 1. Construction with custom providers ─────────────────────');
  const client = new sdk.PollarClient({
    apiKey,
    storage: sdk.createMemoryAdapter(),
    baseUrl: 'https://x.test',
    providers: [recorderProvider, fakeGoogle],
    // Stub the OAuth opener so the github built-in resolves without a popup.
    openAuthUrl: async () => {
      /* never calls getUrl → flow returns before authenticate() */
    },
  });
  await client.ready();
  check('client.ready() resolves with custom providers', true);

  console.log('\n── 2. login() dispatches to a custom provider with a context ─');
  client.login({ provider: 'recorder', foo: 'bar' });
  await waitFor(() => recorder.exchanged !== undefined);
  check('custom provider.login() was invoked', recorder.ctx !== null);
  check('  options passed through verbatim', recorder.options?.foo === 'bar');
  check('  ctx.createSession() returned the backend clientSessionId', recorder.sessionId === 'cs_test');
  check('  POST /auth/session fired', calls.some((c) => c.url.endsWith('/auth/session')));
  check('  ctx.exchangeExternalToken() posted /auth/external', calls.some((c) => c.url.includes('/auth/external')));
  check('  external body merged clientSessionId + provider payload', (() => {
    const ext = calls.find((c) => c.url.includes('/auth/external'));
    return ext?.body?.clientSessionId === 'cs_test' && ext?.body?.token === 'ext_token';
  })());
  check('  exchange returned true on success', recorder.exchanged === true);

  console.log('\n── 3. context exposes only the curated facade ────────────────');
  const ctx = recorder.ctx;
  for (const m of ['createSession', 'authenticate', 'exchangeExternalToken', 'startHostedOAuth', 'setAuthState']) {
    check(`  ctx.${m} is a function`, typeof ctx[m] === 'function');
  }
  check('  ctx.signal is an AbortSignal', typeof ctx.signal?.aborted === 'boolean');
  check('  ctx.apiKey / basePath exposed', ctx.apiKey === apiKey && typeof ctx.basePath === 'string');
  check('  no FlowDeps internals leak (storeWalletAdapter)', ctx.storeWalletAdapter === undefined);
  check('  no FlowDeps internals leak (resolveWalletAdapter)', ctx.resolveWalletAdapter === undefined);

  console.log('\n── 4. exchangeExternalToken failure → false + error state ────');
  recorder.exchanged = undefined;
  client.login({ provider: 'recorder', shouldFail: true });
  await waitFor(() => recorder.exchanged !== undefined);
  check('exchange returned false on backend failure', recorder.exchanged === false);
  check('  authState moved to error', client.getAuthState().step === 'error');
  check('  errorCode = EXTERNAL_AUTH_FAILED', client.getAuthState().errorCode === sdk.AUTH_ERROR_CODES.EXTERNAL_AUTH_FAILED);

  console.log('\n── 5. config provider overrides a built-in by id ────────────');
  client.login({ provider: 'google' });
  await waitFor(() => googleOverridden);
  check('config google provider shadowed the built-in', googleOverridden === true);

  console.log('\n── 6. built-in email provider still works via login() ───────');
  calls.length = 0;
  client.login({ provider: 'email', email: 'a@b.test' });
  await waitFor(() => calls.some((c) => c.url.includes('/auth/email')));
  check('email login created a session', calls.some((c) => c.url.endsWith('/auth/session')));
  check('  POST /auth/email fired with the address', (() => {
    const e = calls.find((c) => c.url.includes('/auth/email'));
    return e?.body?.email === 'a@b.test';
  })());

  console.log('\n── 7. providerAction dispatches; unknowns are rejected ───────');
  client.providerAction('recorder', 'ping', { hi: 1 });
  await waitFor(() => recorder.pinged);
  check('providerAction invoked the named action', recorder.pinged?.hi === 1);
  let threw = false;
  try {
    client.providerAction('recorder', 'nope');
  } catch (e) {
    threw = e && e.code === 'INVALID_FLOW';
  }
  check('unknown action throws PollarFlowError', threw);

  console.log('\n── 8. unknown provider → clean error state ───────────────────');
  client.login({ provider: 'does_not_exist' });
  await waitFor(() => client.getAuthState().step === 'error');
  check('unknown provider sets error state', client.getAuthState().step === 'error');

  console.log('\n── 9. email verify generic failure is retryable (B1) ─────────');
  // login(email) creates the session and sends the code → step 'entering_code'.
  client.login({ provider: 'email', email: 'retry@b.test' });
  await waitFor(() => client.getAuthState().step === 'entering_code');
  // The mock answers /auth/email/verify-code with success:true but NO
  // SDK_EMAIL_CODE_VERIFIED code → the SDK's generic EMAIL_VERIFY_FAILED branch.
  client.verifyEmailCode('000000');
  await waitFor(() => client.getAuthState().step === 'error');
  check(
    'generic verify failure → EMAIL_VERIFY_FAILED',
    client.getAuthState().errorCode === sdk.AUTH_ERROR_CODES.EMAIL_VERIFY_FAILED,
    client.getAuthState().errorCode,
  );
  check('  error state carries clientSessionId so it can retry', !!client.getAuthState().clientSessionId);
  let verifyThrew = false;
  try {
    client.verifyEmailCode('111111'); // must be retryable now — no synchronous PollarFlowError
  } catch {
    verifyThrew = true;
  }
  check('  verifyEmailCode is retryable after a generic failure (no throw)', verifyThrew === false);

  console.log(`\n${fail === 0 ? '✅' : '❌'} providers smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
