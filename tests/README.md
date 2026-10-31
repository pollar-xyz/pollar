# `@pollar` smoke tests

Quick, self-contained scripts that exercise the SDK. They are NOT a substitute for
unit tests - they are regression guards for the critical paths (DPoP proof
construction, refresh singleton, session lifecycle, KeyManager initialization,
signing, ramps, KYC, cards and the modals around them).

Most files import the **built** packages (`packages/*/dist`), not `src/`. A few
(`smoke-card-stage`, `smoke-registration-fix`, `smoke-form-fields`,
`smoke-email-code-input`, `smoke-kyc-modal`, `smoke-cosign-modal`, `smoke-rn-kyc`,
`smoke-rn-ramp`) transpile the component sources on the fly with `typescript`.

## How to run

From the repo root:

```bash
# Run all smoke tests. `pretest:smoke` runs `npm run build` first.
npm run test:smoke
```

To run an individual file (build first with `npm run build` when it reads `dist/`):

```bash
node tests/smoke-keys.cjs
node tests/smoke-client.cjs
node tests/smoke-providers.cjs
node tests/smoke-session-races.cjs
```

`npm run test:smoke` runs, in order: `smoke-keys`, `smoke-client`, `smoke-api-v3`,
`smoke-wallet-less`, `smoke-send-payment`, `smoke-solana-swap`,
`smoke-card-funding-solana`, `smoke-send-create-account`, `smoke-cosign`,
`smoke-cosign-modal`, `smoke-providers`, `smoke-session-races`, `smoke-resume`,
`smoke-lifecycle` (with `--expose-gc`), `smoke-invariants`, `smoke-cross-document`,
`smoke-react`, `smoke-card-secrets`, `smoke-card-stage`, `smoke-registration-fix`,
`smoke-form-fields`, `smoke-kyc`, `smoke-kyc-modal`, `smoke-email-code-input`,
`smoke-rn-kyc`, `smoke-rn-ramp`, `smoke-rn-modal-options`, `smoke-ramp-chain-types`,
`smoke-ramp-client`, `smoke-ramp-stellar-signing`, `smoke-ramp-widget`,
`smoke-modal-options`, `smoke-custom-ramp`, the
`test:custom-ramp-example` type check, `smoke-migrate` and `check-comment-ascii`.

## What each file covers

### Session, keys and requests

#### `smoke-keys.cjs`

`KeyManager` low-level behavior:

- `getPublicJwk`, `sign`, `getThumbprint` auto-init the manager if `init()`
  has not been called yet (guards an OAuth flow that calls `getPublicJwk`
  before `_initialize` resolves)
- Concurrent `init()` calls share one in-flight promise (no double work)
- `reset()` clears state and the next call generates a fresh keypair
- RFC 7638 thumbprint matches `jose.calculateJwkThumbprint` byte-for-byte
- base64url roundtrip with edge cases (empty, 0xff, multi-byte)
- htu normalization round-trip across IPv6, default ports, trailing slashes

#### `smoke-client.cjs`

`PollarClient` request-path behavior:

- `client.ready()` resolves after the keypair is initialized and any persisted
  session restored
- Authenticated requests carry `Authorization: DPoP <AT>` + `DPoP: <proof>`
- Proof claims (`htm`, `htu`, `iat`, `ath`) match what the server expects
- `DPoP-Nonce` is captured from each response and threaded into the next proof
- The refresh request omits `ath` and `Authorization` (RFC 9449 section 5)
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
- the watch under adversarial conditions, one sub-block per way it could strand
  a UI on "preparing your account":
  - a restored session whose access token is ALREADY expired refreshes inline
    and never reaches `_resume`, so that branch arms the watch itself
  - two `/wallet/state` checks in flight resolve out of order: the older answer
    does not walk `READY` back to `CREATING`, and the losing call reports the
    value that won, so the watch does not keep polling a finished job
  - a provisioning value outside the union is neither applied nor persisted.
    The last assertion is the point: the row still restores on the next load,
    which is what writing it would have cost
  - a subscriber that throws (on the replay inside `subscribe()` AND on a later
    transition) costs the others nothing
  - a `/tx/build` 409 keeps its `code`, so `isWalletNotReady(buildOutcome)`
    recognizes the one failure it exists to name

#### `smoke-api-v3.cjs`

Every SDK request goes to `/v3`, and a retiring API version or an app out of
credits is reported to the developer once.

#### `smoke-wallet-less.cjs`

A session with no wallet (an app that creates wallets on demand) and
`PollarClient.createWallet()`.

