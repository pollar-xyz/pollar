// @pollar smoke test — cross-document session semantics + persist-queue races.
//
// Run with `node tests/smoke-cross-document.cjs` after `npm run build`. Ports
// the scratchpad harnesses that found (and then verified the fixes for) the
// cross-document session-teardown bugs — see tmp/session-cross-document-fixes
// and tmp/session-resume-dpop for the full history. The rest of the suite
// cannot cover this class of bug, for two mock deficiencies this file exists
// to remove:
//
//  1. STORAGE-EVENT SEMANTICS. Browsers deliver the `storage` event to every
//     same-origin document EXCEPT the one that made the write. The other smoke
//     files dispatch synthetic events to every listener (writer included), so
//     cross-document ownership bugs cannot even be written as tests there.
//     Here, each client gets its own "document" (its own window + listener
//     set) and `broadcast()` models all-but-the-writer delivery.
//
//  2. ADAPTER LATENCY. Instant `storage.set()` means the `_persistSession`
//     queue never has depth, so the queued-write races (triple race, destroy
//     with a queued mutation, logout with a queued login persist) never open.
//     Here the adapter's writes can be HELD and released on demand.
//
// Some blocks drive private methods (`_storeSession`, `_clearSession`) on the
// built bundle on purpose: the queued-write interleavings cannot be produced
// through the public API with exact timing, and these are the only possible
// tests of the ownership-by-session-history fix. Treat renames of those
// privates as an API change for this file.

const path = require('node:path');

// ─── The origin: one storage area, N documents ──────────────────────────────
const area = new Map(); // the localStorage backing store for the origin
const documents = new Map(); // docId -> Set<storage handler>

function makeWindow(docId) {
  documents.set(docId, new Set());
  return {
    __docId: docId,
    location: { origin: 'https://app.test', href: 'https://app.test/' },
    addEventListener: (type, cb) => {
      if (type === 'storage') documents.get(docId).add(cb);
    },
    removeEventListener: (type, cb) => {
      if (type === 'storage') documents.get(docId).delete(cb);
    },
  };
}

/** Deliver to every document except the writer — real browser semantics. */
function broadcast(fromDocId, ev) {
  for (const [docId, handlers] of documents) {
    if (docId === fromDocId) continue;
    for (const cb of handlers) cb(ev);
  }
}

/**
 * A localStorage-backed Storage adapter owned by one document. Mirrors the
 * HTML spec: no event when a set does not change the value, none when a
 * remove targets a missing key, and the writer never hears its own event.
 * Session-row writes can be HELD (see `holdWrites`) to give the persist
 * queue depth.
 */
let holdWrites = null; // Promise or null — session-row writes await it
function docStorage(docId) {
  return {
    async get(key) {
      const v = area.get(key);
      return v === undefined ? null : v;
    },
    async set(key, value) {
      if (holdWrites && key.endsWith(':session')) await holdWrites;
      const oldValue = area.has(key) ? area.get(key) : null;
      if (oldValue === value) return;
      area.set(key, value);
      broadcast(docId, { key, oldValue, newValue: value, storageArea: globalThis.localStorage });
    },
    async remove(key) {
      if (!area.has(key)) return;
      const oldValue = area.get(key);
      area.delete(key);
      broadcast(docId, { key, oldValue, newValue: null, storageArea: globalThis.localStorage });
    },
  };
}

/** Unrelated same-origin code (another app, a demo, an injected script). */
const FAKE_SESSION_STORAGE = { __area: 'sessionStorage' };
function foreignClear(docId, which = 'localStorage') {
  if (which === 'localStorage') area.clear();
  broadcast(docId, {
    key: null,
    oldValue: null,
    newValue: null,
    storageArea: which === 'localStorage' ? globalThis.localStorage : FAKE_SESSION_STORAGE,
  });
}

// ─── Browser globals the SDK reads at module load ───────────────────────────
globalThis.window = makeWindow('bootstrap');
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// Minimal network: these blocks exercise storage/queue semantics, not DPoP.
globalThis.fetch = async (req) => {
  const url = typeof req === 'string' ? req : req.url;
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.includes('/auth/logout')) return json({ success: true });
  if (url.includes('/auth/refresh')) {
    return json({
      success: true,
      content: { token: { accessToken: 'AT2', refreshToken: 'RT2', expiresAt: Math.floor(Date.now() / 1000) + 600 } },
    });
  }
  return json({ success: true, content: {} });
};

const SDK_DIST = path.resolve(__dirname, '../packages/core/dist/index.js');
const sdk = require(SDK_DIST);

