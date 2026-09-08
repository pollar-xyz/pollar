// @pollar smoke test — `PollarProvider` client lifecycle.
//
// Run with `node tests/smoke-react.cjs` after `npm run build`.
//
// `@pollar/react` is where the double-instance hazard originates. The provider
// builds the client in a `useState` initializer, and React StrictMode
// double-invokes that initializer in development: the extra client's
// constructor has already run - registering itself, attaching a cross-tab
// `storage` listener, starting a refresh loop - while React keeps only one, and
// the provider's cleanup only ever sees the one it kept. Two live clients on
// one API key share a session row and a DPoP keypair, which is the exact
// configuration every session-teardown bug in `@pollar/core` needed to bite.
//
// Rendered through jsdom + `react-dom/client`, NOT `react-test-renderer`: the
// test renderer does not enable StrictMode's double-render, so the block below
// would pass without the scenario ever happening. Verified: under jsdom the
// initializer and effects each run twice, as they do in a browser dev build.
// JSX is spelled out as `React.createElement` so this stays a plain .cjs script.

const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://x.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.localStorage = dom.window.localStorage;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;

// Count live `storage` listeners: the client attaches one and must remove it on
// destroy, so a leaked listener means a client outlived its provider.
let storageListeners = 0;
const realAdd = dom.window.addEventListener.bind(dom.window);
const realRemove = dom.window.removeEventListener.bind(dom.window);
dom.window.addEventListener = (type, ...rest) => {
  if (type === 'storage') storageListeners++;
  return realAdd(type, ...rest);
};
dom.window.removeEventListener = (type, ...rest) => {
  if (type === 'storage') storageListeners--;
  return realRemove(type, ...rest);
};

globalThis.fetch = async () => new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const sdk = require(path.resolve(__dirname, '../packages/core/dist/index.js'));
const { PollarProvider } = require(path.resolve(__dirname, '../packages/react/dist/index.js'));

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Counts the "another client is already active" warning — how a live duplicate
 *  announces itself without reaching into private state. */
function makeLogger() {
  const state = { collisions: 0 };
  const noop = () => {};
  return {
    state,
    logger: {
      debug: noop,
      info: noop,
      error: noop,
      warn: (msg) => {
        if (String(msg).includes('Another PollarClient is already active')) state.collisions++;
      },
    },
  };
}

const h = React.createElement;
/** Passed so the provider never fetches /applications/config. */
const APP_CONFIG = { branding: {}, features: {} };

function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { root, container, element };
}
async function render(handle) {
  await act(async () => {
    handle.root.render(handle.element);
  });
  await sleep(20);
}
async function unmount(handle) {
  await act(async () => {
    handle.root.unmount();
  });
  // The provider defers `destroy()` to a macrotask so a StrictMode remount can
  // cancel it; wait past that.
  await sleep(30);
  handle.container.remove();
}

