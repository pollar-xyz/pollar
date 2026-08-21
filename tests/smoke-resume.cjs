// @pollar smoke test — session resume across "page loads" (DPoP key binding).
//
// Run with `node tests/smoke-resume.cjs` after `npm run build`. Regression
// guards for the 0.11.2 field bug where a session died on the first reload
// with `SDK_AUTH_DPOP_INVALID reason:"thumbprint-mismatch"`:
//
//  1. A fresh PollarClient over the SAME persisted storage + IndexedDB resumes
//     the session — the resume proof's JWK thumbprint equals the `cnf.jkt` the
//     server bound at login — and concurrent resume triggers (visibility flaps)
//     coalesce into ONE `/auth/session/resume`.
//  2. A genuinely revoked session (server 403 on resume) still clears.
//  3. When the keypair cannot persist (IndexedDB unavailable), login warns
//     loudly, and the reload clears the doomed session LOCALLY — no resume
//     round trip, no 401 burst — via the persisted `dpopJkt` binding check.
//  4. A non-terminal resume failure (5xx) backs off instead of bursting.
//  5. `logout()` rotates the DPoP keypair; a failure-path clear does NOT.
//
// Mocks `fetch` with a server that actually verifies the DPoP binding: it
// computes `cnf.jkt` from the login's `dpopJwk` and compares it against the
// thumbprint of the JWK in each resume proof's header, including the RFC 9449
// `use_dpop_nonce` challenge round trip. IndexedDB is a minimal in-memory shim
// (Node has none) that survives across client instances to model a reload.

const path = require('node:path');

// Capture `storage` handlers so the cross-tab test can deliver events to a
// specific "tab" (browsers never deliver storage events to the writing tab, so
// dispatching selectively models the real thing).
const storageHandlers = [];
globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: (type, fn) => {
    if (type === 'storage') storageHandlers.push(fn);
  },
  removeEventListener: (type, fn) => {
    if (type === 'storage') {
      const i = storageHandlers.indexOf(fn);
      if (i !== -1) storageHandlers.splice(i, 1);
    }
  },
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// ─── Minimal IndexedDB shim ──────────────────────────────────────────────────
// Only the surface WebCryptoKeyManager touches: open/upgradeneeded, get/put/
// delete, transaction `complete`/`abort` events (the durable-write path awaits
// those), close. Values round-trip through structuredClone like real IDB.
function makeIndexedDB() {
  const dbs = new Map();
  const fire = (t, type) => {
    const h = t['on' + type];
    if (typeof h === 'function') h({ target: t });
  };
  return {
    open(name, version) {
      const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => {
        let rec = dbs.get(name);
        const isNew = !rec;
        if (!rec) {
          rec = { version: version || 1, stores: new Map() };
          dbs.set(name, rec);
        }
        req.result = {
          objectStoreNames: { contains: (s) => rec.stores.has(s) },
          createObjectStore: (s) => (rec.stores.set(s, new Map()), {}),
          close: () => {},
          transaction: (storeName) => {
            const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
            tx.objectStore = () => {
              const store = rec.stores.get(storeName);
              const wrap = (fn) => {
                const r = { result: undefined, error: null, onsuccess: null, onerror: null };
                queueMicrotask(() => {
                  try {
                    r.result = fn();
                    fire(r, 'success');
                    queueMicrotask(() => fire(tx, 'complete'));
                  } catch (e) {
                    r.error = e;
                    fire(r, 'error');
                    tx.error = e;
                    queueMicrotask(() => fire(tx, 'abort'));
                  }
                });
                return r;
              };
              return {
                get: (k) => wrap(() => (store.get(k) === undefined ? undefined : structuredClone(store.get(k)))),
                put: (v, k) => wrap(() => (store.set(k, structuredClone(v)), k)),
                delete: (k) => wrap(() => (store.delete(k), undefined)),
              };
            };
            return tx;
          },
        };
        if (isNew) fire(req, 'upgradeneeded');
        fire(req, 'success');
      });
      return req;
    },
  };
}
globalThis.indexedDB = makeIndexedDB();

