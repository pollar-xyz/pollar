# `@pollar` smoke tests

Quick, self-contained scripts that exercise the SDK against the **built** `dist/`.
They are NOT a substitute for unit tests — they're regression guards for the
critical paths (DPoP proof construction, refresh singleton, session lifecycle,
KeyManager initialization).

## How to run

From the repo root:

```bash
# Build the SDK first — the tests import dist/index.js, not src/
npm run build

# Run all smoke tests
npm run test:smoke
```

To run an individual file:

```bash
node tests/smoke-keys.cjs
node tests/smoke-client.cjs
node tests/smoke-providers.cjs
node tests/smoke-session-races.cjs
```

## What each file covers

### `smoke-keys.cjs`

`KeyManager` low-level behavior:

- `getPublicJwk`, `sign`, `getThumbprint` auto-init the manager if `init()`
  hasn't been called yet (regression guard for the timing bug where the OAuth
  flow called `getPublicJwk` before `_initialize` resolved)
- Concurrent `init()` calls share one in-flight promise (no double work)
- `reset()` clears state and the next call generates a fresh keypair
- RFC 7638 thumbprint matches `jose.calculateJwkThumbprint` byte-for-byte
- base64url roundtrip with edge cases (empty, 0xff, multi-byte)
- htu normalization round-trip across IPv6, default ports, trailing slashes

### `smoke-client.cjs`

`PollarClient` request-path behavior:

- `client.ready()` resolves after the keypair is initialized and any persisted
  session restored
- Authenticated requests carry `Authorization: DPoP <AT>` + `DPoP: <proof>`
- Proof claims (`htm`, `htu`, `iat`, `ath`) match what the server expects
- `DPoP-Nonce` is captured from each response and threaded into the next proof
- The refresh request omits `ath` and `Authorization` (RFC 9449 §5)
- 10 concurrent `client.refresh()` calls coalesce into **one** `/auth/refresh`
  request (race-safe singleton)
- The persisted session does NOT contain `data.*` PII fields
- Storage keys are namespaced by `apiKeyHash`
- `client.logout()` clears storage and resets the keypair
- A wallet restored mid-provisioning is polled until its account lands:
  `onWalletStateChange` replays `CREATING` on subscribe, reports `READY` when
  the account reaches the ledger, updates `getWallet()`, and stops polling
- `onWalletStateChange` also hears a value that arrived with the session
  rather than through the poll: a sibling tab's `READY` adopted via the
  `storage` event, and the value a cold-start restore finds for a subscriber
  that came before `ready()` - each exactly once, never repeated by the poll or
  the resume that follows

### `smoke-providers.cjs`

Built-in auth providers + wallet-adapter dispatch (custom `config.providers` was
removed when wallets were unified into `config.walletAdapters`):

- The built-in email provider drives through `login()` / `providerAction()`;
  blank-email and wrong-step guards fire before the API is hit
- Wallet-adapter dispatch (`login({ provider: adapter.type })`): an unknown
  provider maps to a clean error, `cancel` during a wallet flow maps to `idle`
  not `error`, and a synchronously-throwing adapter is handled
- `listWalletAdapters` sanitizes adapter `iconUrl`; email verify maps the
  server's `EXPIRED` / `INVALID` codes; client-side SEP-10 refuses a non-zero-seq
  challenge

### `smoke-session-races.cjs`

Session-lifecycle race safety (each block exercises one concurrency fix):

- `destroy()` mid-refresh discards the rotated token; `refresh()` no-ops after
  `destroy()`; `getAuthState()` returns a defensive clone
- `logout()` aborts an in-flight session resume so it can't re-emit
  `authenticated` after going `idle`; a concurrent request survives a rejecting
  refresh
- DPoP nonce challenge is classified case-insensitively; cross-tab rotation keeps
  `verified` without re-resuming; a legacy 8-hex session is not restored;
  cross-tab logout propagates even when this tab's storage is degraded

