// @pollar smoke test — PollarClient request path + refresh singleton.
//
// Run with `node tests/smoke-client.cjs` after `pnpm build`. Mocks `fetch` so
// no real network is required; mocks `localStorage` + `window` so PollarClient
// thinks it runs in a browser.

const path = require('node:path');

globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: () => {},
  removeEventListener: () => {},
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
  check('  proof.htu = full URL no query', proof.htu === 'https://x.test/v1/tx/history');
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

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