#### `smoke-providers.cjs`

Built-in auth providers + wallet-adapter dispatch (wallets are registered
through `config.walletAdapters`):

- The built-in email provider drives through `login()` / `providerAction()`;
  blank-email and wrong-step guards fire before the API is hit
- Wallet-adapter dispatch (`login({ provider: adapter.type })`): an unknown
  provider maps to a clean error, `cancel` during a wallet flow maps to `idle`
  not `error`, and a synchronously-throwing adapter is handled
- `listWalletAdapters` sanitizes adapter `iconUrl`; email verify maps the
  server's `EXPIRED` / `INVALID` codes; client-side SEP-10 refuses a non-zero-seq
  challenge

#### `smoke-session-races.cjs`

Session-lifecycle race safety (each block exercises one concurrency guard):

- `destroy()` mid-refresh discards the rotated token; `refresh()` no-ops after
  `destroy()`; `getAuthState()` returns a defensive clone
- `logout()` aborts an in-flight session resume so it cannot re-emit
  `authenticated` after going `idle`; a concurrent request survives a rejecting
  refresh
- DPoP nonce challenge is classified case-insensitively; cross-tab rotation keeps
  `verified` without re-resuming; a legacy 8-hex session is not restored;
  cross-tab logout propagates even when this tab's storage is degraded

#### `smoke-resume.cjs`

Session resume across "page loads" - DPoP key binding (guards against a reload
logging the user out with `thumbprint-mismatch`). Runs against a mock server that
verifies the binding (nonce challenge + proof-JWK thumbprint vs the `cnf.jkt`
computed from the login's `dpopJwk`) and an in-memory IndexedDB shim that
survives across client instances:

- A fresh `PollarClient` over the same Storage + IndexedDB resumes: the resume
  proof's thumbprint equals the token's `cnf.jkt`, and concurrent resume
  triggers (visibility flaps) coalesce into a single request
- A genuinely revoked session (403 on resume) clears to `idle`
- With IndexedDB unavailable, login warns that the keypair cannot persist, and
  the next load clears the doomed session locally via the persisted `dpopJkt`
  check - no resume round trip, no phantom `authenticated` emission
- A 5xx resume keeps the optimistic session and backs off instead of bursting
- `logout()` rotates the DPoP keypair; a failure-path clear does not
- Cross-tab logout -> fresh login: the sibling tab resyncs its stale in-memory
  key cache to the rotated shared key and resumes the new session instead of
  clearing it
- `logout()` aborts an in-flight login - the held `/auth/login` response cannot
  resurrect the session after the user logged out
- The persisted `dpopJkt` equals the server's `cnf.jkt` even when the key
  manager reports a different key at store time (simulated mid-login rotation)
- `getThumbprint()` called while `init()` is mid-flight (keypair assigned, JWK
  export pending) joins the in-flight init instead of throwing

Cross-document and logout-race guards:

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
  mid-logout login is using); an owned external logout disconnects exactly once.

#### `smoke-lifecycle.cjs`

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

#### `smoke-invariants.cjs`

Randomized operation order against fixed properties. The session bugs this
guards against share one shape: an `await` window lets two pieces of state
disagree. Scenario tests pin the known cases; this one goes after the unknown
ones. It drives seeded random sequences of login / logout / un-awaited logout
racing a login / refresh / revalidate / reload / second instance / cross-tab
clear / revocation, and after every step asserts:

- I1 a persisted session's `dpopJkt` is the `cnf.jkt` the server really bound
- I2 the keypair a persisted session names still exists locally
- I3/I4 `authenticated` always carries a session, and that session has a token
- I5 a client never returns to a session it logged out of

Deterministic: a seeded PRNG picks the operations and every mock delay is fixed,
so a failing seed replays with `node tests/smoke-invariants.cjs <seed>`.

#### `smoke-cross-document.cjs`

Cross-document (cross-tab) session semantics + persist-queue races - the two
things the other suites' mocks cannot express: real `storage`-event delivery
(every same-origin document EXCEPT the writer; each client gets its own
"document" with its own window and listener set) and a storage adapter whose
session writes can be held, giving the `_persistSession` queue actual depth.

- Positive control: the writing document never hears its own event
- A login in one document is adopted by idle siblings in the others
- A STALE document's teardown (logout / failed refresh / 401 resume) cannot
  remove the row a fresh login owns, nor destroy that login's keypair
- A foreign `localStorage.clear()` (`key === null`) and events from a
  different storage area (`sessionStorage`) are ignored