const SDK_DIST = path.resolve(__dirname, '../packages/core/dist/index.js');
const sdk = require(SDK_DIST);

// jose is hoisted at workspace root (transitive via sdk-api). If you run this
// outside a workspace, install jose locally.
let calculateJwkThumbprint;
try {
  ({ calculateJwkThumbprint } = require('jose'));
} catch {
  const candidates = [path.resolve(__dirname, '../node_modules/jose')];
  for (const c of candidates) {
    try {
      ({ calculateJwkThumbprint } = require(c));
      break;
    } catch {}
  }
  if (!calculateJwkThumbprint) {
    console.error('FATAL: cannot resolve `jose`. Install it in this workspace.');
    process.exit(1);
  }
}

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

async function waitFor(cond, timeoutMs = 4000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condition not met within timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64uJson = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

// ─── Mock server ─────────────────────────────────────────────────────────────
// `resumeMode` selects the behavior of GET /auth/session/resume per test case.
let serverBoundJkt = null; // cnf.jkt bound at the last /auth/login
let resumeMode = 'verify'; // 'verify' | 'revoked-403' | 'error-500'
let resumeDelayMs = 0;
let resumeHits = 0; // every fetch hit on the resume path (nonce retries included)
const resumeProofJkts = []; // jkt of each nonce-carrying resume proof

globalThis.fetch = async (req) => {
  const p = new URL(req.url).pathname;
  const json = (obj, init) => new Response(JSON.stringify(obj), { status: 200, ...init });

  if (p.endsWith('/auth/session')) return json({ success: true, content: { clientSessionId: 'cs1' } });
  if (p.endsWith('/auth/email')) return json({ success: true });
  if (p.endsWith('/auth/email/verify-code')) return json({ code: 'SDK_EMAIL_CODE_VERIFIED', success: true });
  if (p.includes('/auth/session/status/')) {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"status":"READY"}\n\n'));
        c.close();
      },
    });
    return new Response(body, { status: 200 });
  }
  if (p.endsWith('/auth/login')) {
    const body = await req.clone().json();
    serverBoundJkt = await calculateJwkThumbprint(body.dpopJwk, 'sha256');
    return json({
      code: 'SDK_LOGIN_SUCCESS',
      success: true,
      content: {
        clientSessionId: 'cs1',
        userId: 'u1',
        status: 'CONSUMED',
        token: { accessToken: 'AT1', refreshToken: 'RT1', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'internal', address: 'GABC' },
        data: { mail: 'a@b.c', first_name: 'a', last_name: 'b', avatar: null, providers: {} },
      },
    });
  }
  if (p.endsWith('/auth/logout')) return json({ success: true });
  if (p.endsWith('/auth/session/resume')) {
    resumeHits++;
    if (resumeDelayMs) await sleep(resumeDelayMs);
    if (resumeMode === 'error-500') return json({ success: false }, { status: 500 });
    if (resumeMode === 'revoked-403') return json({ code: 'SDK_AUTH_SESSION_REVOKED' }, { status: 403 });
    // 'verify': real DPoP semantics — nonce challenge, then thumbprint check.
    const dpop = req.headers.get('DPoP');
    const challenge = (reason) =>
      json(
        { code: 'SDK_AUTH_DPOP_USE_NONCE', reason },
        { status: 401, headers: { 'WWW-Authenticate': 'DPoP algs="ES256", error="use_dpop_nonce"', 'DPoP-Nonce': 'N1' } },
      );
    if (!dpop) return challenge('no-proof');
    const [h, pl] = dpop.split('.');
    if (!b64uJson(pl).nonce) return challenge('no-nonce');
    const jkt = await calculateJwkThumbprint(b64uJson(h).jwk, 'sha256');
    resumeProofJkts.push(jkt);
    if (jkt !== serverBoundJkt) {
      return json(
        { code: 'SDK_AUTH_DPOP_INVALID', reason: 'thumbprint-mismatch' },
        { status: 401, headers: { 'WWW-Authenticate': 'DPoP algs="ES256", error="invalid_token"' } },
      );
    }
    return json({ success: true, content: { mail: 'a@b.c', first_name: 'a', last_name: 'b', avatar: null, providers: {} } });
  }
  return json({ success: true, content: {} });
};

