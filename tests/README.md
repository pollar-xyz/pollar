# `@pollar` smoke tests

Quick, self-contained scripts that exercise the SDK against the **built** `dist/`.
They are NOT a substitute for unit tests — they're regression guards for the
critical paths (DPoP proof construction, refresh singleton, session lifecycle,
KeyManager initialization).

## How to run

From the repo root:

```bash
# Build the SDK first — the tests import dist/index.js, not src/
pnpm build
# or:  npm run build

# Run all smoke tests
pnpm test:smoke
# or:  npm run test:smoke
```

To run an individual file:

```bash
node tests/smoke-keys.cjs
node tests/smoke-client.cjs
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

## What's not covered

- Real network requests (`fetch` is mocked).
- Real WebCrypto in browsers (uses Node's WebCrypto via the `index.rn.js`
  entry for `NobleKeyManager` paths, since Node lacks `indexedDB`).
- Full OAuth popup flow (Google / GitHub redirect).
- React provider hooks (covered separately when we add `@pollar/react` tests).

## Requirements

- Node ≥ 20 (the SDK runtime floor)
- Built `dist/` (run `pnpm build` first)
- No external services — tests are fully self-contained
