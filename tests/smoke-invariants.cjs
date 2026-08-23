// @pollar smoke test — session/DPoP invariants under randomized operation order.
//
// Run with `node tests/smoke-invariants.cjs` after `npm run build`.
// `node tests/smoke-invariants.cjs <seed>` replays one seed.
//
// Every session bug found in this area so far has the same shape: some `await`
// window lets two pieces of state disagree — the persisted row vs the key it
// names, the recorded `dpopJkt` vs the `cnf.jkt` the server bound, the auth
// state vs the session behind it. Scenario tests pin the cases we already know.
// This one goes after the ones we do not: it drives randomized sequences of
// login / logout / refresh / revalidate / cross-tab events / reload / second
// instance, including deliberately un-awaited overlaps, and after every step
// asserts the properties that must hold no matter the order.
//
// Deterministic: a seeded PRNG picks the operations, and every delay the mock
// server introduces is fixed, so a failing seed replays exactly. The seed is
// printed with any failure.

const path = require('node:path');

// ─── Browser globals (shared across "documents" in one run) ──────────────────
const storageHandlers = new Map(); // handler -> owning client id
globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: (type, fn) => {
    if (type === 'storage') storageHandlers.set(fn, true);
  },
  removeEventListener: (type, fn) => {
    if (type === 'storage') storageHandlers.delete(fn);
  },
  open: () => null,
};
globalThis.document = { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' };
// Must exist BEFORE the SDK module is required: `isBrowser` is evaluated once,
// at module load. Every client gets its own injected memory adapter, so this
// one is never actually read.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// ─── Minimal IndexedDB shim (see tests/smoke-resume.cjs) ─────────────────────
const IDB = new Map();
function idbReq(run) {
  const r = { result: undefined, error: null, onsuccess: null, onerror: null };
  queueMicrotask(() => {
    try {
      r.result = run();
      r.onsuccess?.();
    } catch (e) {
      r.error = e;
      r.onerror?.();
    }
  });
  return r;
}
globalThis.indexedDB = {
  open(name) {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => {
      const isNew = !IDB.has(name);
      if (isNew) IDB.set(name, new Map());
      const stores = IDB.get(name);
      req.result = {
        objectStoreNames: { contains: (s) => stores.has(s) },
        createObjectStore: (s) => (stores.set(s, new Map()), {}),
        close: () => {},
        transaction: (storeName) => {
          const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
          tx.objectStore = () => {
            if (!stores.has(storeName)) stores.set(storeName, new Map());
            const store = stores.get(storeName);
            const wrap = (fn) => {
              const r = idbReq(fn);
              queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
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
      if (isNew) req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};

const SDK_DIST = path.resolve(__dirname, '../packages/core/dist/index.js');
const sdk = require(SDK_DIST);

let calculateJwkThumbprint;
try {
  ({ calculateJwkThumbprint } = require('jose'));
} catch {
  try {
    ({ calculateJwkThumbprint } = require(path.resolve(__dirname, '../node_modules/jose')));
  } catch {
    console.error('FATAL: cannot resolve `jose`. Install it in this workspace.');
    process.exit(1);
  }
}

const b64uJson = (seg) => JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Let every fire-and-forget continuation land before asserting. */
const settle = async () => {
  for (let i = 0; i < 6; i++) await sleep(5);
};

/** mulberry32 — small, seeded, reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Mock server ─────────────────────────────────────────────────────────────
// Records, per clientSessionId, the cnf.jkt it bound at /auth/login — the
// ground truth every invariant is checked against.
const boundJktBySession = new Map();
let sessionSeq = 0;
let revokeEverything = false;
let logoutDelayMs = 0;
let loginDelayMs = 0;

globalThis.fetch = async (req) => {
  const p = new URL(req.url).pathname;
  const json = (obj, init) => new Response(JSON.stringify(obj), { status: 200, ...init });

  if (p.endsWith('/auth/session')) return json({ success: true, content: { clientSessionId: `cs${sessionSeq + 1}` } });
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
  if (p.endsWith('/auth/logout')) {
    if (logoutDelayMs) await sleep(logoutDelayMs);
    return json({ success: true });
  }
  if (p.endsWith('/auth/login')) {
    const body = await req.clone().json();
    const id = `cs${++sessionSeq}`;
    boundJktBySession.set(id, await calculateJwkThumbprint(body.dpopJwk, 'sha256'));
    if (loginDelayMs) await sleep(loginDelayMs);
    return json({
      code: 'SDK_LOGIN_SUCCESS',
      success: true,
      content: {
        clientSessionId: id,
        userId: 'u1',
        status: 'CONSUMED',
        token: { accessToken: `AT_${id}`, refreshToken: `RT_${id}`, expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'internal', address: 'GABC' },
        data: { mail: 'a@b.c', first_name: 'a', last_name: 'b', avatar: null, providers: {} },
      },
    });
  }
  if (p.endsWith('/auth/refresh')) {
    if (revokeEverything) return json({ code: 'SDK_AUTH_INVALID_TOKEN' }, { status: 401 });
    const body = await req
      .clone()
      .json()
      .catch(() => ({}));
    const id = String(body.refreshToken || '').replace(/^RT_/, '');
    if (!boundJktBySession.has(id)) return json({ code: 'SDK_AUTH_INVALID_TOKEN' }, { status: 401 });
    return json({
      success: true,
      content: { token: { accessToken: `AT_${id}`, refreshToken: `RT_${id}`, expiresAt: Math.floor(Date.now() / 1000) + 600 } },
    });
  }
  if (p.endsWith('/auth/session/resume')) {
    if (revokeEverything) return json({ code: 'SDK_AUTH_SESSION_REVOKED' }, { status: 403 });
    const dpop = req.headers.get('DPoP');
    if (!dpop) {
      return json(
        { code: 'SDK_AUTH_DPOP_USE_NONCE', reason: 'no-proof' },
        { status: 401, headers: { 'WWW-Authenticate': 'DPoP error="use_dpop_nonce"', 'DPoP-Nonce': 'N1' } },
      );
    }
    const [h, pl] = dpop.split('.');
    if (!b64uJson(pl).nonce) {
      return json(
        { code: 'SDK_AUTH_DPOP_USE_NONCE', reason: 'no-nonce' },
        { status: 401, headers: { 'WWW-Authenticate': 'DPoP error="use_dpop_nonce"', 'DPoP-Nonce': 'N1' } },
      );
    }
    // The server checks the proof key against the token it was handed.
    const at = (req.headers.get('Authorization') || '').replace(/^DPoP /, '');
    const expected = boundJktBySession.get(at.replace(/^AT_/, ''));
    const jkt = await calculateJwkThumbprint(b64uJson(h).jwk, 'sha256');
    if (!expected || jkt !== expected) {
      return json(
        { code: 'SDK_AUTH_DPOP_INVALID', reason: 'thumbprint-mismatch' },
        { status: 401, headers: { 'WWW-Authenticate': 'DPoP error="invalid_token"' } },
      );
    }
    return json({ success: true, content: { mail: 'a@b.c', first_name: 'a', last_name: 'b', avatar: null, providers: {} } });
  }
  return json({ success: true, content: {} });
};

let pass = 0;
let fail = 0;
const failures = [];
function report(seed, step, label, detail) {
  fail++;
  failures.push(`seed ${seed}, after step ${step}: ${label}${detail ? ` (${detail})` : ''}`);
}

// ─── The invariants ──────────────────────────────────────────────────────────
/**
 * Checked after EVERY operation, for every live client. `world` carries the
 * shared storage adapter and the API key. Returns a failure string or null.
 */
async function checkInvariants(world, clients) {
  const raw = await world.storage.get(`pollar:${world.apiKeyHash}:session`);
  const row = raw ? JSON.parse(raw) : null;

  // I1 — a persisted session's recorded key binding must be the one the server
  //      actually bound for that session. A row that vouches for the wrong key
  //      makes the restore-time precheck wave through a doomed session.
  if (row && row.dpopJkt) {
    const truth = boundJktBySession.get(row.clientSessionId);
    if (truth && row.dpopJkt !== truth) {
      return `I1 persisted dpopJkt !== server cnf.jkt for ${row.clientSessionId}`;
    }
  }

  // I2 — the key a persisted session names must still exist locally. Otherwise
  //      the session is already dead and the user is logged out on next load.
  if (row && row.dpopJkt) {
    const live = await new sdk.WebCryptoKeyManager(world.apiKey).getThumbprint().catch(() => null);
    if (live !== row.dpopJkt) return `I2 persisted session names a key that is not the stored one`;
  }

  for (const c of clients) {
    if (c.destroyed) continue;
    const st = c.client.getAuthState();
    // I3 — `authenticated` always carries the session it is about.
    if (st.step === 'authenticated' && !st.session) return `I3 authenticated with no session on ${c.id}`;
    // I4 — an authenticated client must hold a usable token.
    if (st.step === 'authenticated' && !st.session.token?.accessToken)
      return `I4 authenticated without an access token on ${c.id}`;
    // I5 — a client never comes back to a session it logged out of. This is
    //      deliberately per-client: two instances in one document legitimately
    //      hold DIFFERENT sessions (each is valid server-side, and only a clear
    //      is announced between them), so "everyone agrees with storage" is not
    //      a property the SDK offers. What it must offer is that a logout
    //      sticks for the client that performed it - the resurrection bug.
    if (st.step === 'authenticated' && c.loggedOut.has(st.session.clientSessionId)) {
      return `I5 ${c.id} is authenticated again as ${st.session.clientSessionId}, which it logged out of`;
    }
  }
  return null;
}

// ─── Operations ──────────────────────────────────────────────────────────────
async function login(client) {
  client.beginEmailLogin();
  for (let i = 0; i < 200 && client.getAuthState().step !== 'entering_email'; i++) await sleep(2);
  if (client.getAuthState().step !== 'entering_email') return;
  client.sendEmailCode('a@b.c');
  for (let i = 0; i < 200 && client.getAuthState().step !== 'entering_code'; i++) await sleep(2);
  if (client.getAuthState().step !== 'entering_code') return;
  client.verifyEmailCode('123456');
  for (let i = 0; i < 300 && client.getAuthState().step !== 'authenticated'; i++) await sleep(2);
}

function makeVisibility() {
  const cbs = [];
  return {
    provider: { isVisible: () => true, onChange: (cb) => (cbs.push(cb), () => {}) },
    flap: () => cbs.forEach((cb) => cb(true)),
  };
}

async function runSeed(seed, steps) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const apiKey = `pk_inv_${seed}`;
  const storage = sdk.createMemoryAdapter();
  IDB.clear();
  boundJktBySession.clear();
  sessionSeq = 0;
  revokeEverything = false;
  logoutDelayMs = 0;
  loginDelayMs = 0;

  const world = { apiKey, storage, apiKeyHash: null };
  const clients = [];
  const spawn = async (id) => {
    const vis = makeVisibility();
    const client = new sdk.PollarClient({
      apiKey,
      storage,
      baseUrl: 'https://x.test',
      visibilityProvider: vis.provider,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
    await client.ready();
    world.apiKeyHash = client.apiKeyHash;
    const entry = { id, client, vis, destroyed: false, loggedOut: new Set() };
    clients.push(entry);
    return entry;
  };

  await spawn('A');

  const OPS = [
    'login',
    'logout',
    'logout-racing-login',
    'refresh',
    'revalidate',
    'reload',
    'second-instance',
    'cross-tab-clear',
    'revoke-then-use',
  ];

  for (let step = 1; step <= steps; step++) {
    const live = clients.filter((c) => !c.destroyed);
    const target = pick(live);
    const op = pick(OPS);

    try {
      switch (op) {
        case 'login':
          await login(target.client);
          break;
        case 'logout': {
          const before = target.client.getAuthState().session?.clientSessionId;
          await target.client.logout();
          if (before) target.loggedOut.add(before);
          break;
        }
        case 'logout-racing-login': {
          // The shape that produced the worst bug: logout is async and nobody
          // awaits it, so a whole login lands inside its window.
          logoutDelayMs = 60;
          const before = target.client.getAuthState().session?.clientSessionId;
          const pending = target.client.logout();
          await sleep(5);
          await login(target.client);
          await pending;
          if (before) target.loggedOut.add(before);
          logoutDelayMs = 0;
          break;
        }
        case 'refresh':
          await target.client.refresh().catch(() => {});
          break;
        case 'revalidate':
          target.vis.flap();
          target.vis.flap();
          break;
        case 'reload': {
          // Same storage + IndexedDB, brand new client: a page load.
          target.client.destroy();
          target.destroyed = true;
          await spawn(target.id + "'");
          break;
        }
        case 'second-instance':
          if (live.length < 3) await spawn(`S${step}`);
          break;
        case 'cross-tab-clear': {
          // Another document removed the row; deliver the event to everyone
          // except the writer, like a browser does.
          const key = `pollar:${world.apiKeyHash}:session`;
          await storage.remove(key);
          for (const fn of storageHandlers.keys()) fn({ key, newValue: null, storageArea: globalThis.localStorage });
          break;
        }
        case 'revoke-then-use':
          revokeEverything = true;
          target.vis.flap();
          await settle();
          revokeEverything = false;
          break;
      }
    } catch {
      // An operation rejecting is allowed (a logout with no session, a refresh
      // with no token). What is NOT allowed is the state it leaves behind.
    }

    await settle();
    const broken = await checkInvariants(world, clients);
    if (broken) {
      report(seed, `${step} (${op} on ${target.id})`, broken);
      break;
    }
  }

  for (const c of clients) if (!c.destroyed) c.client.destroy();
}

(async () => {
  const argSeed = process.argv[2] ? Number(process.argv[2]) : null;
  const seeds = argSeed !== null ? [argSeed] : Array.from({ length: 12 }, (_, i) => 1000 + i);
  const steps = argSeed !== null ? 40 : 18;

  console.log(`── Randomized session/DPoP invariants (${seeds.length} seed(s) x ${steps} steps) ──`);
  for (const seed of seeds) {
    const before = fail;
    await runSeed(seed, steps);
    if (fail === before) {
      pass++;
      console.log(`  OK    seed ${seed}`);
    } else {
      console.log(`  FAIL  seed ${seed}`);
    }
  }
  for (const f of failures) console.log(`        ${f}`);
  if (failures.length) console.log(`\n  Replay one with: node tests/smoke-invariants.cjs <seed>`);
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