- [known limitation, pinned] an external PHYSICAL deletion of the very row a
  client holds reads as a logout - an explicit logout signal (backlog) is what
  would distinguish it
- Triple race: a held login write + a queued login-over-login write + logout -
  the row is removed via ownership-by-session-history and the key rotates
- `destroy()` discards a refresh mutation still queued behind a held write
- `logout()` with the login's persist still queued: no resurrection, no
  leftover row

#### `smoke-react.cjs`

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
- the not-ready banner follows the chain the wallet button SHOWS, not Stellar by
  assumption. The same session is mounted twice, changing only the app's
  configured chain order: Stellar-first warns, Solana-first does not. A unit
  pass over `walletNotReadyReason` covers the chain-still-unknown case, which
  `/config` leaves open on every cold start

The StrictMode block guards against an orphan `PollarClient`: a provider that
builds the client in a `useState` initializer gets it double-invoked by
StrictMode, React keeps one and the other is never destroyed - it outlives the
provider's unmount holding a `storage` listener, a refresh loop and a registry
entry. Two live clients on one API key share a session row and a DPoP keypair,
which is the precondition for every session-teardown bug in `@pollar/core`.

### Payments, swaps and co-signing

#### `smoke-send-payment.cjs`

`PollarClient.sendPayment` on Solana and Polygon: the wallet is taken from
`wallets[]` (`session.wallet` is the Stellar one by contract), and the body the
atomic route gets carries the chain's own asset field.

#### `smoke-solana-swap.cjs`

Solana swaps. The venues and the quote are asked for with `chain: 'SOLANA'`; an
external wallet's swap is built by the backend (`/swap/build`), signed in the
connected wallet and submitted under the same idempotency key (`/tx/submit`); a
co-signed wallet's build answers with a co-sign request instead.

#### `smoke-send-create-account.cjs`

The Send modal's step for a Stellar destination with no account. The modal looks
the destination up first and, when it does not exist, asks instead of sending:
create it with the XLM being sent, or wait for another wallet to fund it. A
non-XLM asset cannot create an account, so it only gets the explanation and the
way back.

#### `smoke-cosign.cjs`

Turnkey co-signed wallets from the client's side: the device key lives apart
from the DPoP key and survives a logout; the X-Stamp verifies as a DER ECDSA
signature; the Stellar transaction hash is recomputed from the envelope without
a parser; under `cosignManual` a 202 `SDK_COSIGN_PENDING` becomes a
`cosign_pending` outcome and an `awaiting_cosign` tx state, approve verifies the
payload and proposes the Turnkey request, reject closes it; by default the client
settles the vote itself, approves recognized setup at login and rejects a
mismatching payload; card funding from a co-signed wallet; `confirmation: 'prompt'`
asks before any signature.

#### `smoke-cosign-modal.cjs`

The co-signed wallet prompt, web and React Native: the real modals, with the
client faked the way core behaves. A refresh of the pending list hands back new
objects for the same requests and lands before the slower Turnkey check; the
check must survive it and enable Approve.

### Cards

#### `smoke-card-funding-solana.cjs`

Funding a card from Solana. `fundCard({ chain: 'SOLANA' })` asks for that chain;
an external wallet signs the transfer the backend built and submits it under its
idempotency key (`/tx/submit`), and the funding is read again; a wallet that
declines leaves the funding `cancelled` with nothing submitted; a custodial
wallet's funding comes back as is.

#### `smoke-card-secrets.cjs`

Card secrets reveal, both engines. Node's own crypto plays the provider: a real
RSA-2048 key unwraps the `sessionId` (RSA-OAEP, SHA-1), then encrypts a PAN and a
CVC with the recovered AES-128 key (GCM, tag appended), and the session must
open both. The `js` engine is the one React Native runs, where there is no
WebCrypto.

#### `smoke-card-stage.cjs`

`cardStage` in `@pollar/react` and `@pollar/react-native`: which stage the card
modal shows (the steps, the provider form, or nothing) for each combination of
card holder and onboarding steps.

### KYC and requirement forms

#### `smoke-kyc.cjs`

The core KYC calls: typed errors, idempotency key, and settled polling (an
approval the vendor gave while Pollar still records it settles on its own).

#### `smoke-kyc-modal.cjs`

The web KYC modal: gate option opened directly, error codes, manual review,
expiry.

#### `smoke-rn-kyc.cjs`

The React Native KycModal with `react-native` mocked as plain components: the
hosted KYC page goes to the system browser and the status is checked on return
to the app.

