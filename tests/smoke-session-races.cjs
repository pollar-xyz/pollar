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

// Capture DOM event listeners so the cross-tab `storage` handler can be fired
// synthetically (no real multi-tab environment in node).
const winListeners = {};
globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: (type, cb) => {
    (winListeners[type] ??= new Set()).add(cb);
  },
  removeEventListener: (type, cb) => {
    winListeners[type]?.delete(cb);
  },
};
function dispatchStorageEvent(key, newValue = null) {
  // newValue === null mimics a cross-tab remove/clear (logout); a string mimics
  // a cross-tab set (login / token rotation).
  for (const cb of winListeners.storage ?? []) cb({ key, newValue });
}
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

// Current namespace width is 16 bytes / 32 hex (see lib/api-key-hash.ts).
async function hashOf(apiKey, bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  return Array.from(new Uint8Array(digest).slice(0, bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
const apiKeyHashOf = (apiKey) => hashOf(apiKey, 16);
const legacyApiKeyHashOf = (apiKey) => hashOf(apiKey, 4); // pre-0.10 width

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
  // When set, the next /tx/history responds with a DPoP nonce challenge (401)
  // using the given WWW-Authenticate value, then succeeds on retry.
  txNonceChallengeWwwAuth: null,
  // Override the expiresAt the refresh endpoint returns (e.g. null to mimic a
  // malformed/NaN value). undefined → a normal future timestamp.
  refreshExpiresAt: undefined,
  // Per-cursor response delays (ms) for /tx/history, keyed by the `cursor` query
  // param, to force a specific response ordering for the concurrent-fetch test.
  txHistoryDelays: {},
  // HTTP status for /auth/session/resume (200 success; 403/410 = revoked;
  // 5xx/404 = transient/not-found).
  resumeStatus: 200,
  // When non-zero, /tx/history responses carry a `Date` header offset from local
  // time by this many seconds, to exercise DPoP clock-skew compensation.
  serverDateOffsetSec: 0,
  // When true, the next /auth/refresh responds with a DPoP nonce challenge (401),
  // then succeeds on retry — to assert the retry resends the POST body.
  refreshNonceChallengeOnce: false,
  // When true, the next /tx/history returns a 500 whose body nests token material
  // — to assert it's redacted in the error log.
  txHistoryErrorWithToken: false,
  // Raw `Date` header string to put on /tx/history responses (overrides the
  // offset-based one). Used to test that an implausible Date is ignored.
  serverDateOverride: null,
  // Marker echoed as /tx/build content (buildData) so a test can tell which tx
  // a buildData belongs to.
  buildMarker: 'BUILD',
  // When true, /tx/submit answers 200 with `{success:false, code, message}` (a
  // failure carried in a 2xx envelope) to assert the code/message is surfaced.
  txSubmitFail2xx: false,
};

globalThis.fetch = async (req) => {
  const headers = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  let body = '';
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = await req.clone().text();
    } catch {}
  }
  mock.calls.push({ url: req.url, method: req.method, headers, body });

  if (req.url.includes('/auth/refresh')) {
    if (mock.refreshNonceChallengeOnce) {
      mock.refreshNonceChallengeOnce = false; // one-shot: the retry below succeeds
      return new Response(JSON.stringify({ success: false }), {
        status: 401,
        headers: { 'WWW-Authenticate': 'DPoP error="use_dpop_nonce"', 'DPoP-Nonce': 'refresh-nonce-1' },
      });
    }
    if (mock.refreshDelayMs) await delay(mock.refreshDelayMs, req.signal);
    if (mock.refreshStatus !== 200) {
      return new Response(JSON.stringify({ success: false, message: 'nope' }), { status: mock.refreshStatus });
    }
    const expiresAt = mock.refreshExpiresAt !== undefined ? mock.refreshExpiresAt : Math.floor(Date.now() / 1000) + 600;
    return new Response(
      JSON.stringify({
        success: true,
        content: { token: { accessToken: 'NEW_AT', refreshToken: 'NEW_RT', expiresAt } },
      }),
      { status: 200 },
    );
  }
  if (req.url.includes('/auth/session/resume')) {
    if (mock.resumeDelayMs) await delay(mock.resumeDelayMs, req.signal);
    if (mock.resumeStatus !== 200) {
      return new Response(JSON.stringify({ success: false }), { status: mock.resumeStatus });
    }
    return new Response(JSON.stringify({ success: true, content: { mail: 'a@b.c' } }), { status: 200 });
  }
  if (req.url.includes('/tx/history') && mock.txNonceChallengeWwwAuth) {
    const www = mock.txNonceChallengeWwwAuth;
    mock.txNonceChallengeWwwAuth = null; // one-shot: the retry below succeeds
    return new Response(JSON.stringify({ success: false }), {
      status: 401,
      headers: { 'WWW-Authenticate': www, 'DPoP-Nonce': 'srv-nonce-1' },
    });
  }
  if (req.url.includes('/tx/history')) {
    if (mock.txHistoryErrorWithToken) {
      mock.txHistoryErrorWithToken = false;
      return new Response(
        JSON.stringify({
          success: false,
          code: 'TX_FEE_LIMIT_EXCEEDED', // diagnostic — must stay visible in logs
          content: { token: { accessToken: 'SECRET_AT', refreshToken: 'SECRET_RT' } },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      );
    }
    // Delay by the `cursor` query param so the test controls response ordering
    // independent of which request reaches the mock first.
    const cursor = new URL(req.url).searchParams.get('cursor');
    const d = (cursor && mock.txHistoryDelays[cursor]) || 0;
    if (d) await delay(d, req.signal);
    const respHeaders = {};
    if (mock.serverDateOverride) respHeaders.Date = mock.serverDateOverride;
    else if (mock.serverDateOffsetSec) respHeaders.Date = new Date(Date.now() + mock.serverDateOffsetSec * 1000).toUTCString();
    return new Response(JSON.stringify({ success: true, content: { ok: true, cursor } }), {
      status: 200,
      headers: respHeaders,
    });
  }
  if (req.url.includes('/tx/build')) {
    return new Response(JSON.stringify({ success: true, content: { marker: mock.buildMarker, amount: '5' } }), { status: 200 });
  }
  if (req.url.includes('/tx/submit')) {
    if (mock.txSubmitFail2xx) {
      return new Response(JSON.stringify({ success: false, code: 'TX_FEE_LIMIT_EXCEEDED', message: 'fee too high' }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ success: true, content: { hash: 'HASH', status: 'SUCCESS' } }), { status: 200 });
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
    check(
      'refresh did NOT write the rotated token after destroy',
      persisted.token.accessToken === 'AT',
      persisted.token.accessToken,
    );

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
    check(
      '  and distinct session objects',
      a.step === 'authenticated' && b.step === 'authenticated' && a.session !== b.session,
    );

    // Attempt to corrupt the live session through the returned object (token AND
    // the nested user object — R1: the clone must cover `user` too).
    if (a.step === 'authenticated') {
      a.session.token.accessToken = 'HACKED';
      a.session.user.ready = false;
    }
    mock.calls = [];
    await client.fetchTxHistory();
    const auth = mock.calls.find((c) => c.url.includes('/tx/history'))?.headers.authorization;
    check('request still signs with the real token, not the mutated one', auth === 'DPoP AT', auth);
    const live = client.getAuthState();
    check(
      'mutating the returned session.user did not corrupt live state',
      live.step === 'authenticated' && live.session.user.ready === true,
    );
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
    check(
      '  no authenticated emission after logout went idle',
      states.lastIndexOf('idle') === states.length - 1,
      JSON.stringify(states),
    );
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

  // ── F. DPoP nonce challenge is classified case-insensitively (N1) ──────────
  console.log('\n── F. DPoP nonce challenge case-insensitive (N1) ─────────────');
  {
    mock.calls = [];
    const { client } = await makeClient('pk_race_F');
    mock.calls = [];
    // Server (or a proxy) returns the challenge in a non-canonical casing.
    mock.txNonceChallengeWwwAuth = 'DPoP error="USE_DPOP_NONCE"';
    await client.fetchTxHistory(); // must transparently retry with the nonce

    const txCalls = mock.calls.filter((c) => c.url.includes('/tx/history'));
    const refreshCalls = mock.calls.filter((c) => c.url.includes('/auth/refresh'));
    check('nonce challenge triggered exactly one retry (2 tx calls)', txCalls.length === 2, txCalls.length);
    check('  classified as nonce, NOT token-expiry → no spurious refresh', refreshCalls.length === 0, refreshCalls.length);
    const retryNonce = txCalls[1]?.headers.dpop
      ? JSON.parse(Buffer.from(txCalls[1].headers.dpop.split('.')[1], 'base64url').toString()).nonce
      : null;
    check('  retry proof carries the server nonce', retryNonce === 'srv-nonce-1', retryNonce);
    client.destroy();
  }

  // ── G. cross-tab token rotation keeps `verified`, skips resume (N2) ────────
  console.log('\n── G. cross-tab rotation keeps verified, no re-resume (N2) ───');
  {
    mock.calls = [];
    const { client, storage, sessionKey } = await makeClient('pk_race_G');
    await waitFor(() => client.getAuthState().verified === true); // resume confirmed it
    const states = [];
    client.onAuthStateChange((s) => states.push(s.step + (s.step === 'authenticated' ? `:${s.verified}` : '')));
    states.length = 0;
    mock.calls = [];

    // Simulate another tab refreshing: same user/session, rotated access token.
    const rotated = freshSession('ROTATED_AT');
    await storage.set(sessionKey, rotated);
    dispatchStorageEvent(sessionKey, rotated); // set event carries the new value
    await new Promise((r) => setTimeout(r, 60));

    check('verified stayed true (no flap to false)', client.getAuthState().verified === true);
    check('  no authenticated:false emitted during rotation', !states.includes('authenticated:false'), JSON.stringify(states));
    check('  picked up the rotated token', client.getAuthState().session.token.accessToken === 'ROTATED_AT');
    const resumeCalls = mock.calls.filter((c) => c.url.includes('/auth/session/resume'));
    check('  no redundant /auth/session/resume fired', resumeCalls.length === 0, resumeCalls.length);
    client.destroy();
  }

  // ── H. legacy 8-hex session is NOT restored on upgrade (intentional logout) ─
  console.log('\n── H. legacy 8-hex session is not restored (clean re-login) ──');
  {
    mock.calls = [];
    const apiKey = 'pk_race_H';
    const storage = sdk.createMemoryAdapter();
    const legacyHash = await legacyApiKeyHashOf(apiKey);
    const newHash = await apiKeyHashOf(apiKey);
    check('hash widened (legacy 8 hex vs new 32 hex)', legacyHash.length === 8 && newHash.length === 32);

    // Seed a session ONLY under the pre-0.10 (8-hex) key — i.e. a user who was
    // logged in on an older SDK. The widened namespace must NOT pick it up: the
    // upgrade intentionally forces a one-time re-login (no migration).
    await storage.set(`pollar:${legacyHash}:session`, freshSession('LEGACY_AT'));

    const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logLevel: 'silent' });
    await client.ready();

    check(
      'legacy session is NOT restored (user must re-login)',
      client.getAuthState().step === 'idle',
      client.getAuthState().step,
    );
    check('  no session written under the new namespace yet', (await storage.get(`pollar:${newHash}:session`)) === null);
    client.destroy();
  }

  // ── I. cross-tab logout propagates even if this tab can't re-read storage ──
  console.log('\n── I. cross-tab logout propagates when storage degraded ──────');
  {
    mock.calls = [];
    const { client, storage, sessionKey } = await makeClient('pk_race_I');
    await waitFor(() => client.getAuthState().verified === true);

    // Simulate a degraded tab: its storage STILL holds the session (a re-read
    // would keep it logged in). Another tab logs out → the session key is removed
    // from real localStorage → the `storage` event fires with newValue === null.
    // We deliberately do NOT clear this tab's storage.
    check('precondition: this tab still has the session in storage', (await storage.get(sessionKey)) !== null);
    dispatchStorageEvent(sessionKey, null); // cross-tab logout (removal)
    await new Promise((r) => setTimeout(r, 40));

    check(
      'cross-tab logout took this tab to idle (despite stale local storage)',
      client.getAuthState().step === 'idle',
      client.getAuthState().step,
    );
    client.destroy();
  }

  // ── J. cross-tab rotation keeps verified for a null-userId session (R2) ────
  console.log('\n── J. null-userId session keeps verified on rotation (R2) ────');
  {
    mock.calls = [];
    const apiKey = 'pk_race_J';
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf(apiKey);
    const sessionKey = `pollar:${hash}:session`;
    // Session with userId === null (valid: isValidSession allows it).
    const nullUserSession = (at) =>
      JSON.stringify({
        clientSessionId: 'cs',
        userId: null,
        status: 'CONSUMED',
        token: { accessToken: at, refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'internal', address: null },
      });
    await storage.set(sessionKey, nullUserSession('AT'));
    const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logLevel: 'silent' });
    await client.ready();
    await waitFor(() => client.getAuthState().verified === true);

    const states = [];
    client.onAuthStateChange((s) => states.push(s.step + (s.step === 'authenticated' ? `:${s.verified}` : '')));
    states.length = 0;
    mock.calls = [];

    const rotated = nullUserSession('ROTATED_AT');
    await storage.set(sessionKey, rotated);
    dispatchStorageEvent(sessionKey, rotated);
    await new Promise((r) => setTimeout(r, 60));

    check('verified stayed true for null-userId session', client.getAuthState().verified === true);
    check('  no authenticated:false flap', !states.includes('authenticated:false'), JSON.stringify(states));
    check('  no redundant resume fired', mock.calls.filter((c) => c.url.includes('/auth/session/resume')).length === 0);
    client.destroy();
  }

  // ── K. refresh with a non-finite expiresAt is rejected (B5) ────────────────
  console.log('\n── K. malformed expiresAt from refresh is rejected (B5) ──────');
  {
    mock.calls = [];
    const { client } = await makeClient('pk_race_K');
    mock.refreshExpiresAt = null; // JSON has no NaN; null is what NaN serializes to
    let threw = false;
    await client.refresh().catch(() => {
      threw = true;
    });
    check('refresh() rejected on a non-finite expiresAt', threw === true);
    check(
      '  malformed token did not become the session (cleared to idle)',
      client.getAuthState().step === 'idle',
      client.getAuthState().step,
    );
    mock.refreshExpiresAt = undefined;
    client.destroy();
  }

  // ── L. concurrent fetchTxHistory: the latest call wins (#2) ────────────────
  console.log('\n── L. concurrent fetchTxHistory — latest wins (#2) ───────────');
  {
    mock.calls = [];
    const { client } = await makeClient('pk_race_L');
    mock.txHistoryDelays = { A: 80, B: 10 }; // A (older call) responds AFTER B
    const pA = client.fetchTxHistory({ cursor: 'A' });
    const pB = client.fetchTxHistory({ cursor: 'B' });
    await Promise.all([pA, pB]);
    await new Promise((r) => setTimeout(r, 60)); // let A's late response land + be dropped
    const st = client.getTxHistoryState();
    check(
      'latest fetch (B) won; stale slow response (A) dropped',
      st.step === 'loaded' && st.params.cursor === 'B',
      JSON.stringify(st.params ?? st.step),
    );
    mock.txHistoryDelays = {};
    client.destroy();
  }

  // ── M. resume → 403 (revoked elsewhere) logs the session out (#3) ──────────
  console.log('\n── M. resume 403 (revoked) → logout (#3) ─────────────────────');
  {
    mock.calls = [];
    mock.resumeStatus = 403; // session revoked from another device, AT still valid
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf('pk_race_M');
    await storage.set(`pollar:${hash}:session`, freshSession());
    const client = new sdk.PollarClient({ apiKey: 'pk_race_M', storage, baseUrl: 'https://x.test', logLevel: 'silent' });
    await client.ready();
    await waitFor(() => mock.calls.some((c) => c.url.includes('/auth/session/resume')));
    await waitFor(() => client.getAuthState().step === 'idle');
    check('a definitive 403 from resume cleared the session to idle', client.getAuthState().step === 'idle');
    mock.resumeStatus = 200;
    client.destroy();
  }

  // ── N. resume → 503 (transient) keeps the optimistic session (#3) ──────────
  console.log('\n── N. resume 503 (transient) → stays optimistic (#3) ─────────');
  {
    mock.calls = [];
    mock.resumeStatus = 503; // transient server error — must NOT log out
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf('pk_race_N');
    await storage.set(`pollar:${hash}:session`, freshSession());
    const client = new sdk.PollarClient({ apiKey: 'pk_race_N', storage, baseUrl: 'https://x.test', logLevel: 'silent' });
    await client.ready();
    await waitFor(() => mock.calls.some((c) => c.url.includes('/auth/session/resume')));
    await new Promise((r) => setTimeout(r, 40));
    const s = client.getAuthState();
    check(
      'a transient 503 from resume did NOT log out (stays optimistic)',
      s.step === 'authenticated' && s.verified === false,
      s.step,
    );
    mock.resumeStatus = 200;
    client.destroy();
  }

  // ── O. DPoP iat compensates for a skewed server clock (#1) ─────────────────
  console.log('\n── O. DPoP iat learns clock offset from Date header (#1) ─────');
  {
    const decodeIat = (dpop) => JSON.parse(Buffer.from(dpop.split('.')[1], 'base64url').toString()).iat;
    const txDpop = () => mock.calls.find((c) => c.url.includes('/tx/history'))?.headers.dpop;
    mock.calls = [];
    const { client } = await makeClient('pk_race_O');
    mock.serverDateOffsetSec = 1000; // server clock reads 1000s "ahead" of this device

    mock.calls = [];
    await client.fetchTxHistory(); // req1: offset not learned yet → iat ≈ local now
    const iat1 = decodeIat(txDpop());
    mock.calls = [];
    await client.fetchTxHistory(); // req2: offset learned from req1's Date header
    const iat2 = decodeIat(txDpop());

    const nowSec = Math.floor(Date.now() / 1000);
    check('first proof iat ≈ local time (offset not yet learned)', Math.abs(iat1 - nowSec) < 5, iat1 - nowSec);
    check('second proof iat shifted ≈ +1000s toward server time', Math.abs(iat2 - (nowSec + 1000)) < 5, iat2 - nowSec);
    mock.serverDateOffsetSec = 0;
    client.destroy();
  }

  // ── P. /auth/refresh retry resends the POST body after a nonce challenge (rc.1) ─
  console.log('\n── P. refresh retry preserves the POST body (rc.1) ──────────');
  {
    mock.calls = [];
    const { client } = await makeClient('pk_race_P');
    mock.calls = [];
    mock.refreshNonceChallengeOnce = true; // first refresh → nonce challenge; the retry must resend the body
    await client.refresh();
    const refreshCalls = mock.calls.filter((c) => c.url.includes('/auth/refresh'));
    check('refresh retried after the nonce challenge (2 calls)', refreshCalls.length === 2, refreshCalls.length);
    check(
      '  the retry carried a non-empty body (refreshToken not dropped)',
      !!refreshCalls[1] && refreshCalls[1].body.includes('refreshToken'),
      refreshCalls[1]?.body,
    );
    client.destroy();
  }

  // ── Q. refresh() emits the rotated token to getAuthState/onAuthStateChange (rc.2) ─
  console.log('\n── Q. refresh emits rotated token to authState (rc.2) ────────');
  {
    mock.calls = [];
    const { client } = await makeClient('pk_race_Q');
    const seen = [];
    client.onAuthStateChange((s) => {
      if (s.step === 'authenticated') seen.push(s.session.token.accessToken);
    });
    seen.length = 0;
    await client.refresh();
    check('getAuthState() reflects the rotated token', client.getAuthState().session.token.accessToken === 'NEW_AT');
    check('  onAuthStateChange emitted the rotated token', seen.includes('NEW_AT'), JSON.stringify(seen));
    client.destroy();
  }

  // ── R. a duplicate PollarClient for the same apiKey warns (N4) ─────────────
  console.log('\n── R. duplicate client for same apiKey warns (N4) ────────────');
  {
    const warns = [];
    const logger = { error() {}, warn: (...a) => warns.push(a.join(' ')), info() {}, debug() {} };
    const c1 = new sdk.PollarClient({
      apiKey: 'pk_dup',
      storage: sdk.createMemoryAdapter(),
      baseUrl: 'https://x.test',
      logger,
    });
    const c2 = new sdk.PollarClient({
      apiKey: 'pk_dup',
      storage: sdk.createMemoryAdapter(),
      baseUrl: 'https://x.test',
      logger,
    });
    await Promise.all([c1.ready(), c2.ready()]);
    check(
      'a second client for the same apiKey logged a warning',
      warns.some((w) => w.includes('Another PollarClient is already active')),
    );
    c1.destroy();
    c2.destroy();
  }

  // ── S. a smart session does NOT restore an external adapter (#4) ───────────
  console.log('\n── S. smart session does not restore an external adapter (#4) ─');
  {
    mock.calls = [];
    const apiKey = 'pk_race_S';
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf(apiKey);
    // A SMART session + a stale walletType row, as if a prior external login left one.
    await storage.set(
      `pollar:${hash}:session`,
      JSON.stringify({
        clientSessionId: 'cs',
        userId: 'u',
        status: 'CONSUMED',
        token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'smart', address: 'Csmart' },
      }),
    );
    await storage.set(`pollar:${hash}:walletType`, 'freighter');
    let resolverCalled = false;
    const client = new sdk.PollarClient({
      apiKey,
      storage,
      baseUrl: 'https://x.test',
      logLevel: 'silent',
      walletAdapter: () => {
        resolverCalled = true;
        return { type: 'freighter', isAvailable: async () => true };
      },
    });
    await client.ready();
    check('smart session did NOT resolve an external adapter from the stale walletType row', resolverCalled === false);
    check('  session still restored fine', client.getAuthState().step === 'authenticated');
    client.destroy();
  }

  // ── T. token material in a failed response is redacted in logs (SEC1) ──────
  console.log('\n── T. failed-response token material redacted in logs (SEC1) ─');
  {
    const logs = [];
    const logger = { error: (...a) => logs.push(a), warn() {}, info() {}, debug() {} };
    const apiKey = 'pk_race_T';
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf(apiKey);
    await storage.set(`pollar:${hash}:session`, freshSession());
    const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logger });
    await client.ready();
    await waitFor(() => mock.calls.some((c) => c.url.includes('/auth/session/resume')));
    logs.length = 0;
    mock.txHistoryErrorWithToken = true; // next /tx/history → 500 with token in the body
    await client.fetchTxHistory();
    const dump = JSON.stringify(logs);
    check(
      'the logged response did NOT leak the access/refresh token',
      !dump.includes('SECRET_AT') && !dump.includes('SECRET_RT'),
      dump.slice(0, 160),
    );
    check('  the sensitive token field was redacted', dump.includes('[redacted]'));
    check(
      '  but the diagnostic `code` is PRESERVED (not over-redacted)',
      dump.includes('TX_FEE_LIMIT_EXCEEDED'),
      dump.slice(0, 200),
    );
    mock.txHistoryErrorWithToken = false;
    client.destroy();
  }

  // ── U. an implausible server Date is ignored (no proof poisoning) (SEC2) ───
  console.log('\n── U. implausible server Date ignored (SEC2) ────────────────');
  {
    const decodeIat = (dpop) => JSON.parse(Buffer.from(dpop.split('.')[1], 'base64url').toString()).iat;
    const txDpop = () => mock.calls.find((c) => c.url.includes('/tx/history'))?.headers.dpop;
    mock.calls = [];
    const { client } = await makeClient('pk_race_U');
    mock.serverDateOverride = new Date(0).toUTCString(); // epoch — outside the 2020–2100 window
    mock.calls = [];
    await client.fetchTxHistory(); // response carries the bad Date → must be ignored
    mock.calls = [];
    await client.fetchTxHistory(); // proof iat must still be ~local time, not poisoned
    const iat = decodeIat(txDpop());
    const nowSec = Math.floor(Date.now() / 1000);
    check('proof iat stayed at local time (implausible Date ignored)', Math.abs(iat - nowSec) < 5, iat - nowSec);
    mock.serverDateOverride = null;
    client.destroy();
  }

  // ── V. onAuthStateChange hands a clone — listener can't corrupt live (C2) ──
  console.log('\n── V. onAuthStateChange hands a clone (C2) ──────────────────');
  {
    mock.calls = [];
    const { client } = await makeClient('pk_race_V');
    let captured = null;
    client.onAuthStateChange((s) => {
      if (s.step === 'authenticated') captured = s;
    });
    await waitFor(() => captured !== null);
    captured.session.token.accessToken = 'HACKED_VIA_LISTENER'; // mutate the received state
    mock.calls = [];
    await client.fetchTxHistory();
    const auth = mock.calls.find((c) => c.url.includes('/tx/history'))?.headers.authorization;
    check('a listener mutating its session did not corrupt the live signing token', auth === 'DPoP AT', auth);
    client.destroy();
  }

  // ── W. a finished tx's buildData is not threaded into a new tx (C4) ────────
  console.log('\n── W. terminal tx buildData not inherited by a new tx (C4) ───');
  {
    mock.calls = [];
    const apiKey = 'pk_race_W';
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf(apiKey);
    await storage.set(
      `pollar:${hash}:session`,
      JSON.stringify({
        clientSessionId: 'cs',
        userId: 'u',
        status: 'CONSUMED',
        token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'internal', address: 'Gtest' }, // buildTx requires an address
      }),
    );
    const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logLevel: 'silent' });
    await client.ready();

    mock.buildMarker = 'TX_A';
    await client.buildTx('payment', { amount: '5' }); // → state 'built' with buildData TX_A
    await client.submitTx('XDR_A'); // → terminal 'success' carrying buildData TX_A
    check(
      'tx A reached success carrying its buildData',
      client.getTransactionState()?.buildData?.marker === 'TX_A',
      JSON.stringify(client.getTransactionState()?.buildData),
    );

    // A NEW standalone submit (no preceding buildTx) must NOT inherit TX_A's buildData.
    await client.submitTx('XDR_B');
    const st = client.getTransactionState();
    check(
      'a standalone submit did NOT inherit the finished tx buildData',
      st?.buildData?.marker !== 'TX_A',
      JSON.stringify(st?.buildData),
    );
    mock.buildMarker = 'BUILD';
    client.destroy();
  }

  // ── X. logout resets the reactive read stores (L5) ────────────────────────
  console.log('\n── X. logout resets the reactive read stores (L5) ───────────');
  {
    mock.calls = [];
    const apiKey = 'pk_race_X';
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf(apiKey);
    await storage.set(
      `pollar:${hash}:session`,
      JSON.stringify({
        clientSessionId: 'cs',
        userId: 'u',
        status: 'CONSUMED',
        token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'internal', address: 'Gtest' }, // refreshBalance needs an address
      }),
    );
    const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logLevel: 'silent' });
    await client.ready();
    await client.refreshBalance();
    check(
      'balance store loaded before logout',
      client.getWalletBalanceState().step === 'loaded',
      client.getWalletBalanceState().step,
    );
    await client.logout();
    check(
      "  logout reset the balance store to 'idle' (no stale previous-user data)",
      client.getWalletBalanceState().step === 'idle',
      client.getWalletBalanceState().step,
    );
    client.destroy();
  }

  // ── Y. signAuthEntry passes the CURRENT network to the adapter (Albedo H1) ─
  console.log('\n── Y. signAuthEntry passes current network to adapter (H1) ──');
  {
    mock.calls = [];
    const apiKey = 'pk_race_Y';
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf(apiKey);
    // External session + walletType row → _restoreSession resolves the adapter.
    await storage.set(
      `pollar:${hash}:session`,
      JSON.stringify({
        clientSessionId: 'cs',
        userId: 'u',
        status: 'CONSUMED',
        token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'external', address: 'Gtest' },
      }),
    );
    await storage.set(`pollar:${hash}:walletType`, 'fake');
    const captured = [];
    const fakeAdapter = {
      type: 'fake',
      isAvailable: async () => true,
      connect: async () => ({ address: 'Gtest' }),
      signTransaction: async () => ({ signedTxXdr: 'x' }),
      signAuthEntry: async (_xdr, options) => {
        captured.push(options);
        return { signedAuthEntry: 'sig' };
      },
    };
    const client = new sdk.PollarClient({
      apiKey,
      storage,
      baseUrl: 'https://x.test',
      logLevel: 'silent',
      stellarNetwork: 'testnet',
      walletAdapter: () => fakeAdapter,
    });
    await client.ready();
    await client.signAuthEntry('ENTRY_XDR', { validUntilLedger: 1000 });
    check(
      'signAuthEntry passed a networkPassphrase to the adapter',
      !!captured[0]?.networkPassphrase,
      JSON.stringify(captured[0]),
    );
    const testnetPp = captured[0]?.networkPassphrase;
    client.setNetwork('mainnet');
    await client.signAuthEntry('ENTRY_XDR', { validUntilLedger: 1000 });
    check(
      '  after setNetwork(mainnet) the passphrase changed (no stale network)',
      !!captured[1]?.networkPassphrase && captured[1].networkPassphrase !== testnetPp,
      JSON.stringify(captured.map((c) => c?.networkPassphrase)),
    );
    client.destroy();
  }

  // ── Z. a FAILING refresh of the OLD session can't wipe a cross-tab-restored
  //      NEW session (#5 gen-guarded clearSession + #2 restore bumps generation)
  console.log('\n── Z. failing old-session refresh keeps the new session (#2+#5) ──');
  {
    mock.calls = [];
    mock.refreshDelayMs = 80;
    mock.refreshStatus = 500; // the in-flight refresh of session A will FAIL
    const { client, storage, sessionKey } = await makeClient('pk_race_Z');
    await waitFor(() => client.getAuthState().verified === true);
    mock.calls = [];

    // Session A ('cs') refresh goes on the wire and will fail in ~80ms.
    const rp = client.refresh().catch(() => {}); // _doRefresh captures gen G now

    // Meanwhile another tab logs in as a DIFFERENT user (different
    // clientSessionId) → the cross-tab restore must bump the generation (#2).
    const sessionB = JSON.stringify({
      clientSessionId: 'cs2',
      userId: 'u2',
      status: 'CONSUMED',
      token: { accessToken: 'B_AT', refreshToken: 'B_RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
      user: { ready: true },
      wallet: { type: 'internal', address: null },
    });
    await new Promise((r) => setTimeout(r, 20));
    await storage.set(sessionKey, sessionB);
    dispatchStorageEvent(sessionKey, sessionB);
    await waitFor(() => client.getAuthState().session?.clientSessionId === 'cs2');

    await rp; // session-A refresh now rejects (500) → must NOT clear session B
    await new Promise((r) => setTimeout(r, 20));

    check(
      'new session (cs2) survived the failing old-session refresh',
      client.getAuthState().step === 'authenticated' && client.getAuthState().session?.clientSessionId === 'cs2',
      `${client.getAuthState().step}/${client.getAuthState().session?.clientSessionId}`,
    );
    const persisted = JSON.parse((await storage.get(sessionKey)) ?? 'null');
    check(
      '  storage still holds the new session (not cleared)',
      persisted?.clientSessionId === 'cs2',
      persisted?.clientSessionId,
    );
    mock.refreshDelayMs = 0;
    mock.refreshStatus = 200;
    client.destroy();
  }

  // ── AA. signAuthEntry on a SMART session returns an explicit error and does
  //       NOT hit the custodial endpoint (#9)
  console.log('\n── AA. smart-session signAuthEntry → explicit error, no custodial POST (#9) ──');
  {
    mock.calls = [];
    const apiKey = 'pk_race_AA';
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf(apiKey);
    await storage.set(
      `pollar:${hash}:session`,
      JSON.stringify({
        clientSessionId: 'cs',
        userId: 'u',
        status: 'CONSUMED',
        token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'smart', address: 'Csmart' },
      }),
    );
    const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logLevel: 'silent' });
    await client.ready();
    const outcome = await client.signAuthEntry('ENTRY_XDR', { validUntilLedger: 1000 });
    check('smart signAuthEntry returned status:error', outcome?.status === 'error', JSON.stringify(outcome));
    const custodial = mock.calls.filter((c) => c.url.includes('/tx/sign-auth-entry'));
    check('  no custodial /tx/sign-auth-entry POST fired', custodial.length === 0, custodial.length);
    // signTx has the same smart guard (sibling of the signAuthEntry fix).
    const signOutcome = await client.signTx('UNSIGNED_XDR');
    check('  smart signTx returned status:error', signOutcome?.status === 'error', JSON.stringify(signOutcome));
    check('  no custodial /tx/sign POST fired', mock.calls.filter((c) => /\/tx\/sign(\?|$)/.test(c.url)).length === 0);
    client.destroy();
  }

  // ── BB. a tx failure carried in a 2xx success:false envelope surfaces the
  //       backend code/message (#8 — _resolveTxApiError now also reads `data`)
  console.log('\n── BB. 2xx success:false tx failure surfaces code/message (#8) ──');
  {
    mock.calls = [];
    mock.txSubmitFail2xx = true;
    const apiKey = 'pk_race_BB';
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf(apiKey);
    await storage.set(
      `pollar:${hash}:session`,
      JSON.stringify({
        clientSessionId: 'cs',
        userId: 'u',
        status: 'CONSUMED',
        token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'internal', address: 'Gtest' },
      }),
    );
    const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logLevel: 'silent' });
    await client.ready();
    const outcome = await client.submitTx('SIGNED_XDR');
    check(
      'submit error surfaced the diagnostic code from the 2xx body',
      outcome?.status === 'error' && outcome?.code === 'TX_FEE_LIMIT_EXCEEDED',
      JSON.stringify(outcome),
    );
    mock.txSubmitFail2xx = false;
    client.destroy();
  }

  // ── CC. setTrustline rejects an out-of-range asset code up front, no network
  console.log('\n── CC. setTrustline validates asset code length (1–12) ──────');
  {
    mock.calls = [];
    const apiKey = 'pk_race_CC';
    const storage = sdk.createMemoryAdapter();
    const hash = await apiKeyHashOf(apiKey);
    await storage.set(
      `pollar:${hash}:session`,
      JSON.stringify({
        clientSessionId: 'cs',
        userId: 'u',
        status: 'CONSUMED',
        token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'internal', address: 'Gtest' },
      }),
    );
    const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logLevel: 'silent' });
    await client.ready();
    mock.calls = [];
    const empty = await client.setTrustline({ code: '', issuer: 'Gissuer' });
    const tooLong = await client.setTrustline({ code: 'ABCDEFGHIJKLM', issuer: 'Gissuer' }); // 13 chars
    check('empty asset code → error', empty?.status === 'error', JSON.stringify(empty));
    check('  >12 asset code → error', tooLong?.status === 'error', JSON.stringify(tooLong));
    const txCalls = mock.calls.filter((c) => c.url.includes('/wallet/assets/trustline') || c.url.includes('/tx/'));
    check('  no network call fired for an invalid code', txCalls.length === 0, txCalls.length);
    client.destroy();
  }

  // ── DD. wallet_not_installed does NOT mint a server session up front (F7) ───
  console.log('\n── DD. unavailable wallet → no orphaned /auth/session (F7) ───');
  {
    mock.calls = [];
    const apiKey = 'pk_race_DD';
    const storage = sdk.createMemoryAdapter();
    const fakeAdapter = {
      type: 'fake',
      isAvailable: async () => false, // extension not installed
      connect: async () => ({ address: 'G' }),
      signTransaction: async () => ({ signedTxXdr: 'x' }),
      signAuthEntry: async () => ({ signedAuthEntry: 'x' }),
    };
    const client = new sdk.PollarClient({
      apiKey,
      storage,
      baseUrl: 'https://x.test',
      logLevel: 'silent',
      walletAdapter: () => fakeAdapter,
    });
    await client.ready();
    mock.calls = [];
    client.loginWallet('fake');
    await waitFor(() => client.getAuthState().step === 'wallet_not_installed');
    check('state → wallet_not_installed', client.getAuthState().step === 'wallet_not_installed');
    const sessionCalls = mock.calls.filter((c) => /\/auth\/session(\?|$)/.test(c.url));
    check('  no /auth/session minted for an uninstalled wallet (F7)', sessionCalls.length === 0, sessionCalls.length);
    client.destroy();
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
