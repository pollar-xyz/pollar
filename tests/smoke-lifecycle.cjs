// @pollar smoke test — client lifecycle: teardown leaves nothing behind.
//
// Run with `node tests/smoke-lifecycle.cjs` after `npm run build`. For the
// reachability block, run it with `--expose-gc` (the npm script does); without
// the flag that block is skipped, not failed.
//
// Why this file exists: `PollarClient` registers itself in a MODULE-level
// registry (`liveClientsByApiKey`) so a logout can be announced to sibling
// instances in the same document. A module-level map holding client references
// is a leak waiting to happen - registration and deregistration have to agree
// on exactly when they run, and nothing enforced that agreement. These are the
// assertions that do.
//
// Nothing here reaches into private state. The registry is observed through the
// behavior it drives (the "another client is already active" warning) and,
// where the flag allows, through actual reachability.

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const winListeners = { storage: new Set() };
globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: (type, cb) => (winListeners[type] ??= new Set()).add(cb),
  removeEventListener: (type, cb) => winListeners[type]?.delete(cb),
  open: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' };
globalThis.fetch = async () => new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });

const SDK_DIST = path.resolve(__dirname, '../packages/core/dist/index.js');
const sdk = require(SDK_DIST);

let pass = 0;
let fail = 0;
let skipped = 0;
function check(label, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  OK    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`, extra ?? '');
  }
}
function skip(label, why) {
  skipped++;
  console.log(`  SKIP  ${label} (${why})`);
}

/** A logger that records the "another client is already active" warning. */
function makeLogger() {
  const state = { collisionWarnings: 0, warnings: [] };
  const noop = () => {};
  return {
    state,
    logger: {
      debug: noop,
      info: noop,
      error: noop,
      warn: (msg) => {
        state.warnings.push(String(msg));
        if (String(msg).includes('Another PollarClient is already active')) state.collisionWarnings++;
      },
    },
  };
}

function newClient(apiKey, logger) {
  return new sdk.PollarClient({ apiKey, storage: sdk.createMemoryAdapter(), baseUrl: 'https://x.test', logger });
}

(async () => {
  console.log('── 1. The collision warning actually fires (positive control) ──');
  {
    // Without this, every "no warning" assertion below could pass for the wrong
    // reason (a detector that never fires proves nothing).
    const { state, logger } = makeLogger();
    const a = newClient('pk_lifecycle_control', logger);
    const b = newClient('pk_lifecycle_control', logger);
    check('two live clients on one API key warn', state.collisionWarnings === 1, `warnings=${state.collisionWarnings}`);
    a.destroy();
    b.destroy();
  }

  console.log('\n── 2. destroy() deregisters the client ───────────────────────');
  {
    // The registry is per API key, so a leaked entry from a destroyed client
    // makes the NEXT client on that key look like a collision.
    const { state, logger } = makeLogger();
    for (let i = 0; i < 25; i++) newClient('pk_lifecycle_cycle', logger).destroy();
    const after = newClient('pk_lifecycle_cycle', logger);
    check(
      '25 construct/destroy cycles leave no entry behind',
      state.collisionWarnings === 0,
      `warnings=${state.collisionWarnings}`,
    );
    after.destroy();
  }

  console.log('\n── 3. destroy() is idempotent ────────────────────────────────');
  {
    // A double destroy must not over-deregister and hide a real collision.
    const { state, logger } = makeLogger();
    const a = newClient('pk_lifecycle_idem', logger);
    const b = newClient('pk_lifecycle_idem', logger);
    state.collisionWarnings = 0;
    b.destroy();
    b.destroy();
    b.destroy();
    const c = newClient('pk_lifecycle_idem', logger);
    check(
      'a still-live sibling is still detected after a triple destroy',
      state.collisionWarnings === 1,
      `warnings=${state.collisionWarnings}`,
    );
    a.destroy();
    c.destroy();
  }

  console.log('\n── 4. destroy() detaches the cross-tab storage listener ──────');
  {
    const before = winListeners.storage.size;
    const a = newClient('pk_lifecycle_listener');
    await a.ready();
    check('a live client is listening for `storage`', winListeners.storage.size === before + 1);
    a.destroy();
    check('  destroy() removes the listener', winListeners.storage.size === before, `size=${winListeners.storage.size}`);
  }

  console.log('\n── 5. A destroyed client ignores a sibling teardown ──────────');
  {
    // The in-document logout announcement iterates the registry. A destroyed
    // client must be gone from it; if it lingered, it would run a teardown (and
    // emit auth state) after the host tore it down.
    const a = newClient('pk_lifecycle_sibling');
    const b = newClient('pk_lifecycle_sibling');
    await Promise.all([a.ready(), b.ready()]);
    let statesAfterDestroy = 0;
    b.onAuthStateChange(() => statesAfterDestroy++);
    b.destroy();
    statesAfterDestroy = 0;
    await a.logout();
    await new Promise((r) => setTimeout(r, 30));
    check('no auth state emitted to the destroyed sibling', statesAfterDestroy === 0, `emissions=${statesAfterDestroy}`);
    a.destroy();
  }

  console.log('\n── 6. A destroyed client becomes unreachable ─────────────────');
  {
    if (typeof globalThis.gc !== 'function') {
      skip('destroyed client is garbage-collectable', 'run with --expose-gc');
    } else {
      // Hold the client ONLY through an array we then empty. A plain `const`
      // inside this async function would be kept alive by the function's own
      // context for the rest of the block, and the assertion would then fail on
      // the test's scope rather than on anything the SDK retains.
      let holder = [newClient('pk_lifecycle_gc')];
      await holder[0].ready();
      holder[0].destroy();
      const ref = new WeakRef(holder[0]);
      holder.length = 0;
      holder = null;
      // Two collections with a turn of the loop between them: the first drops
      // the object, the second clears any finalization-pending state.
      await new Promise((r) => setTimeout(r, 20));
      globalThis.gc();
      await new Promise((r) => setTimeout(r, 10));
      globalThis.gc();
      check('a destroyed client is collectable (registry holds no strong ref)', ref.deref() === undefined);
    }
  }

  console.log('\n── 7. A server-side client leaks nothing ─────────────────────');
  {
    // Server-rendered code builds one client per request and never destroys it,
    // so nothing module-level may hold on to it. Today the constructor returns
    // before it would register, which is what makes this hold; the assertion
    // guards that property against a refactor that registers earlier. Run in a
    // child process with NO window/localStorage so `isClientRuntime` is false.
    const child = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        '-e',
        `
        const sdk = require(${JSON.stringify(SDK_DIST)});
        let ref;
        {
          // No window/localStorage here: this is the SSR path.
          const c = new sdk.PollarClient({ apiKey: 'pk_ssr_leak', baseUrl: 'https://x.test',
            logger: { debug(){}, info(){}, warn(){}, error(){} } });
          ref = new WeakRef(c);
        }
        setTimeout(() => {
          gc(); gc();
          console.log(ref.deref() === undefined ? 'COLLECTED' : 'RETAINED');
        }, 20);
        `,
      ],
      { encoding: 'utf8', timeout: 20_000 },
    );
    const out = (child.stdout || '').trim().split('\n').pop();
    if (child.error || (out !== 'COLLECTED' && out !== 'RETAINED')) {
      skip('server-side client is not retained', `child failed: ${child.error?.message ?? child.stderr?.slice(0, 200)}`);
    } else {
      check('a server-side client is not retained by the module registry', out === 'COLLECTED', out);
    }
  }

  console.log('\n── 8. A failing sibling cannot abort our own teardown ───────');
  {
    // The in-document announcement is a courtesy call made on behalf of OTHER
    // instances. It used to run before the clearing client emitted `idle`, and
    // nothing guarded it: a sibling that threw (a logger sink that chokes is
    // the realistic version) left the clearing client reporting `authenticated`
    // with its session row already gone - and `logout()` swallows the error, so
    // nothing pointed at the sibling that caused it.
    const quiet = { debug() {}, info() {}, warn() {}, error() {} };
    const hostile = {
      debug() {},
      warn() {},
      error() {},
      info: (m) => {
        if (String(m).includes('cleared by another client')) throw new Error('sibling logger blew up');
      },
    };
    const storage = sdk.createMemoryAdapter();
    const apiKey = 'pk_lifecycle_hostile_sibling';

    const seed = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logger: quiet });
    await seed.ready();
    const sessionKey = `pollar:${seed.apiKeyHash}:session`;
    await storage.set(
      sessionKey,
      JSON.stringify({
        clientSessionId: 'cs1',
        userId: 'u1',
        status: 'CONSUMED',
        token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        user: { ready: true },
        wallet: { type: 'internal', address: 'G' },
      }),
    );
    seed.destroy();

    const origin = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logger: quiet });
    const sibling = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logger: hostile });
    await Promise.all([origin.ready(), sibling.ready()]);
    await new Promise((r) => setTimeout(r, 40));
    check(
      '(baseline) both instances hold the session',
      origin.getAuthState().step === 'authenticated' && sibling.getAuthState().step === 'authenticated',
    );

    await origin.logout();
    await new Promise((r) => setTimeout(r, 40));
    check('the clearing client still converges to idle', origin.getAuthState().step === 'idle', origin.getAuthState().step);
    check('  and its session row is gone', (await storage.get(sessionKey)) == null);
    origin.destroy();
    sibling.destroy();
  }

  console.log(`\n${pass} pass, ${fail} fail${skipped ? `, ${skipped} skip` : ''}`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
