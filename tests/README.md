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