// A fake KeyManager: deterministic, no IndexedDB, and it records WHOSE key
// gets destroyed so the ownership assertions can see it.
const keyEvents = [];
function fakeKeyManager(docId) {
  return {
    init: async () => {},
    reset: async () => {
      keyEvents.push(docId);
    },
    getPublicJwk: async () => ({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }),
    getThumbprint: async () => 'jkt',
    sign: async () => new Uint8Array(64),
  };
}

const API_KEY = 'pk_smoke_xdoc';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loginContent(clientSessionId, userId) {
  return {
    clientSessionId,
    userId,
    status: 'CONSUMED',
    token: {
      accessToken: `AT_${clientSessionId}`,
      refreshToken: `RT_${clientSessionId}`,
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    },
    user: { ready: true, id: userId },
    wallet: { type: 'internal', address: `G_${userId}` },
    data: { mail: `${userId}@test`, first_name: userId, last_name: 'X', avatar: null, providers: {} },
  };
}

async function openDocument(docId) {
  // Bind this client to its own document: the SDK installs its `storage`
  // listener from `globalThis.window` inside _initialize().
  globalThis.window = makeWindow(docId);
  const client = new sdk.PollarClient({
    apiKey: API_KEY,
    storage: docStorage(docId),
    keyManager: fakeKeyManager(docId),
    baseUrl: 'https://x.test',
    logLevel: 'silent',
  });
  await client.ready();
  return client;
}

function resetOrigin() {
  area.clear();
  documents.clear();
  keyEvents.length = 0;
  holdWrites = null;
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

async function sessionKeyOf() {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(API_KEY));
  const hash = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `pollar:${hash}:session`;
}