### `smoke-resume.cjs`

Session resume across "page loads" — DPoP key binding (regression guards for the
0.11.2 reload-logout bug, `thumbprint-mismatch`). Runs against a mock server that
actually verifies the binding (nonce challenge + proof-JWK thumbprint vs the
`cnf.jkt` computed from the login's `dpopJwk`) and an in-memory IndexedDB shim
that survives across client instances:

- A fresh `PollarClient` over the same Storage + IndexedDB resumes: the resume
  proof's thumbprint equals the token's `cnf.jkt`, and concurrent resume
  triggers (visibility flaps) coalesce into a single request
- A genuinely revoked session (403 on resume) still clears to `idle`
- With IndexedDB unavailable, login warns that the keypair can't persist, and
  the next load clears the doomed session locally via the persisted `dpopJkt`
  check — no resume round trip, no phantom `authenticated` emission
- A 5xx resume keeps the optimistic session and backs off instead of bursting
- `logout()` rotates the DPoP keypair; a failure-path clear does not
- Cross-tab logout → fresh login: the sibling tab resyncs its stale in-memory
  key cache to the rotated shared key and resumes the new session instead of
  clearing it
- `logout()` aborts an in-flight login — the held `/auth/login` response can no
  longer resurrect the session after the user logged out
- The persisted `dpopJkt` equals the server's `cnf.jkt` even when the key
  manager reports a different key at store time (simulated mid-login rotation)
- `getThumbprint()` called while `init()` is mid-flight (keypair assigned, JWK
  export pending) joins the in-flight init instead of throwing

Cross-document and logout-race guards (added after a cross-review):

- `logout()` is async and consumers do not await it (`@pollar/react` fires it
  from the login modal and the wallet button). A login that completes inside that
  window must survive: the teardown is guarded on the session generation.
- The DPoP keypair is shared per origin + API key, so `logout()` rotates it only
  when it actually dropped its own session row.
- A logout propagates to sibling clients in the SAME document; browsers deliver
  `storage` events only to other documents, so a second instance (React
  StrictMode leaves one behind) is notified in-process instead.
- The `DPoP-Nonce` is persisted, so only the first reload pays the
  `use_dpop_nonce` challenge.
- A superseded logout leaves the wallet adapter connected (registered adapters
  are per-type singletons, so disconnecting could cut the connection the
  mid-logout login is now using); an owned external logout still disconnects
  exactly once.

### `smoke-lifecycle.cjs`

Teardown leaves nothing behind. `PollarClient` registers itself in a MODULE-level
registry so an in-document logout can reach sibling instances, and a module-level
map holding client references leaks unless registration and deregistration agree
exactly. Observed through behavior, never private state:

- the "another client is already active" warning fires for two live clients
  (positive control - the assertions below are worthless without it)
- 25 construct/destroy cycles leave no entry behind, and `destroy()` is idempotent
- `destroy()` detaches the cross-tab `storage` listener, and a destroyed client
  is not reached by a sibling's teardown
- a destroyed client is garbage-collectable (needs `--expose-gc`, which the npm
  script passes; skipped, not failed, without it), and a server-side client is
  never retained

### `smoke-invariants.cjs`

Randomized operation order against fixed properties. Every session bug found in
this area had the same shape: an `await` window let two pieces of state disagree.
Scenario tests pin the cases we know; this one goes after the ones we do not. It
drives seeded random sequences of login / logout / un-awaited logout racing a
login / refresh / revalidate / reload / second instance / cross-tab clear /
revocation, and after every step asserts:

- I1 a persisted session's `dpopJkt` is the `cnf.jkt` the server really bound
- I2 the keypair a persisted session names still exists locally
- I3/I4 `authenticated` always carries a session, and that session has a token
- I5 a client never returns to a session it logged out of

Deterministic: a seeded PRNG picks the operations and every mock delay is fixed,
so a failing seed replays with `node tests/smoke-invariants.cjs <seed>`. It
independently rediscovers the ownership bug fixed in this release when run
against the build that predates it.

### `smoke-cross-document.cjs`

Cross-document (cross-tab) session semantics + persist-queue races — the two
things the other suites' mocks cannot express: real `storage`-event delivery
(every same-origin document EXCEPT the writer; each client gets its own
"document" with its own window and listener set) and a storage adapter whose
session writes can be held, giving the `_persistSession` queue actual depth.
Ported from the scratchpad harnesses that found the cross-document teardown
bugs. Negative-controlled: run against the pre-fix bundle, the ownership,
handler-filter and triple-race blocks fail.

- Positive control: the writing document never hears its own event
- A login in one document is adopted by idle siblings in the others
- A STALE document's teardown (logout / failed refresh / 401 resume) cannot
  remove the row a fresh login now owns, nor destroy that login's keypair
- A foreign `localStorage.clear()` (`key === null`) and events from a
  different storage area (`sessionStorage`) are ignored
- [known limitation, pinned] an external PHYSICAL deletion of the very row a
  client holds still reads as a logout — the explicit logout-signal design
  (backlog) is what would distinguish it
- Triple race: a held login write + a queued login-over-login write + logout —
  the row is removed via ownership-by-session-history and the key rotates
- `destroy()` discards a refresh mutation still queued behind a held write
- `logout()` with the login's persist still queued: no resurrection, no
  leftover row

### `smoke-react.cjs`

`PollarProvider` client lifecycle, rendered through jsdom + `react-dom/client`.
Deliberately NOT `react-test-renderer`: that renderer does not enable
StrictMode's double-render, so the central assertion would pass without the
scenario ever running. Block 0 is a positive control that proves the
double-invocation happens here.

- StrictMode leaves exactly ONE live client, and nothing from that mount
  outlives it. The config is written as an INLINE literal inside a component
  StrictMode also double-renders, because that is what consumers write; hoisting
  it would hand both passes the same object for a reason the SDK does not
  control and the assertion would stop meaning anything.
- unmount destroys a provider-built client, and leaves a consumer-passed one alive
- five mount/unmount cycles leak no `storage` listeners
- a wallet restored mid-provisioning reaches the consumer when its account
  lands. The session comparison and the context memo must BOTH carry
  `provisioning`: either one omitting it swallows the transition, and every
  screen built on it stays frozen on "preparing" forever

The StrictMode block is what caught the orphan `PollarClient` this release fixes:
the provider built the client in a `useState` initializer, StrictMode
double-invoked it, React kept one and the other was never destroyed - it outlived
the provider's unmount holding a `storage` listener, a refresh loop and a
registry entry. Two live clients on one API key share a session row and a DPoP
keypair, which is the precondition every session-teardown bug in `@pollar/core`
needed. Both assertions fail against the provider that predates the fix.

## What's not covered

- Real network requests (`fetch` is mocked).
- Real WebCrypto in browsers (uses Node's WebCrypto via the `index.rn.js`
  entry for `NobleKeyManager` paths, since Node lacks `indexedDB`).
- Full OAuth popup flow (Google / GitHub redirect).
- React provider hooks (covered separately when we add `@pollar/react` tests).

## Requirements

- Node ≥ 20 (the SDK runtime floor)
- Built `dist/` (run `npm run build` first)
- No external services — tests are fully self-contained

### `check-comment-ascii.cjs`

Style guard, not a smoke test: asserts that code comments (every
`.ts`/`.tsx`/`.css` under `packages/`, minus the generated `schema.d.ts`) and every
`package.json` description use only keyboard-typeable ASCII characters - no em
dashes, box-drawing header lines, arrows or section signs. String literals are
exempt on purpose: UI copy is a product decision. Runs at the end of
`npm run test:smoke` and lists every violation on failure.
