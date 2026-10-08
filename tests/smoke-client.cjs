// @pollar smoke test — PollarClient request path + refresh singleton.
//
// Run with `node tests/smoke-client.cjs` after `pnpm build`. Mocks `fetch` so
// no real network is required; mocks `localStorage` + `window` so PollarClient
// thinks it runs in a browser.

const path = require('node:path');

// `storage` handlers are captured so block 11 can deliver an event the way a
// browser does: to the OTHER tab only, never to the one that wrote.
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

const SDK_DIST = path.resolve(__dirname, '../packages/core/dist/index.js');
const sdk = require(SDK_DIST);

// jose is hoisted at workspace root (transitive via sdk-api). If you run this
// outside a workspace, install jose locally.
let decodeJwt;
try {
  ({ decodeJwt } = require('jose'));
} catch {
  // Fallback resolution paths inside the monorepo
  const candidates = [
    path.resolve(__dirname, '../node_modules/jose'),
    path.resolve(__dirname, '../../pollar-platform/node_modules/.pnpm/jose@5.10.0/node_modules/jose'),
  ];
  for (const c of candidates) {
    try {
      ({ decodeJwt } = require(c));
      break;
    } catch {}
  }
  if (!decodeJwt) {
    console.error('FATAL: cannot resolve `jose`. Install in this workspace or in pollar-platform.');
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

// Poll until `cond()` is true (or time out). Used to await fire-and-forget work
// (e.g. the `/auth/session/resume` revalidation) that the SDK does not expose a
// promise for.
async function waitFor(cond, timeoutMs = 1000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condition not met within timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

(async () => {
  const apiKey = 'pk_smoke_client';
  const storage = sdk.createMemoryAdapter();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  // Namespace width is 16 bytes / 32 hex (see lib/api-key-hash.ts).
  const apiKeyHash = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const sessionKey = `pollar:${apiKeyHash}:session`;

  // Pre-seed a valid session so PollarClient enters the authenticated state.
  await storage.set(
    sessionKey,
    JSON.stringify({
      clientSessionId: 'cs',
      userId: 'u',
      status: 'CONSUMED',
      token: {
        accessToken: 'AT',
        refreshToken: 'RT',
        expiresAt: Math.floor(Date.now() / 1000) + 600,
      },
      user: { ready: true },
      // `wallet.type` (internal|smart|external) is required by isValidSession;
      // the legacy `publicKey`-only shape is no longer accepted.
      wallet: { type: 'internal', address: null },
    }),
  );

  // Capture every outgoing request — let us inspect headers without a real server.
  const calls = [];
  globalThis.fetch = async (req) => {
    const headers = {};
    req.headers.forEach((v, k) => (headers[k] = v));
    calls.push({ url: req.url, method: req.method, headers });
    if (req.url.includes('/auth/refresh')) {
      return new Response(
        JSON.stringify({
          success: true,
          content: {
            token: {
              accessToken: 'NEW_AT',
              refreshToken: 'NEW_RT',
              expiresAt: Math.floor(Date.now() / 1000) + 600,
            },
          },
        }),
        { status: 200 },
      );
    }
    if (req.url.includes('/auth/session/resume')) {
      // Restored-session revalidation. Deliberately omit DPoP-Nonce so the
      // nonce-flow assertions below observe the tx/history pair in isolation
      // (otherwise resume would capture the nonce before the first tx/history).
      return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true, content: {} }), {
      status: 200,
      headers: { 'DPoP-Nonce': 'rotated' },
    });
  };

  console.log('── 1. Construction + ready() ─────────────────────────────────');
  const client = new sdk.PollarClient({
    apiKey,
    storage,
    baseUrl: 'https://x.test',
  });
  await client.ready();
  check('client.ready() resolves', true);
  check('  apiKeyHash matches local computation', client.apiKeyHash === apiKeyHash);

  // A restored session kicks off a fire-and-forget `/auth/session/resume`
  // revalidation. Wait for it to land, then clear `calls` so the request-path
  // assertions below index only the requests they themselves trigger.
  await waitFor(() => calls.some((c) => c.url.includes('/auth/session/resume')));
  calls.length = 0;

  console.log('\n── 2. Authenticated request carries DPoP + Authorization ─────');
  await client.fetchTxHistory();
  const first = calls[0];
  check('Authorization: DPoP <AT>', first?.headers.authorization === 'DPoP AT');
  check('  DPoP header is JWS (3 dots)', first?.headers.dpop?.split('.').length === 3);
  check('  x-pollar-api-key set', first?.headers['x-pollar-api-key'] === apiKey);
  const proof = decodeJwt(first.headers.dpop);
  check('  proof.htm = GET', proof.htm === 'GET');
  check('  proof.htu = full URL no query', proof.htu === 'https://x.test/v2/tx/history');
  check('  proof.iat ≈ now', Math.abs(proof.iat - Math.floor(Date.now() / 1000)) < 5);
  check('  proof.ath present on resource request', typeof proof.ath === 'string');
  check('  proof.nonce absent on first call', proof.nonce === undefined);

  console.log('\n── 3. DPoP-Nonce captured + sent in next proof ───────────────');
  await client.fetchTxHistory();
  const second = decodeJwt(calls[1].headers.dpop);
  check('proof.nonce = "rotated" on next call', second.nonce === 'rotated');

  console.log('\n── 4. /auth/refresh: no ath, no Authorization (RFC 9449 §5) ──');
  calls.length = 0;
  await client.refresh();
  const rCall = calls[0];
  check('1 refresh call fired', calls.length === 1);
  const rProof = decodeJwt(rCall.headers.dpop);
  check('  refresh proof.ath undefined', rProof.ath === undefined);
  check('  refresh has NO Authorization header', !rCall.headers.authorization);
  check('  refresh proof.htm = POST', rProof.htm === 'POST');

  console.log('\n── 5. Singleton: 10 concurrent refresh() → 1 fetch ───────────');
  calls.length = 0;
  await Promise.all(Array.from({ length: 10 }, () => client.refresh()));
  const refreshCalls = calls.filter((c) => c.url.includes('/auth/refresh'));
  check('exactly 1 /auth/refresh call', refreshCalls.length === 1);

  console.log('\n── 6. Token rotation persisted + used on next request ────────');
  calls.length = 0;
  await client.fetchTxHistory();
  check('next request uses NEW_AT', calls[0]?.headers.authorization === 'DPoP NEW_AT');

  console.log('\n── 7. Persisted session shape: no PII, namespaced key ────────');
  const persisted = JSON.parse(await storage.get(sessionKey));
  check('no `data` field in persisted session', persisted.data === undefined);
  check('  storage key namespaced by apiKeyHash', sessionKey.includes(apiKeyHash));
  check('  token.accessToken rotated to NEW_AT', persisted.token.accessToken === 'NEW_AT');

  console.log('\n── 8. logout() clears session + key ──────────────────────────');
  client.logout();
  await new Promise((r) => setTimeout(r, 50));
  check('session removed from storage', (await storage.get(sessionKey)) === null);

  console.log('\n── 9. apiKeyHash getter throws before ready() ────────────────');
  const client2 = new sdk.PollarClient({
    apiKey: 'other',
    storage: sdk.createMemoryAdapter(),
    baseUrl: 'https://x.test',
  });
  let threw = false;
  try {
    void client2.apiKeyHash;
  } catch {
    threw = true;
  }
  check('apiKeyHash throws before ready()', threw);
  await client2.ready();
  check('  apiKeyHash works after ready()', typeof client2.apiKeyHash === 'string' && client2.apiKeyHash.length === 32);
  client2.destroy();

  console.log('\n── 10. A wallet mid-provisioning is watched until it lands ───');
  // Async provisioning: login returns before the Stellar account exists, so the
  // client polls /wallet/state and reports the transition. Its own fetch mock,
  // so the call counting here cannot be disturbed by the blocks above.
  // The block-1 client still holds this API key; two live clients on one key
  // share a session and warn about it, which would be noise here.
  client.destroy();
  const provStorage = sdk.createMemoryAdapter();
  await provStorage.set(
    sessionKey,
    JSON.stringify({
      clientSessionId: 'cs-prov',
      userId: 'u',
      status: 'CONSUMED',
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
      user: { ready: true },
      wallet: {
        type: 'internal',
        address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        provisioning: 'CREATING',
      },
    }),
  );

  const prevFetch = globalThis.fetch;
  let stateCalls = 0;
  let reported = 'CREATING';
  globalThis.fetch = async (req) => {
    if (req.url.includes('/wallet/state')) {
      stateCalls++;
      return new Response(
        JSON.stringify({
          success: true,
          code: 'SDK_WALLET_STATE',
          content: {
            address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
            chain: 'STELLAR',
            provisioning: reported,
            existsOnStellar: reported === 'READY',
          },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
  };

  const provClient = new sdk.PollarClient({ apiKey, storage: provStorage, baseUrl: 'https://x.test' });
  await provClient.ready();
  const seen = [];
  const unsubscribe = provClient.onWalletStateChange((p) => seen.push(p));
  check('replays the current value on subscribe', seen[0] === 'CREATING', seen);

  // The account lands between the first check and the second.
  reported = 'READY';
  await waitFor(() => seen.includes('READY'), 6000);
  check('reports READY once the account is on the ledger', seen[seen.length - 1] === 'READY');
  check('  and the wallet carries it', provClient.getWallet()?.provisioning === 'READY');
  check('  and existsOnStellar follows', provClient.getWallet()?.existsOnStellar === true);

  const callsAtReady = stateCalls;
  await new Promise((r) => setTimeout(r, 1500));
  check('stops polling once READY', stateCalls === callsAtReady, { callsAtReady, stateCalls });

  unsubscribe();
  provClient.destroy();
  globalThis.fetch = prevFetch;

  console.log('\n── 11. Wallet state reaches a subscriber the watch did not serve ─');
  // The watch reports only what ITS poll finds. The session also changes hands
  // without it: a restore from storage on a cold start, and a sibling tab
  // persisting the value its own poll found. A subscriber must hear those too,
  // or a "preparing your account" screen built on the callback never clears.
  const wsPrevFetch = globalThis.fetch;
  let wsReported = 'CREATING';
  let wsStateCalls = 0;
  globalThis.fetch = async (req) => {
    if (req.url.includes('/wallet/state')) {
      wsStateCalls++;
      return new Response(
        JSON.stringify({
          success: true,
          code: 'SDK_WALLET_STATE',
          content: {
            address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
            chain: 'STELLAR',
            provisioning: wsReported,
            existsOnStellar: wsReported === 'READY',
          },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
  };
  const wsSession = (provisioning) =>
    JSON.stringify({
      clientSessionId: 'cs-shared',
      userId: 'u',
      status: 'CONSUMED',
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
      user: { ready: true },
      wallet: { type: 'internal', address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', provisioning },
    });

  // (a) A sibling tab's poll found READY and persisted it. This tab adopts the
  //     row through the `storage` event, so its own poll has nothing new to say.
  {
    wsReported = 'CREATING';
    const wsStorage = sdk.createMemoryAdapter();
    await wsStorage.set(sessionKey, wsSession('CREATING'));
    const tabA = new sdk.PollarClient({ apiKey, storage: wsStorage, baseUrl: 'https://x.test' });
    await tabA.ready();
    await waitFor(() => tabA.getAuthState().verified === true);
    const seen = [];
    const off = tabA.onWalletStateChange((p) => seen.push(p));
    check('cross-tab: replays CREATING on subscribe', seen[0] === 'CREATING', seen);

    const row = wsSession('READY');
    await wsStorage.set(sessionKey, row);
    for (const h of storageHandlers)
      h({ key: sessionKey, newValue: row, oldValue: null, storageArea: globalThis.localStorage });
    await waitFor(() => tabA.getWallet()?.provisioning === 'READY');
    check("cross-tab: a sibling tab's READY reaches onWalletStateChange", seen.includes('READY'), seen);

    // The watch's own poll now answers READY as well: adopted already, so no
    // second emission.
    wsReported = 'READY';
    const callsBefore = wsStateCalls;
    await waitFor(() => wsStateCalls > callsBefore, 6000);
    await new Promise((r) => setTimeout(r, 50));
    check('  and the poll that follows does not report it twice', seen.filter((p) => p === 'READY').length === 1, seen);
    off();
    tabA.destroy();
  }

  // (b) Cold start with a READY row, subscribing before `ready()` resolves, as
  //     a mount-time effect does. Nothing will ever transition, so the restore
  //     itself has to deliver the value.
  {
    wsReported = 'READY';
    const wsStorage = sdk.createMemoryAdapter();
    await wsStorage.set(sessionKey, wsSession('READY'));
    const cold = new sdk.PollarClient({ apiKey, storage: wsStorage, baseUrl: 'https://x.test' });
    const seen = [];
    const off = cold.onWalletStateChange((p) => seen.push(p));
    await cold.ready();
    check('cold start (READY): the restore delivers the value to an early subscriber', seen[0] === 'READY', seen);
    await waitFor(() => cold.getAuthState().verified === true);
    await new Promise((r) => setTimeout(r, 50));
    check('  and the resume that follows does not repeat it', seen.length === 1, seen);
    off();
    cold.destroy();
  }

  // (c) Cold start with a CREATING row, subscribing before `ready()`: the
  //     restore delivers CREATING, the watch delivers READY, each exactly once.
  {
    wsReported = 'CREATING';
    const wsStorage = sdk.createMemoryAdapter();
    await wsStorage.set(sessionKey, wsSession('CREATING'));
    const cold = new sdk.PollarClient({ apiKey, storage: wsStorage, baseUrl: 'https://x.test' });
    const seen = [];
    const off = cold.onWalletStateChange((p) => seen.push(p));
    await cold.ready();
    check('cold start (CREATING): the restore delivers CREATING to an early subscriber', seen[0] === 'CREATING', seen);
    wsReported = 'READY';
    await waitFor(() => seen.includes('READY'), 6000);
    check('  and the watch delivers READY, each exactly once', seen.join(',') === 'CREATING,READY', seen);
    off();
    cold.destroy();
  }
  globalThis.fetch = wsPrevFetch;

  console.log('\n── 12. The provisioning watch under adversarial conditions ────');
  // One block per way the watch could strand a UI on "preparing your account".
  // Each sub-block owns its fetch mock and client so the timing in one cannot
  // disturb the counting in another.
  const advSession = (provisioning, expiresInSec = 600) =>
    JSON.stringify({
      clientSessionId: 'cs-adv',
      userId: 'u',
      status: 'CONSUMED',
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + expiresInSec },
      user: { ready: true },
      wallet: { type: 'internal', address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', provisioning },
    });
  const walletState = (provisioning) =>
    new Response(
      JSON.stringify({
        success: true,
        code: 'SDK_WALLET_STATE',
        content: {
          address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          chain: 'STELLAR',
          provisioning,
          existsOnStellar: provisioning === 'READY',
        },
      }),
      { status: 200 },
    );
  const advPrevFetch = globalThis.fetch;

  // (a) A restored session whose access token is ALREADY expired refreshes
  //     inline and never reaches `_resume`, so that branch has to arm the watch
  //     itself. Without it the wallet stays CREATING for the life of the client
  //     and the UI never unblocks.
  {
    let advReported = 'CREATING';
    globalThis.fetch = async (req) => {
      if (req.url.includes('/wallet/state')) return walletState(advReported);
      if (req.url.includes('/auth/refresh')) {
        return new Response(
          JSON.stringify({
            success: true,
            content: {
              token: { accessToken: 'AT2', refreshToken: 'RT2', expiresAt: Math.floor(Date.now() / 1000) + 600 },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
    };
    const st = sdk.createMemoryAdapter();
    await st.set(sessionKey, advSession('CREATING', -60)); // expired an hour ago in token terms
    const c = new sdk.PollarClient({ apiKey, storage: st, baseUrl: 'https://x.test' });
    const seen = [];
    const off = c.onWalletStateChange((p) => seen.push(p));
    await c.ready();
    check('expired token: the inline refresh still surfaces CREATING', seen[0] === 'CREATING', seen);
    advReported = 'READY';
    let landed = true;
    try {
      await waitFor(() => seen.includes('READY'), 6000);
    } catch {
      landed = false;
    }
    check('expired token: the watch still runs, so READY arrives', landed, seen);
    check('  and the wallet carries it', c.getWallet()?.provisioning === 'READY');
    off();
    c.destroy();
  }

  // (b) Two /wallet/state checks in flight at once (the watch runs its own
  //     schedule while `refreshWalletState()` is public) can resolve out of
  //     order. The older answer must not walk READY back to CREATING.
  {
    let nth = 0;
    let releaseSlow;
    const slowGate = new Promise((r) => (releaseSlow = r));
    globalThis.fetch = async (req) => {
      if (req.url.includes('/wallet/state')) {
        // The FIRST check issued is the slow one, and it answers with the stale
        // value. Everything after it answers READY.
        if (++nth === 1) {
          await slowGate;
          return walletState('CREATING');
        }
        return walletState('READY');
      }
      return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
    };
    const st = sdk.createMemoryAdapter();
    await st.set(sessionKey, advSession('CREATING'));
    const c = new sdk.PollarClient({ apiKey, storage: st, baseUrl: 'https://x.test' });
    await c.ready();
    const seen = [];
    const off = c.onWalletStateChange((p) => seen.push(p));

    const slow = c.refreshWalletState(); // issued first, resolves last
    const fast = await c.refreshWalletState(); // issued second, resolves first
    check('out-of-order: the newer check applies READY', fast === 'READY' && c.getWallet()?.provisioning === 'READY', {
      fast,
    });

    releaseSlow();
    const slowAnswer = await slow;
    check('out-of-order: the older answer does NOT regress the wallet', c.getWallet()?.provisioning === 'READY', {
      provisioning: c.getWallet()?.provisioning,
    });
    check('  and existsOnStellar stays true', c.getWallet()?.existsOnStellar === true);
    check('  and no CREATING is re-emitted after READY', seen.lastIndexOf('READY') === seen.length - 1, seen);
    // The loser reports what the wallet says NOW, so the watch reading it does
    // not keep polling an account that already landed.
    check('  and the losing call answers with the value that won', slowAnswer === 'READY', { slowAnswer });
    off();
    c.destroy();
  }

  // (c) A provisioning value outside the union must not be applied OR persisted:
  //     `isValidSession` rejects it on the next restore, so writing it would
  //     cost the user their session over a field they never asked about.
  {
    globalThis.fetch = async (req) => {
      if (req.url.includes('/wallet/state')) return walletState('PENDING');
      return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
    };
    const st = sdk.createMemoryAdapter();
    await st.set(sessionKey, advSession('CREATING'));
    const c = new sdk.PollarClient({ apiKey, storage: st, baseUrl: 'https://x.test' });
    await c.ready();
    const answer = await c.refreshWalletState();
    check('unknown value: refreshWalletState reports nothing', answer === null, { answer });
    check('  and the wallet keeps the value it had', c.getWallet()?.provisioning === 'CREATING');
    const row = JSON.parse(await st.get(sessionKey));
    check('  and the persisted row was not poisoned', row.wallet.provisioning === 'CREATING', row.wallet);
    c.destroy();

    // The real cost of persisting it: prove the row still restores.
    const c2 = new sdk.PollarClient({ apiKey, storage: st, baseUrl: 'https://x.test' });
    await c2.ready();
    check('  and the session still restores on the next load', c2.getAuthState().step === 'authenticated');
    c2.destroy();
  }

  // (d) One subscriber that throws must not cost the others the transition -
  //     this is the signal a "preparing" screen waits on, and a listener skipped
  //     here has nothing else to wake it.
  {
    let advReported = 'CREATING';
    globalThis.fetch = async (req) => {
      if (req.url.includes('/wallet/state')) return walletState(advReported);
      return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
    };
    const st = sdk.createMemoryAdapter();
    await st.set(sessionKey, advSession('CREATING'));
    const c = new sdk.PollarClient({ apiKey, storage: st, baseUrl: 'https://x.test' });
    await c.ready();

    let offBad;
    let threwOnSubscribe = false;
    try {
      offBad = c.onWalletStateChange(() => {
        throw new Error('listener boom');
      });
    } catch {
      threwOnSubscribe = true;
    }
    check('a throwing listener does not break subscribe()', !threwOnSubscribe && typeof offBad === 'function');

    const seen = [];
    const off = c.onWalletStateChange((p) => seen.push(p));
    check('  the listener after it still gets the replay', seen[0] === 'CREATING', seen);

    advReported = 'READY';
    let landed = true;
    try {
      await waitFor(() => seen.includes('READY'), 6000);
    } catch {
      landed = false;
    }
    check('  and still gets the transition', landed, seen);
    check('  and the wallet applied it', c.getWallet()?.provisioning === 'READY');
    off();
    offBad?.();
    c.destroy();
  }

  // (e) `isWalletNotReady` is documented to accept a RETURNED outcome, so the
  //     build path has to carry the server's code across the boundary. Reducing
  //     a 409 to `{ status: 'error' }` makes the helper answer false for the one
  //     failure it exists to name.
  {
    globalThis.fetch = async (req) => {
      if (req.url.includes('/tx/build')) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'SDK_WALLET_NOT_READY',
            details: 'wallet account is not on the ledger yet',
          }),
          { status: 409 },
        );
      }
      return new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
    };
    const st = sdk.createMemoryAdapter();
    await st.set(sessionKey, advSession('CREATING'));
    const c = new sdk.PollarClient({ apiKey, storage: st, baseUrl: 'https://x.test' });
    await c.ready();
    const built = await c.buildTx('payment', {
      destination: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      amount: '1',
      asset: 'native',
    });
    check('buildTx surfaces the failure', built.status === 'error', built);
    check('  and keeps the backend code', built.code === sdk.WALLET_NOT_READY_CODE, built);
    check('  so isWalletNotReady() recognizes the returned outcome', sdk.isWalletNotReady(built) === true);
    check('  and the transaction state carries the code too', c.getTransactionState().code === sdk.WALLET_NOT_READY_CODE, {
      state: c.getTransactionState(),
    });
    c.destroy();
  }
  globalThis.fetch = advPrevFetch;

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