#### `smoke-registration-fix.cjs`

`registrationFixOf` and `REGISTRATION_COPY` in both React packages: a
`KYC_REGISTRATION_MISSING_DATA` error maps to the fields and forms the user has
to fix.

#### `smoke-form-fields.cjs`

`localFieldError`, `localFieldErrors` and `visibleFields` in both React packages:
pattern, length and number range are checked before sending, while an empty
value and a pattern the engine cannot compile are left to the server.

#### `smoke-email-code-input.cjs`

The 6-box email code input. OTP autofill on iOS and Android writes the whole
code into the focused box through an input event, not a paste event, and the
whole code must survive and be submitted.

### Ramps

#### `smoke-ramp-chain-types.cjs`

Type-checks `ramp-chain.types.ts` against the built declarations: every `chain`
field in the ramp API paths is the closed `RampChain` union
(`'STELLAR' | 'POLYGON' | 'SOLANA'`), the React Native entry exports the same
catalog, and ramp amounts are strings.

#### `smoke-ramp-client.cjs`

The v3 ramp client: the paths and bodies on `/v3/ramps`, a quote with no route
and a refused payee kept as typed errors, the UI helpers, signing a leg only
through a registered handler and only for the action the user saw, and polling
at the server's pace until the order settles.

#### `smoke-ramp-stellar-signing.cjs`

`assertRampStellarSigner` reads a Stellar ramp transaction without a Stellar
library and lets the user's wallet sign only what spends from the user's own
account. The fixtures are built with `@stellar/stellar-sdk`, which the tests use
and core does not.

#### `smoke-ramp-widget.cjs`

The React RampWidget: route, quote, the fields a quote asks for, the order with
its QR, an explicit Authorize, resuming a pending order, an app out of credits,
the options `openRampModal` takes, country names in the modal's language, and a
language that changes at runtime.

#### `smoke-modal-options.cjs`

The options the React `open*Modal` actions take, through the real provider: the
send, swap, earn, receive, history and card modals open on them, an option the
app or wallet cannot use falls back to the default, opening on none after some
leaves nothing behind, a swap token that loads late is still picked, and
`onSuccess` / `onFunded` hear the outcome once.

#### `smoke-rn-ramp.cjs`

The React Native RampWidget with `react-native` mocked as plain components:
route, quote, the fields a quote asks for, the order, its payment code, an
explicit signature, the order kept while closed, the options `openRampModal`
takes, country names, and the provider's runtime language.

#### `smoke-rn-modal-options.cjs`

The options the React Native `open*Modal` actions take: the send, swap, earn,
receive and card panels open on them, an option the wallet cannot use falls back
to the default, and `onSuccess` / `onFunded` hear the outcome once.

#### `smoke-custom-ramp.cjs` and `test:custom-ramp-example`

`@pollar/core/ramps`: `defineRampAdapter` rejects an incomplete adapter,
`RampAdapterError` is recognized across the CJS, ESM and React Native builds,
`defineRampAdapterRegistration` is exported, and every application ramp call goes
to the Pollar backend. The `test:custom-ramp-example` script type-checks
[`examples/custom-ramp`](../examples/custom-ramp) under strict settings.

### Tooling

#### `smoke-migrate.cjs`

`@pollar/migrate` on a fixture app on 0.5.3: the list of 0.12 exports the CLI
checks matches the build (`generate-exports.cjs --check`), the release is read
from `package.json`, a report without `--fix` writes nothing, `--fix` rewrites
the code and the `@pollar/*` ranges idempotently, and unrelated code is left
untouched.

#### `check-comment-ascii.cjs`

Style guard, not a smoke test: asserts that code comments (every
`.ts`/`.tsx`/`.css` under `packages/`, minus the generated `schema.d.ts`) and every
`package.json` description use only keyboard-typeable ASCII characters - no em
dashes, box-drawing header lines, arrows or section signs. String literals are
exempt on purpose: UI copy is a product decision. Runs at the end of
`npm run test:smoke` and lists every violation on failure.

## What's not covered

- Real network requests (`fetch` is mocked). No live vendor requests or
  transactions are made.
- Real WebCrypto in browsers (uses Node's WebCrypto via the `index.rn.js`
  entry for `NobleKeyManager` paths, since Node lacks `indexedDB`).
- Full OAuth popup flow (Google / GitHub redirect).

## Requirements

- Node 20 or later (the SDK runtime floor)
- Built `dist/` (`npm run test:smoke` builds it; run `npm run build` before a
  single file)
- No external services - tests are fully self-contained
