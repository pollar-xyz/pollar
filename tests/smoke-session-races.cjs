// @pollar smoke test — session-lifecycle race safety (Tier-1 hardening).
//
// Run with `node tests/smoke-session-races.cjs` after `npm run build`. Mocks
// `fetch`/`localStorage`/`window` so PollarClient runs as if in a browser and
// no network is required. Each block exercises one of the concurrency fixes:
//
//   A. destroy() during an in-flight refresh discards the rotated token
//      (no write-after-teardown, no resurrected session).
//   B. refresh() is a no-op after destroy() (no zombie network call).
//   C. getAuthState() returns a defensive clone — mutating it can't corrupt
//      the live _session the request middleware signs with.
//   D. logout() aborts an in-flight /auth/session/resume so it can't re-emit
//      `authenticated` after the client has gone `idle`.
//   E. A concurrent request does NOT inherit/throw a rejecting refresh.

const path = require('node:path');

globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: () => {},
  removeEventListener: () => {},
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

// A delay that rejects with an AbortError when the request's signal fires, so
// the resume GET behaves like a real cancellable fetch.
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(t);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        return;
      }
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }
  });
}

async function apiKeyHashOf(apiKey) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  return Array.from(new Uint8Array(digest).slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function freshSession(accessToken = 'AT', expiresInSec = 600) {
  return JSON.stringify({
    clientSessionId: 'cs',
    userId: 'u',
    status: 'CONSUMED',
    token: { accessToken, refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + expiresInSec },
    user: { ready: true },
    wallet: { type: 'internal', address: null },
  });
}

// Mutable mock knobs, reset per block.
const mock = {
  calls: [],
  refreshDelayMs: 0,
  refreshStatus: 200,
  resumeDelayMs: 0,
};

globalThis.fetch = async (req) => {
  const headers = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  mock.calls.push({ url: req.url, method: req.method, headers });

  if (req.url.includes('/auth/refresh')) {
    if (mock.refreshDelayMs) await delay(mock.refreshDelayMs, req.signal);
    if (mock.refreshStatus !== 200) {
      return new Response(JSON.stringify({ success: false, message: 'nope' }), { status: mock.refreshStatus });
    }
    return new Response(
      JSON.stringify({
        success: true,
        content: { token: { accessToken: 'NEW_AT', refreshToken: 'NEW_RT', expiresAt: Math.floor(Date.now() / 1000) + 600 } },
      }),
      { status: 200 },
    );
  }
  if (req.url.includes('/auth/session/resume')) {
    if (mock.resumeDelayMs) await delay(mock.resumeDelayMs, req.signal);
    return new Response(JSON.stringify({ success: true, content: { mail: 'a@b.c' } }), { status: 200 });
  }
  // tx/history, logout, everything else.
  return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
};

async function makeClient(apiKey, { seed = true, accessToken = 'AT', expiresInSec = 600, waitResume = true } = {}) {
  const storage = sdk.createMemoryAdapter();
  const hash = await apiKeyHashOf(apiKey);
  const sessionKey = `pollar:${hash}:session`;
  if (seed) await storage.set(sessionKey, freshSession(accessToken, expiresInSec));
  const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logLevel: 'silent' });
  await client.ready();
  if (seed && waitResume) {
    await waitFor(() => mock.calls.some((c) => c.url.includes('/auth/session/resume')));
  }
  return { client, storage, sessionKey };
}