// Full email-OTP login against the mock server.
async function login(client) {
  client.beginEmailLogin();
  await waitFor(() => client.getAuthState().step === 'entering_email');
  client.sendEmailCode('a@b.c');
  await waitFor(() => client.getAuthState().step === 'entering_code');
  client.verifyEmailCode('123456');
  await waitFor(() => client.getAuthState().step === 'authenticated' && client.getAuthState().verified === true);
}

function makeVisibility() {
  const cbs = [];
  return {
    provider: { isVisible: () => true, onChange: (cb) => (cbs.push(cb), () => {}) },
    flap: () => cbs.forEach((cb) => cb(true)),
  };
}

(async () => {
  console.log('── 1. Fresh client over persisted storage resumes the session ─');
  {
    const apiKey = 'pk_smoke_resume_ok';
    const storage = sdk.createMemoryAdapter();
    const a = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test' });
    await a.ready();
    await login(a);
    check('login reaches authenticated + verified', a.getAuthState().verified === true);
    const persistedJkt = await new sdk.WebCryptoKeyManager(apiKey).getThumbprint();
    check('  persisted keypair thumbprint === token cnf.jkt', persistedJkt === serverBoundJkt);

    // "Reload": new client over the same Storage + IndexedDB.
    a.destroy();
    resumeHits = 0;
    resumeDelayMs = 50;
    const vis = makeVisibility();
    const b = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', visibilityProvider: vis.provider });
    await b.ready();
    // Flap visibility while the startup resume is in flight — these used to
    // abort + restart it, turning one resume into a burst of three.
    vis.flap();
    vis.flap();
    await waitFor(() => b.getAuthState().step === 'authenticated' && b.getAuthState().verified === true);
    check('fresh client resumes to authenticated + verified', true);
    check('  resume proof thumbprint === token cnf.jkt', resumeProofJkts.at(-1) === serverBoundJkt);
    // One logical resume = nonce challenge + retried proof = exactly 2 hits.
    check('  concurrent triggers coalesced into ONE resume (2 hits: challenge + retry)', resumeHits === 2, `hits=${resumeHits}`);
    check('  keypair unchanged across the reload', (await new sdk.WebCryptoKeyManager(apiKey).getThumbprint()) === persistedJkt);
    resumeDelayMs = 0;

    console.log('\n── 2. A genuinely revoked session still clears ───────────────');
    b.destroy();
    resumeMode = 'revoked-403';
    const c = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test' });
    await c.ready();
    await waitFor(() => c.getAuthState().step === 'idle');
    check('revoked session converges to idle', c.getAuthState().step === 'idle');
    check('  session removed from storage', (await storage.get(`pollar:${c.apiKeyHash}:session`)) == null);
    console.log('\n── 5a. Failure-path clear does NOT rotate the keypair ────────');
    check('keypair survives the revoked-session clear', (await new sdk.WebCryptoKeyManager(apiKey).getThumbprint()) === persistedJkt);

    console.log('\n── 5b. logout() DOES rotate the keypair ──────────────────────');
    resumeMode = 'verify';
    await login(c);
    await c.logout();
    await waitFor(() => c.getAuthState().step === 'idle');
    const rotatedJkt = await new sdk.WebCryptoKeyManager(apiKey).getThumbprint();
    check('logout rotates the keypair', rotatedJkt !== persistedJkt);
    c.destroy();
  }

  console.log('\n── 3. Key persistence failure: clean local clear, no 401 burst ─');
  {
    const apiKey = 'pk_smoke_resume_noidb';
    const storage = sdk.createMemoryAdapter();
    const savedIdb = globalThis.indexedDB;
    delete globalThis.indexedDB; // the keypair cannot persist in this "browser"
    try {
      const warnings = [];
      const logger = {
        debug: () => {},
        info: () => {},
        warn: (...a) => warnings.push(a.join(' ')),
        error: (...a) => warnings.push(a.join(' ')),
      };
      const a = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logger });
      await a.ready();
      await login(a);
      check('login still works with a non-persistable keypair', a.getAuthState().verified === true);
      check(
        '  login warns that the session will not survive a reload',
        warnings.some((w) => w.includes('could not be persisted')),
      );

      // "Reload": the stored session is bound to a key that no longer exists.
      a.destroy();
      resumeHits = 0;
      const states = [];
      const b = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logger });
      b.onAuthStateChange((s) => states.push(s.step));
      await b.ready();
      await waitFor(() => b.getAuthState().step === 'idle');
      check('doomed session is cleared locally (idle)', b.getAuthState().step === 'idle');
      check('  no resume round trip was attempted (dpopJkt precheck)', resumeHits === 0, `hits=${resumeHits}`);
      check(
        '  no phantom authenticated state was emitted',
        !states.includes('authenticated'),
        `states=${states.join(',')}`,
      );
      check('  session removed from storage', (await storage.get(`pollar:${b.apiKeyHash}:session`)) == null);
      b.destroy();
    } finally {
      globalThis.indexedDB = savedIdb;
    }
  }

  console.log('\n── 4. Non-terminal resume failure backs off (no burst) ────────');
  {
    const apiKey = 'pk_smoke_resume_backoff';
    const storage = sdk.createMemoryAdapter();
    const a = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test' });
    await a.ready();
    await login(a);
    a.destroy();

    resumeMode = 'error-500';
    resumeHits = 0;
    const vis = makeVisibility();
    const b = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', visibilityProvider: vis.provider });
    await b.ready();
    await waitFor(() => resumeHits >= 1);
    await sleep(50); // let the failure register and arm the backoff
    vis.flap();
    vis.flap();
    await sleep(100);
    check('5xx keeps the optimistic session', b.getAuthState().step === 'authenticated' && !b.getAuthState().verified);
    check('  retriggers during backoff are suppressed', resumeHits === 1, `hits=${resumeHits}`);
    b.destroy();
    resumeMode = 'verify';
  }

  console.log('\n── 6. Cross-tab logout→re-login: stale key cache resyncs ──────');
  {
    // Tab A and tab B share the persisted key (IndexedDB) + session storage.
    // A logs out (rotates the shared key) and logs in again with a NEW key;
    // B — still caching the OLD key in memory — must adopt the new one when
    // the fresh session arrives, not clear it as a binding mismatch.
    const apiKey = 'pk_smoke_resume_xtab';
    const storage = sdk.createMemoryAdapter();
    const a = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test' });
    await a.ready();
    await login(a);
    const sessionKey = `pollar:${a.apiKeyHash}:session`;

    const b = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test' });
    await b.ready(); // the storage handler registers inside async _initialize
    const bHandler = storageHandlers.at(-1);
    await waitFor(() => b.getAuthState().step === 'authenticated' && b.getAuthState().verified === true);
    const jktBeforeLogout = serverBoundJkt;

    // Tab A logs out → key reset + storage removed. Deliver the event to B.
    await a.logout();
    bHandler({ key: sessionKey, newValue: null });
    await waitFor(() => b.getAuthState().step === 'idle');

    // Tab A logs in again → a NEW keypair is generated and bound.
    await login(a);
    check('re-login bound a fresh keypair', serverBoundJkt !== jktBeforeLogout);

    // Deliver the new session to B: it must resync to the new shared key and
    // resume — not clear the session tab A just created.
    bHandler({ key: sessionKey, newValue: await storage.get(sessionKey) });
    await waitFor(() => b.getAuthState().step === 'authenticated' && b.getAuthState().verified === true);
    check('tab B adopts the rotated key and resumes the new session', true);
    check('  resume proof used the NEW key', resumeProofJkts.at(-1) === serverBoundJkt);
    check('  the new session was not cleared from storage', (await storage.get(sessionKey)) != null);
    a.destroy();
    b.destroy();
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