(async () => {
  console.log('── 0. StrictMode really double-invokes here (positive control) ─');
  {
    // Without this the blocks below could pass because the scenario never runs.
    let inits = 0;
    function Probe() {
      React.useState(() => (inits++, {}));
      return null;
    }
    const handle = mount(h(React.StrictMode, null, h(Probe)));
    await render(handle);
    check('the useState initializer runs twice under StrictMode', inits === 2, `inits=${inits}`);
    await unmount(handle);
  }

  console.log('\n── 1. StrictMode leaves exactly ONE live client ───────────────');
  {
    // Shaped like real usage: the config is an INLINE literal inside a
    // component StrictMode also double-renders, not an object hoisted out of
    // the render. Hoisting it would hand both passes the same object for a
    // reason the SDK does not control, and this would then pass without
    // exercising what consumers actually write.
    const { state, logger } = makeLogger();
    let appRenders = 0;
    function App() {
      appRenders++;
      return h(
        PollarProvider,
        { client: { apiKey: 'pk_react_strict', baseUrl: 'https://x.test', logger }, appConfig: APP_CONFIG },
        null,
      );
    }
    const handle = mount(h(React.StrictMode, null, h(App)));
    await render(handle);
    check('the surrounding component really double-rendered', appRenders === 2, `renders=${appRenders}`);
    check('  no orphaned second client under StrictMode', state.collisions === 0, `collisions=${state.collisions}`);
    await unmount(handle);

    // The orphan used to outlive the provider entirely: a later mount on the
    // same API key would collide with it.
    state.collisions = 0;
    const after = mount(
      h(
        PollarProvider,
        { client: { apiKey: 'pk_react_strict', baseUrl: 'https://x.test', logger }, appConfig: APP_CONFIG },
        null,
      ),
    );
    await render(after);
    check('  nothing from the StrictMode mount outlived it', state.collisions === 0, `collisions=${state.collisions}`);
    await unmount(after);
  }

  console.log('\n── 2. The provider tears down the client it built ────────────');
  {
    const { state, logger } = makeLogger();
    const cfg = { apiKey: 'pk_react_owned', baseUrl: 'https://x.test', logger };
    const first = mount(h(PollarProvider, { client: cfg, appConfig: APP_CONFIG }, null));
    await render(first);
    await unmount(first);
    // A client that outlived its provider would collide with the next mount.
    const second = mount(h(PollarProvider, { client: cfg, appConfig: APP_CONFIG }, null));
    await render(second);
    check('unmount destroys the provider-built client', state.collisions === 0, `collisions=${state.collisions}`);
    await unmount(second);
  }

  console.log('\n── 3. A consumer-passed client survives unmount ──────────────');
  {
    // The provider must not destroy a client it does not own: a module
    // singleton reused across route changes is the documented pattern, and
    // destroying it would silently stop its refresh loop.
    const { logger } = makeLogger();
    const client = new sdk.PollarClient({ apiKey: 'pk_react_passed', baseUrl: 'https://x.test', logger });
    await client.ready();
    const handle = mount(h(PollarProvider, { client, appConfig: APP_CONFIG }, null));
    await render(handle);
    await unmount(handle);
    let alive = false;
    try {
      await client.ready();
      alive = client.getAuthState().step === 'idle';
    } catch {
      alive = false;
    }
    check('a client passed in is left alive after unmount', alive);
    client.destroy();
  }

  console.log('\n── 4. Mount/unmount cycles leave no listeners behind ─────────');
  {
    const { logger } = makeLogger();
    const before = storageListeners;
    for (let i = 0; i < 5; i++) {
      const handle = mount(
        h(
          PollarProvider,
          { client: { apiKey: 'pk_react_cycles', baseUrl: 'https://x.test', logger }, appConfig: APP_CONFIG },
          null,
        ),
      );
      await render(handle);
      await unmount(handle);
    }
    check(
      '5 mount/unmount cycles leave no `storage` listeners',
      storageListeners === before,
      `now=${storageListeners}, was=${before}`,
    );
  }

  console.log('\n── 5. A client from a SECOND copy of core is recognised ──────');
  {
    // The failure this guards: a package that pulls its own @pollar/core (a
    // `dependencies` entry instead of a peer, an exact pin that disagrees, a
    // bundler that does not dedupe) hands the provider an instance built by a
    // DIFFERENT class object. `instanceof` answers false, the provider decides
    // it was given a config, and spreads a live client into
    // `new PollarClient({...})`. Loading the bundle a second time from a copied
    // path is exactly that situation - Node caches by resolved path, so this is
    // a genuinely separate module instance, not the same one twice.
    const fs = require('node:fs');
    // Copied NEXT TO the original, not into a temp dir: the bundle resolves its
    // own dependencies relative to its own path, so it has to sit inside the
    // workspace to find node_modules.
    const original = path.resolve(__dirname, '../packages/core/dist/index.js');
    const copied = path.resolve(__dirname, '../packages/core/dist/__second-copy-under-test.cjs');
    fs.copyFileSync(original, copied);
    let otherCore;
    try {
      otherCore = require(copied);
    } finally {
      // The module is loaded and cached; the file on disk is no longer needed.
      fs.rmSync(copied, { force: true });
    }

    check('the second copy really is a separate module', otherCore.PollarClient !== sdk.PollarClient);

    const { logger } = makeLogger();
    const foreign = new otherCore.PollarClient({ apiKey: 'pk_react_foreign', baseUrl: 'https://x.test', logger });
    await foreign.ready();
    check('  instanceof across copies is false (the trap)', !(foreign instanceof sdk.PollarClient));
    check('  isPollarClient sees through it', sdk.isPollarClient(foreign) === true);
    check('  and a plain config is still not a client', sdk.isPollarClient({ apiKey: 'x' }) === false);

    // The provider must treat it as a ready client: adopt it, and leave it
    // alive on unmount because it is not the provider's to destroy.
    // Measure by `storage` listeners, not by liveness or by log lines. When the
    // provider mistakes a client for a config it spreads it into
    // `new PollarClient({...})`; the spread carries `apiKey` so the original
    // stays alive (liveness passes either way), and it does NOT carry `logger`
    // so the new client logs to the console instead of our spy (a log counter
    // passes either way too). A new client always attaches its own cross-tab
    // listener to the one shared jsdom window, whichever copy of core built it.
    const listenersBefore = storageListeners;
    const handle = mount(h(PollarProvider, { client: foreign, appConfig: APP_CONFIG }, null));
    await render(handle);
    check(
      '  the provider adopts it, building nothing',
      storageListeners === listenersBefore,
      `listeners ${listenersBefore} -> ${storageListeners}`,
    );
    await unmount(handle);
    let alive = false;
    try {
      await foreign.ready();
      alive = foreign.getAuthState().step === 'idle';
    } catch {
      alive = false;
    }
    check("  and leaves it alive, since it is not the provider's to destroy", alive);
    foreign.destroy();
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