(async () => {
  const sessionKey = await sessionKeyOf();

  console.log('── 1. Positive control: the writer never hears its own event ──');
  {
    resetOrigin();
    const A = await openDocument('A');
    await A._storeSession(loginContent('cs_A', 'alice'));
    await sleep(30);
    check('the writing document stays authenticated', A.getAuthState().step === 'authenticated');
    check('  no keypair was destroyed', keyEvents.length === 0, keyEvents);
    A.destroy();
  }

  console.log('\n── 2. A login in one document is adopted by the others ────────');
  {
    resetOrigin();
    const A = await openDocument('A');
    const B = await openDocument('B');
    check('precondition: B is idle', B.getAuthState().step === 'idle');
    await A._storeSession(loginContent('cs_A', 'alice'));
    await sleep(30);
    const bs = B.getAuthState();
    check('B adopted the session with no user action', bs.step === 'authenticated' && bs.session.userId === 'alice', bs.step);
    A.destroy();
    B.destroy();
  }

  console.log("\n── 3. A stale document's teardown cannot kill a fresh login ───");
  {
    // The original T18: B logged in long ago and went stale (its listener is
    // detached, modeling a suspended tab or an adapter degraded to memory, so
    // it does NOT adopt A's fresh session). When B finally tears down — an
    // explicit logout, a failed refresh, a 401 resume — it must not remove the
    // row A now owns, and must not destroy A's keypair.
    resetOrigin();
    const B = await openDocument('B');
    await B._storeSession(loginContent('cs_B_old', 'bob'));
    await sleep(10);
    documents.get('B').clear(); // B goes stale

    const A = await openDocument('A');
    await A._storeSession(loginContent('cs_A', 'alice'));
    await sleep(20);
    check('last-writer-wins: storage holds the fresh session', JSON.parse(area.get(sessionKey)).clientSessionId === 'cs_A');

    await B._clearSession(); // the stale teardown, whatever triggered it
    await sleep(30);
    check("A survives B's teardown of a session B no longer owned", A.getAuthState().step === 'authenticated');
    check('  the fresh row is still in storage', area.has(sessionKey));
    check("  A's DPoP keypair was not destroyed", !keyEvents.includes('A'), keyEvents);
    A.destroy();
    B.destroy();
  }

  console.log('\n── 4. Foreign same-origin storage events are ignored ──────────');
  {
    resetOrigin();
    const A = await openDocument('A');
    makeWindow('unrelated-app');
    await A._storeSession(loginContent('cs_A', 'alice'));
    await sleep(20);
    foreignClear('unrelated-app'); // localStorage.clear() by code that never heard of Pollar
    await sleep(30);
    check('a foreign localStorage.clear() (key === null) is not a logout', A.getAuthState().step === 'authenticated');

    await A._storeSession(loginContent('cs_A2', 'alice')); // re-seed (the clear wiped the area)
    await sleep(20);
    foreignClear('oauth-iframe', 'sessionStorage'); // PKCE/state cleanup in an iframe
    await sleep(30);
    check('an event from a DIFFERENT storage area is ignored', A.getAuthState().step === 'authenticated');
    check('  the localStorage row is untouched', area.has(sessionKey));
    A.destroy();
  }

  console.log("\n── 5. [known limitation] external deletion of A's own row ─────");
  {
    // If something physically removes the very row A holds, A cannot locally
    // distinguish that from a legitimate logout of its own session — the fix
    // is the explicit logout signal carrying the revoked clientSessionId
    // (designed, backlog). This block pins the CURRENT behavior so building
    // that feature flips it consciously.
    resetOrigin();
    const A = await openDocument('A');
    const B = await openDocument('B');
    await B._storeSession(loginContent('cs_B_old', 'bob'));
    await sleep(10);
    await A._storeSession(loginContent('cs_A_new', 'alice'));
    await sleep(20);
    // B, still believing it owns cs_B_old, physically deletes the shared slot
    // (bypassing the SDK's ownership rule — external/legacy code).
    const evOld = area.get(sessionKey);
    area.delete(sessionKey);
    broadcast('B', { key: sessionKey, oldValue: evOld, newValue: null, storageArea: globalThis.localStorage });
    await sleep(30);
    check('an external removal of the row A holds does log A out (documented)', A.getAuthState().step === 'idle');
    A.destroy();
    B.destroy();
  }

  console.log('\n── 6. Triple race: held write + queued login + logout ─────────');
  {
    // The ownership-by-session-history fix (_ownedSessionIds): login B1's
    // write passes the queue's pre-check and is HELD inside the adapter;
    // login-over-login B2's write queues behind it (guard not yet evaluated);
    // logout() fires with both in flight. The logout must still recognize the
    // B1 row that lands as its OWN history and remove it — equality with the
    // session being cleared would refuse ("not mine") and leave the old,
    // never-revoked session to restore fully functional on the next reload.
    resetOrigin();
    const A = await openDocument('A');
    let gate;
    holdWrites = new Promise((r) => (gate = r));
    const p1 = A._storeSession(loginContent('cs_B1', 'u'));
    await sleep(15);
    const p2 = A._storeSession(loginContent('cs_B2', 'u'));
    await sleep(15);
    const lo = A.logout();
    await sleep(15);
    holdWrites = null;
    gate();
    await Promise.allSettled([p1, p2, lo]);
    await sleep(40);
    check('the row is removed (own-history ownership, not equality)', !area.has(sessionKey), area.get(sessionKey));
    check('  the keypair was rotated (removal owned by this client)', keyEvents.includes('A'), keyEvents);
    check('  the client converged to idle', A.getAuthState().step === 'idle', A.getAuthState().step);
    A.destroy();
  }

  console.log('\n── 7. destroy() discards a queued refresh write ───────────────');
  {
    // The login's write is held inside the adapter and OCCUPIES the queue; the
    // refresh completes its network trip and queues its write behind it, guard
    // not yet evaluated; destroy() lands; the queue then advances. The held
    // login write is unavoidable (already inside the adapter) — the refresh's
    // must be dropped by the _destroyed guard: exactly one write lands.
    resetOrigin();
    const A = await openDocument('A');
    let writes = 0;
    const counting = docStorage('A');
    const origSet = counting.set.bind(counting);
    // Wrap AFTER construction so only session writes from here on are counted.
    let gate;
    let armed = false;
    A._storage.set = async (k, v) => {
      if (armed && k.endsWith(':session')) {
        writes++;
        await new Promise((r) => (gate = r));
      }
      area.set(k, v);
    };
    armed = true;
    const p = A._storeSession(loginContent('cs_dq', 'u'));
    await sleep(20);
    const r = A.refresh();
    await sleep(30);
    A.destroy(); // with the refresh mutation still queued
    gate();
    await Promise.allSettled([p, r]);
    await sleep(30);
    check('exactly ONE session write landed (the queued refresh was discarded)', writes === 1, `writes=${writes}`);
    void origSet;
  }

  console.log("\n── 8. logout() with the login's persist still queued ──────────");
  {
    // An old row from a previous session sits in storage; a fresh login's
    // write is HELD; logout() fires before it lands. The write must be
    // discarded (no resurrection) and the old row must not survive either.
    resetOrigin();
    const A = await openDocument('A');
    area.set(sessionKey, JSON.stringify(loginContent('cs_OLD', 'u1')));
    let gate;
    holdWrites = new Promise((r) => (gate = r));
    const p = A._storeSession(loginContent('cs_NEW', 'u2'));
    await sleep(20);
    const lo = A.logout();
    await sleep(20);
    holdWrites = null;
    gate();
    await Promise.allSettled([p, lo]);
    await sleep(30);
    const row = area.get(sessionKey);
    const id = row ? JSON.parse(row).clientSessionId : null;
    check('no session row survives the logout', id === null, `row=${id}`);
    check('  the queued login write did not resurrect (cs_NEW discarded)', id !== 'cs_NEW');
    A.destroy();
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
