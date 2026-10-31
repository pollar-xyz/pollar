// @pollar smoke test - Pollar prompts stay usable over a host's React Aria modal.
//
// Run with `node tests/smoke-host-modal-portal.cjs` after `npm run build`.
//
// A React Aria modal (HeroUI is built on it) marks everything outside itself
// `inert` while it is open. A signature started from inside that modal opens
// `<ConfirmModal>`; if the prompt sat inside the host's root it would be inert
// too, and under `confirmation: 'prompt'` the signature would wait forever.
// This mounts the real `useModalOverlay`, raises a confirmation through the
// client, and checks the prompt can be focused and confirmed with the host
// modal still open.

const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://x.test/',
  pretendToBeVisual: true,
});
const { window } = dom;
// jsdom has no `inert`. React Aria checks for it once, on load, and falls back
// to aria-hidden without it; reflecting it to the attribute lets the test see
// exactly what a browser would block.
Object.defineProperty(window.HTMLElement.prototype, 'inert', {
  configurable: true,
  get() {
    return this.hasAttribute('inert');
  },
  set(value) {
    if (value) this.setAttribute('inert', '');
    else this.removeAttribute('inert');
  },
});
globalThis.window = window;
for (const key of [
  'document',
  'navigator',
  'localStorage',
  'HTMLElement',
  'SVGElement',
  'Element',
  'Node',
  'NodeFilter',
  'MutationObserver',
  // React Aria dispatches these on jsdom nodes, which refuse Node's own.
  'Event',
  'CustomEvent',
]) {
  globalThis[key] = window[key];
}
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.fetch = async () => new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { Overlay, useModalOverlay } = require('react-aria');
const { useOverlayTriggerState } = require('react-stately');
const { PollarProvider, usePollar } = require(path.resolve(__dirname, '../packages/react/dist/index.js'));

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
const h = React.createElement;
const noop = () => {};
const logger = { debug: noop, info: noop, warn: noop, error: noop };

/** A browser delivers no pointer event to an inert subtree; neither does this. */
function press(el) {
  if (el.closest('[inert]')) throw new Error('the element is inside an inert subtree');
  const Pointer = window.PointerEvent ?? window.MouseEvent;
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const Ctor = type.startsWith('pointer') ? Pointer : window.MouseEvent;
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse' }));
  }
}

const host = {};

// The hook runs inside <Overlay>, as React Aria Components' Modal does: that is
// what turns on the overlay's focus trap.
function HostModalContent({ state, children }) {
  const ref = React.useRef(null);
  const { modalProps, underlayProps } = useModalOverlay({ isDismissable: true }, state, ref);
  return h(
    'div',
    { ...underlayProps, 'data-host-underlay': '' },
    h('div', { ...modalProps, ref, 'data-host-modal': '' }, children),
  );
}

function HostModal({ state, children }) {
  return h(Overlay, null, h(HostModalContent, { state }, children));
}

function HostApp() {
  const state = useOverlayTriggerState({ defaultOpen: true });
  const { getClient } = usePollar();
  host.state = state;
  host.getClient = getClient;
  return h(
    'div',
    { id: 'host-app' },
    h('p', null, 'host page'),
    state.isOpen && h(HostModal, { state }, h('button', { type: 'button', id: 'host-pay' }, 'Pay')),
  );
}

(async () => {
  // A signed-in user: the prompt declines itself when there is no session.
  const apiKey = 'pk_host_modal';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  const apiKeyHash = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  localStorage.setItem(
    `pollar:${apiKeyHash}:session`,
    JSON.stringify({
      clientSessionId: 'cs-host-modal',
      userId: 'u',
      status: 'CONSUMED',
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
      user: { ready: true },
      wallet: { type: 'internal', address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', provisioning: 'READY' },
    }),
  );

  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(
      h(
        PollarProvider,
        { client: { apiKey, baseUrl: 'https://x.test', logger }, appConfig: { branding: {}, features: {} } },
        h(HostApp),
      ),
    );
  });
  await act(async () => {
    await sleep(50);
  });

  console.log('── 1. The host modal hides the rest of the page (positive control) ─');
  check('the host modal is open', !!document.querySelector('[data-host-modal]'));
  check(
    "the host's app root is inert, so anything rendered inside it takes no clicks",
    !!document.getElementById('host-app').closest('[inert]'),
  );

  // The user is on the host modal's Pay button when the signature starts. With
  // nothing focused inside, the focus trap has nowhere to send focus back to
  // and the check on the prompt below would pass with or without the fix.
  const payButton = document.getElementById('host-pay');
  await act(async () => {
    payButton.focus();
    await sleep(10);
  });
  check("focus is on the host modal's Pay button", document.activeElement === payButton);

  console.log('── 2. A confirmation raised from the host modal is reachable ─');
  // The path every signing call takes once the policy says to ask the user.
  let answer;
  let asked;
  await act(async () => {
    asked = host
      .getClient()
      ._askUser({ kind: 'sign', network: 'STELLAR', operation: 'payment' })
      .then((a) => (answer = a));
    await sleep(20);
  });

  const overlay = document.querySelector('.pollar-cosign-modal')?.closest('.pollar-overlay');
  check('ConfirmModal is rendered', !!overlay);
  if (!overlay) return finish();
  check('its overlay is a direct child of body', overlay.parentElement === document.body);
  check('its overlay is marked as a React Aria top layer', overlay.getAttribute('data-react-aria-top-layer') === 'true');
  check('it is not inert', !overlay.closest('[inert]'));
  check('it is not aria-hidden', !overlay.closest('[aria-hidden="true"]'));

  const confirmButton = overlay.querySelector('.pollar-cosign-btn-primary');
  check('the Confirm button is there', !!confirmButton);
  await act(async () => {
    confirmButton.focus();
    await sleep(10);
  });
  check("the host modal's focus trap leaves focus on the prompt", document.activeElement === confirmButton);

  let pressError;
  await act(async () => {
    try {
      press(confirmButton);
    } catch (err) {
      pressError = err;
    }
    await sleep(20);
  });
  check('Confirm takes the click', !pressError, pressError?.message);
  await Promise.race([asked, sleep(200)]);
  check('the signature goes ahead', answer?.ok === true, answer);
  check('the prompt closes', !document.querySelector('.pollar-cosign-modal'));
  check('the host modal is still open: a press on the prompt is not an outside click', host.state.isOpen === true);

  console.log('── 3. Closing the host modal gives the page back ─');
  await act(async () => {
    host.state.close();
    await sleep(20);
  });
  check("the host's app root is no longer inert", !document.getElementById('host-app').closest('[inert]'));

  await act(async () => {
    root.unmount();
  });
  await sleep(30);
  finish();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

function finish() {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
