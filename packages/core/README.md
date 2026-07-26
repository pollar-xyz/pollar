# @pollar/core

Core SDK for [Pollar](https://pollar.xyz) — authentication and transaction utilities for Stellar and Solana applications.

> **0.11.1** reworks the multichain wallet responses. **Breaking:** `WalletBalanceRecord.balance`
> and `.available` are now `string | null` - `null` means the chain could not be read, and must
> render as unavailable rather than as `0`. Every chain now reports its native coin plus each
> token the app enabled (0.11.0 reported only the native token off Stellar), and balances gained
> `decimals`, `limit` and `sponsored`. `signTx` accepts `skipSponsorship`. New exported types:
> `WalletAssetsContent`, `EnabledAssetRecord`, `PollarPersistedWallet`.
>
> Earlier: **0.11.0** went multichain (Solana joins Stellar) and moved every request to the
> **`/v2`** API. **0.10.0** unified external wallets into `walletAdapters: WalletAdapter[]` and
> removed the singular `walletAdapter` resolver and `client.loginWallet()`.
>
> See [UPGRADE.md](../../UPGRADE.md) for migration steps and the
> [CHANGELOG](../../CHANGELOG.md) for the full version history before upgrading.

## Installation

```bash
npm install @pollar/core
# or
pnpm add @pollar/core
# or
yarn add @pollar/core
```

For React Native / Expo, also install one of the storage adapter peer deps:

```bash
# Expo (works in Expo Go — no native module required)
npx expo install expo-secure-store react-native-get-random-values
npm i react-native-polyfill-globals

# Bare React Native
npm i react-native-keychain react-native-get-random-values react-native-polyfill-globals
```

> **`react-native-quick-crypto` is optional.** SHA-256 and the ECDSA P-256 keypair now run on pure-JS
> [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) / [`@noble/curves`](https://github.com/paulmillr/noble-curves)
> (`NobleKeyManager`), so the SDK no longer needs `crypto.subtle` on React Native — it runs in Expo Go. Installing
> `react-native-quick-crypto` (a native module → Expo **dev build**, not Expo Go) is only a security upgrade: when
> `crypto.subtle` is present the SDK uses `WebCryptoKeyManager`, whose private key is **non-extractable**. With Noble
> the private scalar is held in JS and persisted through the storage adapter. Both produce valid DPoP proofs.

> **React Native runtime requirements.** The SDK builds a DPoP proof (RFC 9449) for **every** authenticated request.
> That path uses three standard Web primitives that React Native / Hermes does **not** all ship by default. Register
> them at the very top of your entry file, **before** any `@pollar/core` import. If any is missing, DPoP proof
> construction fails and **no authenticated request works** — the SDK is not at fault, the runtime is.
>
> | Primitive                     | Used by                                                          | Polyfill                                                                                                                             |
> | ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
> | `crypto.getRandomValues`      | keypair generation (`NobleKeyManager`), DPoP `jti`               | [`react-native-get-random-values`](https://github.com/LinusU/react-native-get-random-values)                                         |
> | `TextEncoder` / `TextDecoder` | DPoP proof encoding, base64url, JWK thumbprint                   | bundled in [`react-native-polyfill-globals`](https://github.com/acostalima/react-native-polyfill-globals) (or `text-encoding`)       |
> | `URL` (spec-compliant)        | DPoP `htu` normalization (`new URL(request.url)` on every proof) | bundled in `react-native-polyfill-globals` (or [`react-native-url-polyfill`](https://github.com/charpeni/react-native-url-polyfill)) |
>
> SHA-256 no longer needs `crypto.subtle.digest` — it runs on `@noble/hashes`, so no `react-native-quick-crypto` is
> required (see the note above).
>
> `react-native-polyfill-globals/auto` is the pragmatic one-liner — it installs `TextEncoder`/`TextDecoder` **and**
> `URL` together (plus base64 / fetch-streaming you don't strictly need). The SDK does **not** rely on `fetch` response
> streaming on React Native: it polls the non-streaming `/auth/session/status/{id}/poll` endpoint instead, so you do
> **not** need a fetch-streaming polyfill for auth — but you still need TextEncoder + URL from that same package.

Entry-file setup (e.g. `index.js`), **before importing `@pollar/core`**:

```ts
import 'react-native-get-random-values'; // crypto.getRandomValues
import 'react-native-polyfill-globals/auto'; // TextEncoder/TextDecoder + URL
// Optional: import 'react-native-quick-crypto' to upgrade to non-extractable WebCrypto keys (needs an Expo dev build).
```

## Overview

`@pollar/core` provides the `PollarClient` class and utilities to:

- Authenticate users via **Google**, **GitHub**, **OIDC**, **Email (OTP)**, **passkey** (smart wallets), **Stellar
  wallets** (Freighter, Albedo) or **Solana wallets** (SIWS)
- Sign every authenticated request with **DPoP** (RFC 9449), making stolen tokens useless to an attacker without the
  per-session keypair
- Build and submit Stellar transactions
- Fetch wallet balances via `PollarClient` (`refreshBalance()` / `getWalletBalance()`) - v2 balances are **multichain**,
  tagged by `chain`; every chain reports its native coin plus each token the app enabled. A balance is `null` when the
  chain could not be read, which must render as unavailable rather than as zero
- **Solana**: log in with **Sign In With Solana (SIWS)** and sign Solana transactions for sponsored external transfers
  (external-wallet connect via `@pollar/solana-wallet-standard-adapter`, preview)
- Swap assets across venues (SDEX / Soroswap / Aquarius) and run SEP-24 on/off-ramps
- React to real-time authentication state changes

## Quick Start (web)

```ts
import { PollarClient } from '@pollar/core';

const client = new PollarClient({ apiKey: 'your-api-key' });
// Storage and KeyManager autodetect:
//   storage  → localStorage with in-memory fallback
//   keypair  → WebCrypto ECDSA P-256, non-extractable, persisted in IndexedDB
```

## React Native (Expo)

```ts
// At your app entry, BEFORE importing @pollar/core — runtime polyfills (see table above):
import 'react-native-get-random-values'; // crypto.getRandomValues
import 'react-native-polyfill-globals/auto'; // TextEncoder/TextDecoder + URL
// Optional: import 'react-native-quick-crypto' to upgrade to non-extractable WebCrypto keys (needs an Expo dev build).

import { PollarClient } from '@pollar/core';
import { createSecureStoreAdapter } from '@pollar/core/adapters/expo';

// `await`: SecureStore is loaded via dynamic import.
const storage = await createSecureStoreAdapter({
  // Default: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  // Prevents iCloud Keychain from carrying the key to another device.
});

const client = new PollarClient({ apiKey: 'your-api-key', storage });
// KeyManager autodetects → NobleKeyManager (pure-JS @noble/curves p256).
```

## React Native (`react-native-keychain`)

```ts
import 'react-native-get-random-values'; // crypto.getRandomValues
import 'react-native-polyfill-globals/auto'; // TextEncoder/TextDecoder + URL
// Optional: import 'react-native-quick-crypto' to upgrade to non-extractable WebCrypto keys (needs an Expo dev build).
import { PollarClient } from '@pollar/core';
import { createKeychainAdapter } from '@pollar/core/adapters/react-native-keychain';

const storage = await createKeychainAdapter();
const client = new PollarClient({ apiKey: 'your-api-key', storage });
```

## Framework integration

`@pollar/core` is framework-agnostic: `PollarClient` is a plain class and the `on*StateChange` methods are
callback subscriptions. To render reactively, bridge those callbacks into your framework's state primitive. The
client instance should be a singleton (module scope, context, or DI) — never recreate it on every render.

### React / Next.js

`useSyncExternalStore` is the idiomatic bridge. In Next.js, only instantiate in Client Components (`'use client'`)
— server-side, the SDK degrades to a no-op and warns.

```tsx
'use client';
import { useSyncExternalStore } from 'react';
import { PollarClient, type AuthState } from '@pollar/core';

const client = new PollarClient({ apiKey: 'pk_...' }); // module scope = one instance

export function useAuthState(): AuthState {
  return useSyncExternalStore(
    (cb) => client.onAuthStateChange(cb), // returns the unsubscribe fn
    () => client.getAuthState(), // client snapshot
    () => client.getAuthState(), // server snapshot (idle)
  );
}

// const auth = useAuthState(); // re-renders on every auth transition
```

### Angular

The SDK's callbacks fire **outside Angular's zone**, so wrap state updates in `NgZone.run()` (or use signals) or the
view won't update. Expose the client through a service.

```ts
import { Injectable, NgZone, signal } from '@angular/core';
import { PollarClient, type AuthState } from '@pollar/core';

@Injectable({ providedIn: 'root' })
export class PollarService {
  private client = new PollarClient({ apiKey: 'pk_...' });
  readonly authState = signal<AuthState>(this.client.getAuthState());

  constructor(private zone: NgZone) {
    this.client.onAuthStateChange((state) => {
      this.zone.run(() => this.authState.set(state)); // re-enter Angular's zone
    });
  }

  login = (email: string) => this.client.login({ provider: 'email', email });
}
```

### Vue 3

Assign the callback payload into a `ref` (or `shallowRef`) inside `onMounted`; unsubscribe in `onUnmounted`.

```ts
import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { PollarClient, type AuthState } from '@pollar/core';

const client = new PollarClient({ apiKey: 'pk_...' });

export function useAuth() {
  const authState = shallowRef<AuthState>(client.getAuthState());
  let unsub = () => {};
  onMounted(() => {
    unsub = client.onAuthStateChange((s) => (authState.value = s)); // ref assign = reactive
  });
  onUnmounted(() => unsub());
  return { authState, login: client.login.bind(client) };
}
```

### React Native

Same as React (`useSyncExternalStore`), plus the entry-file polyfills and injected adapters shown in the
React Native sections above. OAuth and external-wallet logins require `openAuthUrl` / `walletAdapters` to be injected
(the built-in popup/extension adapters are web-only).

## Logging

The SDK logs through a level-gated logger. Configure it on `PollarClient`:

```ts
const client = new PollarClient({
  apiKey: 'pk_...',
  logLevel: 'warn', // 'silent' | 'error' | 'warn' | 'info' | 'debug' (default 'info')
});
```

Levels are ordered `silent` < `error` < `warn` < `info` < `debug`; setting one emits that level and every more
important one. `silent` disables all SDK logging. State-transition chatter (`auth:…`, `transaction:…`, `network:…`)
and retry warnings live at `debug`, so the default `info` keeps the console quiet while still showing lifecycle events
(Initialized, Session stored/restored, Tokens refreshed) and all warnings/errors.

Route logs to your own sink (pino, Sentry breadcrumbs, a test spy…) with `logger` — filtering by `logLevel` still
applies on top:

```ts
import { PollarClient, type PollarLogger } from '@pollar/core';

const sink: PollarLogger = {
  error: (...a) => myLogger.error(...a),
  warn: (...a) => myLogger.warn(...a),
  info: (...a) => myLogger.info(...a),
  debug: (...a) => myLogger.debug(...a),
};

const client = new PollarClient({ apiKey: 'pk_...', logLevel: 'debug', logger: sink });
```

`client.getLogger()` returns the configured logger (used internally by `@pollar/react` so its own logs honor the same
level + sink). `@pollar/stellar-wallets-kit-adapter` accepts the same `logLevel` / `logger` on its options.

## Preserved-on-disk storage shape

The session persists exactly:

```
clientSessionId, userId, status,
token { accessToken, refreshToken, expiresAt },
user { id?, ready },
wallet   PollarPersistedWallet          // back-compat: always the Stellar one
wallets? PollarPersistedWallet[]        // every wallet the user holds, one per chain
```

where `PollarPersistedWallet` is:

```
{ type, provider?, address, chain?, existsOnStellar?, fundingMode?,
  createdAt?, linkedAt?, network?, deployTxHash? }
```

> The persisted wallet exposes only `address` (G-address for `internal`,
> C-address for `smart`, the connected pubkey for `external`), and it is
> `string | null` — null when the wallet has no address yet. `chain` is the
> chain the address lives on, **not** testnet-vs-mainnet, which is `network`;
> it is absent on sessions minted before multi-chain, which are always Stellar.
> `wallets` is likewise absent on older sessions: treat that as "only `wallet`
> is known", not as "the user has no wallets". Sessions written by older SDKs
> are migrated transparently on read.

PII (`mail`, `first_name`, `last_name`, `avatar`, `providers.*`) lives **in memory only** on the `PollarClient` instance
and is fetched after auth. Reach it via:

```ts
const profile = client.getUserProfile();
// { mail, first_name, last_name, avatar, providers } | null
```

Storage keys are namespaced by `apiKeyHash` (first 8 hex chars of SHA-256 of your API key) so multiple SDK instances on
the same origin don't cross-contaminate.

## End-to-end example

```ts
import { PollarClient } from '@pollar/core';

const client = new PollarClient({ apiKey: 'your-api-key' });

// React to auth state
const unsubscribe = client.onAuthStateChange((state) => {
  console.log(state.step, state.errorCode ?? '');
});

// Wait until the keypair is ready and any persisted session has been restored
await client.ready();

// Start an email login
client.login({ provider: 'email', email: 'user@example.com' });

// Submit the OTP — clientSessionId is tracked internally
client.verifyEmailCode('123456');

// After success
const profile = client.getUserProfile(); // PII (memory-only)
const sessions = await client.listSessions();
```

## API Reference

### `new PollarClient(config)`

| Option               | Type                     | Required | Description                                                                                                                                    |
| -------------------- | ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`             | `string`                 | Yes      | Your Pollar API key                                                                                                                            |
| `baseUrl`            | `string`                 | No       | Override the default API endpoint                                                                                                              |
| `stellarNetwork`     | `'mainnet' \| 'testnet'` | No       | Target Stellar network (default: `testnet`)                                                                                                    |
| `storage`            | `Storage`                | No       | Pluggable storage adapter. Web autodetects `localStorage` with in-memory fallback; RN must inject one                                          |
| `keyManager`         | `KeyManager`             | No       | Pluggable DPoP key manager. Web picks `WebCryptoKeyManager`; otherwise `NobleKeyManager`                                                       |
| `walletAdapters`     | `WalletAdapter[]`        | No       | Extra wallet adapter instances. Built-in `FreighterAdapter`/`AlbedoAdapter` auto-register; an entry overrides a built-in by reusing its `type` |
| `requestTimeoutMs`   | `number`                 | No       | Max ms a single SDK HTTP attempt waits before aborting with `PollarNetworkError`. Default `10000`; `0` disables                                |
| `retry`              | `PollarRetryConfig`      | No       | Retry-with-backoff for idempotent transport failures (refresh + GETs). Default `{ attempts: 2, baseDelayMs: 300 }`                             |
| `deviceLabel`        | `string`                 | No       | UI-friendly device label sent at `/auth/login` time and shown in `listSessions()` rows                                                         |
| `onStorageDegrade`   | `OnStorageDegrade`       | No       | Notified the first time `localStorage` falls back to in-memory mode (SSR, private browsing, quota, …)                                          |
| `visibilityProvider` | `VisibilityProvider`     | No       | Foreground-detection signal for the silent-refresh scheduler. Web default; RN should inject an `AppState` provider                             |
| `maxIdleMs`          | `number`                 | No       | Stop proactive refreshes after this many ms of no client HTTP activity. Default `undefined` (refresh while visible)                            |
| `openAuthUrl`        | `AuthUrlOpener`          | No       | Strategy for opening the hosted OAuth URL. Web defaults to a popup; RN must provide one                                                        |
| `oauthRedirectUri`   | `string`                 | No       | `redirect_uri` sent to the backend for hosted OAuth. Web defaults to `window.location.origin`; RN = deep link                                  |
| `passkey`            | `PasskeyCeremony`        | No       | WebAuthn ceremony for Smart Wallet login (injected by `@pollar/react`). Required for `loginSmartWallet()`                                      |
| `passkeySign`        | `PasskeySigner`          | No       | Signs smart-account (C-address) transactions with the user's passkey. Required to send from a smart wallet                                     |

---

### Authentication

#### `client.login(options): void`

Unified entry point for every login. Fire-and-forget: it returns `void` and drives progress through
`onAuthStateChange`. To abort an in-flight flow, call `client.cancelLogin()` (below). The `provider` selects the
flow - a built-in auth provider (`google`, `github`, `email`) or the `type` of any registered wallet adapter. Note
`'wallet'` is intentionally NOT a provider: the adapter id itself is the provider.

```ts
// Social providers
client.login({ provider: 'google' });
client.login({ provider: 'github' });

// Email OTP
client.login({ provider: 'email', email: 'user@example.com' });

// Stellar wallet - the adapter's `type` is the provider
import { WalletType } from '@pollar/core';

client.login({ provider: WalletType.FREIGHTER }); // WalletType.FREIGHTER === 'freighter-native'
client.login({ provider: WalletType.ALBEDO }); // WalletType.ALBEDO === 'albedo-native'
// Adapters registered via `walletAdapters` (e.g. Stellar Wallets Kit):
client.login({ provider: 'xbull' });
```

#### `client.verifyEmailCode(code)`

Submits the OTP code for email authentication. The active `clientSessionId` is tracked internally — no need to pass it.

#### `client.providerAction(provider, action, payload?): void`

Invokes a named secondary step on a registered auth provider (e.g. an email `sendCode` / `verifyCode`, or a custom
provider's multi-step continuation). Reuses the in-flight login `AbortController` so the step stays cancellable via
`cancelLogin()`. For email, prefer the dedicated `verifyEmailCode()` above.

#### `client.cancelLogin()`

Aborts any in-flight login flow and resets `authState` to `idle`. Safe to call from any step (including `error`).

#### `client.logout(options?): Promise<void>`

Server-side revokes the refresh-token family via `POST /v2/auth/logout`, then clears local storage and resets the
keypair. Server revocation is best-effort: a failed POST still clears local state.

```ts
await client.logout(); // sign out this device
await client.logout({ everywhere: true }); // revoke every active session for this user
```

> Returns `Promise<void>`. Fire-and-forget call sites work, but `await` it if you want to observe server-side
> revocation.

#### `client.logoutEverywhere(): Promise<void>`

Shorthand for `logout({ everywhere: true })`.

#### `client.getWallet(): WalletInfo | null`

Returns the authenticated user's wallet as a discriminated union over `custody` (`'internal' | 'smart' | 'external'`),
each carrying `address` and a `provider`, or `null` when there is no wallet. To check whether a session exists, read
`getAuthState()` (`step === 'authenticated'`) or `getWallet()` - there is no `isAuthenticated()` helper.

#### `client.getUserProfile(): PollarUserProfile | null`

Returns the in-memory profile (`mail`, `first_name`, `last_name`, `avatar`, `providers`). `null` until `/auth/login`
completes. **This is the only way to read PII** — PII is not persisted to storage.

#### `client.ready(): Promise<void>`

Resolves once the keypair is initialized and any persisted session has been restored. Useful in tests and
server-side rendering.

#### `client.destroy(): void`

Detaches the cross-tab `storage` listener, aborts in-flight logins, and releases the keypair. Call this on unmount in
environments that re-instantiate `PollarClient`.

#### `client.refresh(): Promise<void>`

Forces an access-token refresh. Race-safe: concurrent calls coalesce into a single `/v2/auth/refresh` request.
Request middleware calls this automatically on a **token-expiry 401**, then retries idempotent GET/HEAD requests. A
**DPoP-Nonce challenge** or a **replayed-proof 401** does not refresh — it is retried with a freshly re-signed proof
carrying the new nonce, so a polling loop can't burn the refresh rate limit on nonce rotation.

---

### Sessions

#### `client.listSessions(): Promise<SessionInfo[]>`

Returns one row per active refresh-token family for the authenticated user:

```ts
interface SessionInfo {
  familyId: string;
  createdAt: string;
  lastUsedAt: string | null; // null until the family is used a second time
  userAgent: string | null;
  ipHash: string | null;
  deviceLabel: string | null; // required key, nullable
  current: boolean; // true for the family backing this client
  expiresAt: string;
}
```

#### `client.revokeSession(familyId): Promise<void>`

Revokes a specific refresh-token family. Revoking the **current** family does not immediately clear local state — the
next 401 triggers an auto-refresh, which fails (family revoked) and clears the session. Call `logout()` for an
immediate teardown.

---

### Transactions

#### `client.buildTx(operation, params, options?)`

Builds a Stellar transaction via the Pollar API.

```ts
await client.buildTx('payment', {
  destination: 'G...',
  amount: '10',
  asset: 'XLM',
});
```

#### `client.signTx(unsignedXdr, options?): Promise<SignOutcome>`

Signs an unsigned XDR. On a **custodial** session the backend signs and, by default, also applies sponsorship per the
app's dashboard config - it returns a fee-bumped envelope the caller can broadcast directly, with the app paying the
fee. Pass `skipSponsorship: true` to force the user to pay their own fee instead.

```ts
const outcome = await client.signTx(unsignedXdr);
const unsponsored = await client.signTx(unsignedXdr, { skipSponsorship: true });
```

> Smart-wallet (C-address / passkey) sessions do not use `signTx` - they sign through
> `signAndSubmitTx`, which runs the passkey ceremony.

#### `client.submitTx(signedXdr)`

Submits a signed XDR transaction to the network.

```ts
await client.submitTx(signedXdr);
```

#### `client.createAccount(): Promise<SubmitOutcome>`

Puts an **external** wallet's classic account on the Stellar network when it doesn't exist yet. The server builds a
sponsored `createAccount` (the new account starts at "0" balance; the app's sponsor wallet pays the base reserve and
fee) and signs only the sponsor; this client adds the new-account signature with the user's own wallet and broadcasts
via the submit path. Not applicable to custodial (internal) wallets — created on the server at login — nor to smart
(C-address) wallets. Trustlines are a separate step (`setTrustline`). The wallet exposes `existsOnStellar` +
`fundingMode` so a UI can decide whether to offer this.

#### `client.signAndSubmitTx(unsignedXdr?): Promise<SubmitOutcome>`

Signs and submits in one call. This is the path smart-wallet (passkey) sessions use - it runs the passkey ceremony -
and the argument is optional (it defaults to the transaction currently in `TransactionState`). Custodial and external
sessions can call it too.

#### `client.buildAndSignAndSubmitTx(operation, params, options?): Promise<SubmitOutcome>`

Build + sign + submit in one call. External and passkey wallets keep the granular `building → built → signing →
submitting → success` transitions (each composed call emits its own); custodial wallets take a single round-trip to
`/tx/build-sign-submit` and emit the compound `building-signing-submitting` step. For separate "Building…" / "Signing…"
/ "Submitting…" indicators on a custodial flow, call `buildTx` / `signTx` / `submitTx` yourself instead.

`client.runTx(...)` is an alias with the same signature - a shorter "just do the thing" name.

#### `client.sendPayment(params): Promise<SubmitOutcome>`

One entry point for a payment on any chain the user holds a wallet on. A Stellar payment routes through
`buildAndSignAndSubmitTx` (so external adapters and passkey wallets keep the split flow); a Solana payment is a single
server-side call and is **custodial-only** for now. `SendPaymentParams` is a per-chain union - a Stellar member with a
decimal `amount` and an `asset`, a Solana member with an integer base-unit `amount` and an optional `mint`.

```ts
// Stellar
await client.sendPayment({ destination: 'G...', amount: '1.5', asset: { type: 'native' } });
// Solana (custodial): amount in lamports; omit `mint` for native SOL
await client.sendPayment({ chain: 'SOLANA', destination: '...', amount: '1500000000' });
```

#### `client.getTxStatus(hash): Promise<{ hash; status; resultCode? }>`

Polls the network status of a submitted transaction - `status` is `'PENDING' | 'SUCCESS' | 'FAILED'`.

#### `client.signAuthEntry(entryXdr, { validUntilLedger }): Promise<SignAuthEntryOutcome>`

Signs a Soroban authorization entry (external adapters sign it directly). Emits no transaction state, so a UI subscribed
to `onTransactionStateChange` is not stranded on `signing`.

---

### Balances & assets

#### `client.refreshBalance(): Promise<void>`

Refreshes the authenticated user's OWN multichain balances and pushes the result to `WalletBalanceState`
(`onWalletBalanceStateChange`). No argument - always the current session's wallets. See the multichain notes on
`WalletBalanceRecord` above (a `null` balance is an unreadable chain, not zero).

#### `client.getWalletBalance(publicKey, network?): Promise<WalletBalanceContent>`

General-purpose balance lookup for ANY wallet on ANY network - not scoped to this application, and it does not touch
`WalletBalanceState`. Use `refreshBalance()` for the session's own wallet.

#### `client.getWallets(): WalletInfo[]`

Every wallet the user holds, one per chain (`getWallet()` returns only the primary Stellar one). Returns `[]` when there
is no session, or when the session predates the backend's multichain `wallets[]`.

#### `client.refreshAssets(): Promise<void>` / `client.getEnabledAssetsState()`

`refreshAssets()` loads the app's enabled assets paired with the wallet's on-chain trustline state and pushes it to
`EnabledAssetsState` (`getEnabledAssetsState()` / `onEnabledAssetsStateChange()`).

#### `client.setTrustline(asset, opts?): Promise<TrustlineOutcome>`

Establishes (omit `limit`) or removes (`limit: '0'`) a trustline for `{ code, issuer }`. Who pays is decided
**server-side** from the app config: custodial wallets hit `POST /wallet/assets/trustline` (the server sponsors or
self-pays, then submits), external wallets co-sign whichever XDR `/wallet/assets/trustline/build` returns. Pass
`opts.skipSponsorship` to force a self-pay `change_trust`. Smart (passkey) wallets don't use classic trustlines.

---

### Swaps

Quote and execute asset swaps across multiple venues (SDEX, Soroswap, Aquarius). `getSwapQuote` returns one priced
route per venue (each with a ready-to-run `build` payload); pass the chosen quote to `swap`, which establishes any
missing trustline for the buy asset (unless `autoTrustline: false`) and then executes. It dispatches on the quote's
build shape: a prebuilt XDR (Soroswap) is signed and submitted directly, while an operation + params quote (Aquarius,
SDEX) runs through the `runTx` pipeline; either way you can subscribe via `onTransactionStateChange`. Smart (passkey)
wallets are not supported yet.

```ts
const quotes = await client.getSwapQuote({
  sellAsset: 'XLM',
  buyAsset: 'USDC:GA5Z...',
  amount: '25',
  provider: 'auto', // or a concrete venue; defaults server-side
  slippageBps: 50,
});

const outcome = await client.swap(quotes[0]); // SubmitOutcome
```

Method signatures:

```ts
client.getSwapQuote(params: SwapQuoteParams): Promise<SwapQuote[]>;
client.swap(quote: SwapQuote, opts?: { autoTrustline?: boolean }): Promise<SubmitOutcome>;
```

The standalone `quoteSwap(api, body): Promise<SwapQuoteContent>` export is available for advanced callers that already
hold a `PollarApiClient`.

---

### Ramps (SEP-24)

On/off-ramp fiat through SEP-24 anchors (e.g. Anclap). Get a quote, create the on- or off-ramp, then drive the
transaction to completion. Custodial wallets receive a `kycUrl` to open; external wallets receive a `pendingSignature`
to sign and resume via `submitRampSignature`.

```ts
const quote = await client.getRampsQuote({
  /* RampsQuoteQuery */
});
const onramp = await client.createOnRamp({
  /* RampsOnrampBody */
});
const status = await client.pollRampTransaction(onramp.txId);
```

Available methods (all thin wrappers over the ramps endpoints):

```ts
client.getRampsQuote(query: RampsQuoteQuery): Promise<RampsQuoteResponse>;
client.getRampCountries(): Promise<RampsCountriesResponse>;
client.createOnRamp(body: RampsOnrampBody): Promise<RampsOnrampResponse>;
client.createOffRamp(body: RampsOfframpBody): Promise<RampsOfframpResponse>;
client.completeWithdraw(txId: string): Promise<RampsCompleteResponse>;
client.submitRampSignature(txId: string, body: RampsSignatureBody): Promise<RampsSignatureResponse>;
client.getRampTransaction(txId: string): Promise<RampsTransactionResponse>;
client.pollRampTransaction(txId: string, opts?: { intervalMs?: number; timeoutMs?: number }): Promise<RampTxStatus>;
```

Each also has a standalone `(api, ...)` export (`getRampsQuote`, `createOnRamp`, …) for callers holding a
`PollarApiClient`.

---

### Earn (yield vaults + lending)

Unified access to DeFindex vaults and Blend pools behind one provider-selected API. `getEarnProviders()` returns the
yield providers this app exposes (an empty array means Earn is disabled — hide any Earn UI); `getEarnOpportunities()`
lists a provider's vaults/pools with their live APY; `getEarnPosition()` returns the connected wallet's balance + APY
and a `withdrawUnit` (asset amount for Blend, share count for DeFindex). `earnDeposit` / `earnWithdraw` build the
provider's XDR server-side (contract-direct for Blend, via the DeFindex API for DeFindex) and then sign + submit it
through the same `runTx` transaction state machine (subscribe via `onTransactionStateChange`). The deposit `amount` is
the underlying asset amount; the withdraw `amount` is in the position's `withdrawUnit`. Smart (passkey) wallets are not
supported yet.

```ts
const providers = await client.getEarnProviders(); // e.g. ['blend', 'defindex'] — [] means Earn is off
const opportunities = await client.getEarnOpportunities('blend'); // each carries a live APY
const position = await client.getEarnPosition({ provider: 'blend', opportunity: opportunities[0].id });

await client.earnDeposit({ provider: 'blend', opportunity: opportunities[0].id, amount: '100' });
await client.earnWithdraw({ provider: 'blend', opportunity: opportunities[0].id, amount: position.withdrawable });
```

Method signatures:

```ts
client.getEarnProviders(): Promise<EarnProviderId[]>;
client.getEarnOpportunities(provider: EarnProviderId): Promise<EarnOpportunity[]>;
client.getEarnPosition(params: EarnPositionParams): Promise<EarnPosition>;
client.earnDeposit(params: EarnTxParams): Promise<SubmitOutcome>;
client.earnWithdraw(params: EarnTxParams): Promise<SubmitOutcome>;
```

---

### KYC

Fetch KYC status/providers and start or resolve a KYC flow:

```ts
client.getKycStatus(providerId?: string);
client.getKycProviders(country: string);
client.startKyc(body: KycStartBody): Promise<KycStartResponse>;
client.resolveKyc(providerId: string, level?: KycLevel);
client.pollKycStatus(providerId: string, opts?: { intervalMs?: number; timeoutMs?: number }): Promise<KycStatus>;
```

---

### Distribution

List and claim distribution (rewards) rules:

```ts
client.listDistributionRules(): Promise<DistributionRule[]>;
client.claimDistributionRule(body: DistributionClaimBody): Promise<DistributionClaimContent>;
```

---

### Smart Wallets (passkey)

Log into (or create) a Soroban smart-account C-address backed by a device passkey. Requires the `passkey` ceremony
(and `passkeySign` to send transactions) to be injected in the config - `@pollar/react` supplies these with
`@simplewebauthn/browser`. Both are fire-and-forget and drive `onAuthStateChange`.

```ts
client.loginSmartWallet(): void; // returning user (WebAuthn get)
client.createSmartWallet(): void; // new user (WebAuthn create + sponsored deploy)
```

---

### Network resilience

Every SDK HTTP attempt is bounded by `requestTimeoutMs` (default `10000`; `0` disables) so a stalled connection
fails fast instead of hanging forever. Idempotent transport failures (token refresh + GETs) are retried per `retry`
(default `{ attempts: 2, baseDelayMs: 300 }`); HTTP responses (including 4xx/5xx) are never retried. On timeout the
call rejects with a `PollarNetworkError` (`code: 'SDK_NETWORK_TIMEOUT'`):

```ts
import { isPollarNetworkError } from '@pollar/core';

try {
  await client.refresh();
} catch (err) {
  if (isPollarNetworkError(err)) {
    // fall back to a cached token, show a retry, etc.
  }
}
```

---

### State

Each state domain has its own typed subscriber. All `on*StateChange` methods return an unsubscribe function.

```ts
const unsubAuth = client.onAuthStateChange((state) => {
  // state.step — one of:
  //   'idle' | 'creating_session' | 'entering_email' | 'sending_email' |
  //   'entering_code' | 'verifying_email_code' | 'opening_oauth' |
  //   'connecting_wallet' | 'signing_wallet_challenge' | 'wallet_not_installed' |
  //   'authenticating_wallet' | 'creating_passkey' | 'deploying_smart_account' |
  //   'authenticating' | 'authenticated' | 'error'
  // state.session  — PollarPersistedSession (when step === 'authenticated')
  // state.verified — boolean            (when step === 'authenticated')
  // state.errorCode / .message / .previousStep   (when step === 'error')
});

const unsubTx = client.onTransactionStateChange((s) => {
  /* build → sign → submit */
});
const unsubHistory = client.onTxHistoryStateChange((s) => {
  /* paginated rows */
});
const unsubBalance = client.onWalletBalanceStateChange((s) => {
  /* balances */
});
const unsubAssets = client.onEnabledAssetsStateChange((s) => {
  /* enabled assets + trustline state */
});
const unsubSessions = client.onSessionsStateChange((s) => {
  /* active refresh-token families */
});
const unsubNetwork = client.onNetworkStateChange((s) => {
  /* mainnet / testnet */
});

unsubAuth();
```

Snapshot getters are also available: `getAuthState()`, `getTransactionState()`, `getTxHistoryState()`,
`getWalletBalanceState()`, `getEnabledAssetsState()`, `getSessionsState()`, `getNetworkState()`, `getLogger()`.

`fetchSessions()` refreshes `SessionsState` from the server (the same data `listSessions()` returns, pushed through the
subscriber instead of returned).

Error codes for the auth flow are surfaced via `AUTH_ERROR_CODES` / `AuthErrorCode`:

```ts
import { AUTH_ERROR_CODES, type AuthErrorCode } from '@pollar/core';

// AUTH_ERROR_CODES.EMAIL_CODE_INVALID
// AUTH_ERROR_CODES.EMAIL_CODE_EXPIRED
// AUTH_ERROR_CODES.SESSION_CREATE_FAILED
// AUTH_ERROR_CODES.WALLET_CONNECT_FAILED
// …see types.ts for the full list
```

---

### `StellarClient`

Lightweight helper to submit a signed transaction straight to Horizon (bypassing the Pollar API). Balance fetching
lives on `PollarClient` now (`refreshBalance()` / `getWalletBalance(publicKey, network?)`).

```ts
import { StellarClient } from '@pollar/core';

const stellar = new StellarClient('testnet');
// or: new StellarClient({ horizonUrl: 'https://horizon.stellar.org' })

const result = await stellar.submitTransaction(signedXdr);

if (result.success) {
  console.log(result.hash);
} else {
  console.error(result.errorCode); // 'HORIZON_ERROR' | 'NETWORK_ERROR' (or a Horizon result code)
}
```

---

### Wallet Adapters

For direct wallet interaction outside the login flow:

```ts
import { FreighterAdapter, AlbedoAdapter } from '@pollar/core';

const adapter = new FreighterAdapter();
const available = await adapter.isAvailable();
if (available) {
  const { address } = await adapter.connect();
}
```

To plug in external wallet stacks (e.g. Stellar Wallets Kit) without `@pollar/core` having to depend on them, pass an
array of `WalletAdapter` instances via `walletAdapters`. The built-in `FreighterAdapter` / `AlbedoAdapter` are
auto-registered; entries you pass are added on top and override a built-in by reusing its `type`. Each registered
adapter becomes reachable through `login({ provider: adapter.type })`:

```ts
import { PollarClient } from '@pollar/core';
import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

const client = new PollarClient({
  apiKey: 'pk_...',
  // stellarWalletsKitAdapters() returns a WalletAdapter[] (one per module)
  walletAdapters: stellarWalletsKitAdapters({ network: Networks.PUBLIC }),
});

client.login({ provider: 'xbull' }); // any adapter type the kit registers
```

To introspect what is registered: `client.listWalletAdapters()` returns `{ id, meta }[]` (meta sanitized),
`client.getWalletAdapter(id)` returns one adapter instance, and `client.getWalletType()` returns the connected wallet's
id (or `null`).

---

### Custom adapters (`AdapterFn` / `PollarAdapter`)

Generic adapter contract for wrapping external signing flows (e.g. Trustless Work SDK). Adapter functions receive
params and return an unsigned XDR; the client handles signing and submission.

```ts
import type { AdapterFn, PollarAdapter, PollarAdapters } from '@pollar/core';

const trustlessWork: PollarAdapter = {
  initialize: (async (params) => ({ unsignedTransaction: '...' })) satisfies AdapterFn,
  release: (async (params) => ({ unsignedTransaction: '...' })) satisfies AdapterFn,
};

const adapters: PollarAdapters = { trustlessWork };
```

## TypeScript

`@pollar/core` is written in TypeScript and ships full type declarations.

Key exported types:

```ts
import type {
  // Client
  PollarClientConfig,
  PollarLoginOptions,
  PollarPersistedSession,
  PollarUserProfile,
  PollarRetryConfig,
  AuthState,
  AuthErrorCode,
  LogLevel,
  PollarLogger,

  // Storage / keys / DPoP
  Storage,
  OnStorageDegrade,
  StorageDegradeReason,
  KeyManager,
  PublicEcJwk,
  BuildProofArgs,

  // Sessions
  SessionInfo,

  // Wallets
  WalletId,
  WalletInfo,
  WalletAdapter,
  WalletAdapterMeta,
  ConnectWalletResponse,
  SignTransactionOptions,
  SignTransactionResponse,
  SignAuthEntryOptions,
  SignAuthEntryResponse,

  // Multichain wallet state (v2)
  WalletChain,
  PollarPersistedWallet,
  WalletBalanceRecord,
  WalletBalanceContent,
  WalletBalanceState,
  WalletAssetsContent,
  EnabledAssetRecord,
  EnabledAssetsState,

  // Solana wallet adapters (SIWS)
  SolanaSignInInput,
  SolanaSignInOutput,
  SolanaSignMessageResponse,

  // Adapters
  AdapterFn,
  PollarAdapter,
  PollarAdapters,

  // Swaps
  SwapQuoteParams,
  SwapQuote,
  SwapProvider,
  SwapVenue,

  // Earn (yield vaults + lending)
  EarnProviderId,
  EarnOpportunity,
  EarnPosition,
  EarnPositionParams,
  EarnTxParams,
  EarnWithdrawUnit,

  // Ramps (SEP-24)
  RampsQuoteQuery,
  RampsQuoteResponse,
  RampsOnrampBody,
  RampsOnrampResponse,
  RampsOfframpBody,
  RampsOfframpResponse,
  RampsTransactionResponse,
  RampsSignatureBody,
  RampsSignatureResponse,
  RampsCompleteResponse,

  // KYC
  KycLevel,
  KycStatus,
  KycStartBody,
  KycStartResponse,

  // Distribution
  DistributionRule,
  DistributionClaimBody,
  DistributionClaimContent,

  // Stellar
  StellarNetwork,
  StellarClientConfig,
  StellarBalance,
} from '@pollar/core';

// Runtime values (NOT type-only — `WalletType` is an enum, so it cannot be
// imported with `import type` and then used as `WalletType.FREIGHTER`).
import {
  WalletType,
  POLLAR_CORE_VERSION,
  AUTH_ERROR_CODES,
  PollarNetworkError,
  isPollarNetworkError,
  toBaseUnits,
  fromBaseUnits,
} from '@pollar/core';
```

## License

MIT