(async () => {
  // ── A. destroy() during in-flight refresh discards the rotated token ───────
  console.log('── A. destroy() mid-refresh discards the result ──────────────');
  {
    mock.calls = [];
    mock.refreshDelayMs = 80;
    mock.refreshStatus = 200;
    const { client, storage, sessionKey } = await makeClient('pk_race_A');
    mock.calls = [];

    const rp = client.refresh(); // in-flight (resolves in ~80ms)
    client.destroy(); // teardown while the refresh is on the wire
    await rp;

    const persisted = JSON.parse(await storage.get(sessionKey));
    check('refresh did NOT write the rotated token after destroy', persisted.token.accessToken === 'AT', persisted.token.accessToken);

    const before = mock.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    check('no zombie refresh fired after destroy', mock.calls.length === before);
    mock.refreshDelayMs = 0;
  }

  // ── B. refresh() is a no-op after destroy() ────────────────────────────────
  console.log('\n── B. refresh() no-ops after destroy() ───────────────────────');
  {
    mock.calls = [];
    const { client } = await makeClient('pk_race_B');
    client.destroy();
    mock.calls = [];
    await client.refresh();
    const refreshCalls = mock.calls.filter((c) => c.url.includes('/auth/refresh'));
    check('refresh() after destroy fires no network call', refreshCalls.length === 0);
  }

  // ── C. getAuthState() returns a defensive clone ────────────────────────────
  console.log('\n── C. getAuthState() is a defensive clone ────────────────────');
  {
    mock.calls = [];
    const { client } = await makeClient('pk_race_C');
    const a = client.getAuthState();
    const b = client.getAuthState();
    check('two getAuthState() calls return distinct objects', a !== b);
    check('  and distinct session objects', a.step === 'authenticated' && b.step === 'authenticated' && a.session !== b.session);

    // Attempt to corrupt the live session through the returned object.
    if (a.step === 'authenticated') a.session.token.accessToken = 'HACKED';
    mock.calls = [];
    await client.fetchTxHistory();
    const auth = mock.calls.find((c) => c.url.includes('/tx/history'))?.headers.authorization;
    check('request still signs with the real token, not the mutated one', auth === 'DPoP AT', auth);
    client.destroy();
  }

  // ── D. logout() aborts an in-flight resume (no authenticated after idle) ───
  console.log('\n── D. logout() aborts in-flight resume ───────────────────────');
  {
    mock.calls = [];
    mock.resumeDelayMs = 120; // resume stays in flight long enough to race logout
    const states = [];
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf('pk_race_D');
    await storage.set(`pollar:${hash}:session`, freshSession());
    const client = new sdk.PollarClient({ apiKey: 'pk_race_D', storage, baseUrl: 'https://x.test', logLevel: 'silent' });
    client.onAuthStateChange((s) => states.push(s.step + (s.step === 'authenticated' ? `:${s.verified}` : '')));
    await client.ready();
    await waitFor(() => mock.calls.some((c) => c.url.includes('/auth/session/resume')));

    await client.logout(); // resume is still in flight (120ms)
    await new Promise((r) => setTimeout(r, 200)); // let the (aborted) resume settle

    check('final auth state is idle', client.getAuthState().step === 'idle', client.getAuthState().step);
    check('  no authenticated emission after logout went idle', states.lastIndexOf('idle') === states.length - 1, JSON.stringify(states));
    mock.resumeDelayMs = 0;
    client.destroy();
  }

  // ── E. concurrent request does not inherit a rejecting refresh ─────────────
  console.log('\n── E. concurrent request survives a rejecting refresh ────────');
  {
    mock.calls = [];
    mock.refreshDelayMs = 60;
    mock.refreshStatus = 401; // refresh will reject → _doRefresh throws + clears session
    const { client } = await makeClient('pk_race_E');
    mock.calls = [];

    const rp = client.refresh().catch(() => 'refresh-rejected'); // expected to reject internally
    let txThrew = false;
    // Fire a normal request while the refresh is in flight; its onRequest awaits
    // the shared refresh promise. It must NOT re-throw the refresh's rejection.
    const txp = client.fetchTxHistory().catch((err) => {
      txThrew = true;
      return err;
    });
    await Promise.all([rp, txp]);
    check('concurrent request did not throw the refresh rejection', txThrew === false);
    mock.refreshDelayMs = 0;
    mock.refreshStatus = 200;
    client.destroy();
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
