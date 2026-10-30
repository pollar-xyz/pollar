# @pollar/core

Core SDK for [Pollar](https://pollar.xyz) - authentication and transaction utilities for Stellar and Solana applications.

## Solana

Pollar runs on Solana end to end for wallets and payments:

- **Sign in** with Phantom, Solflare or Backpack (Sign In With Solana, via `@pollar/solana-wallet-standard-adapter`), or
  with email / Google / GitHub to get a **Pollar-managed Solana wallet**, with no seed phrase.
- **Turnkey co-signed wallets** (mainnet): every signature is a 2-of-2 vote between the user's device and Pollar, and the
  device verifies the transaction, including Solana CCTP burns and swaps, before it votes.
- **Hold, send and receive SOL and SPL tokens** with `sendPayment()` and the drop-in React modals, with **app-sponsored
  fees** and token accounts created for the recipient.
- **Swap on Solana** through Jupiter and Titan (mainnet) with `getSolanaSwapQuote()` and `swapSolana()`.
- **Fund a card from Solana** with `fundCard({ amount, chain: 'SOLANA' })`.
- **Fiat on/off-ramps to Solana**: Bolivia (BOB, via Stereum + CCTP) and Brazil (BRL via Pix, PagFinance).

> This README describes **0.12.1**. The SDK calls sdk-api **`/v3`** (`baseUrl` stays an origin) and warns once when a
> response carries a `Deprecation` header. Every request carries **`x-pollar-sdk`** (`core/<version> <web|rn|node>`),
> which needs an sdk-api that lists it in CORS `allowHeaders`.
>
> See [UPGRADE.md](https://github.com/pollar-xyz/pollar/blob/main/UPGRADE.md) for migration steps and the [CHANGELOG](https://github.com/pollar-xyz/pollar/blob/main/CHANGELOG.md) for the full version
> history before upgrading. `signAuthEntry` passes the signature confirmation like every other signature; see
> [UPGRADE.md](https://github.com/pollar-xyz/pollar/blob/main/UPGRADE.md) if your app signs Soroban auth entries.

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
# Expo (works in Expo Go - no native module required)
npx expo install expo-secure-store react-native-get-random-values
npm i react-native-polyfill-globals

# Bare React Native
npm i react-native-keychain react-native-get-random-values react-native-polyfill-globals
```

> **`react-native-quick-crypto` is optional.** SHA-256 and the ECDSA P-256 keypair run on pure-JS
> [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) / [`@noble/curves`](https://github.com/paulmillr/noble-curves)
> (`NobleKeyManager`), so the SDK does not need `crypto.subtle` on React Native - it runs in Expo Go. Installing
> `react-native-quick-crypto` (a native module -> Expo **dev build**, not Expo Go) is only a security upgrade: when
> `crypto.subtle` is present the SDK uses `WebCryptoKeyManager`, whose private key is **non-extractable**. With Noble
> the private scalar is held in JS and persisted through the storage adapter. Both produce valid DPoP proofs.

> **React Native runtime requirements.** The SDK builds a DPoP proof (RFC 9449) for **every** authenticated request.
> That path uses three standard Web primitives that React Native / Hermes does **not** all ship by default. Register
> them at the very top of your entry file, **before** any `@pollar/core` import. If any is missing, DPoP proof
> construction fails and **no authenticated request works** - the SDK is not at fault, the runtime is.
>
> | Primitive                     | Used by                                                          | Polyfill                                                                                                                             |
> | ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
> | `crypto.getRandomValues`      | keypair generation (`NobleKeyManager`), DPoP `jti`               | [`react-native-get-random-values`](https://github.com/LinusU/react-native-get-random-values)                                         |
> | `TextEncoder` / `TextDecoder` | DPoP proof encoding, base64url, JWK thumbprint                   | bundled in [`react-native-polyfill-globals`](https://github.com/acostalima/react-native-polyfill-globals) (or `text-encoding`)       |
> | `URL` (spec-compliant)        | DPoP `htu` normalization (`new URL(request.url)` on every proof) | bundled in `react-native-polyfill-globals` (or [`react-native-url-polyfill`](https://github.com/charpeni/react-native-url-polyfill)) |
>
> SHA-256 does not need `crypto.subtle.digest` - it runs on `@noble/hashes`, so no `react-native-quick-crypto` is
> required (see the note above).
>
> `react-native-polyfill-globals/auto` is the pragmatic one-liner - it installs `TextEncoder`/`TextDecoder` **and**
> `URL` together (plus base64 / fetch-streaming you don't strictly need). The SDK does **not** rely on `fetch` response
> streaming on React Native: it polls the non-streaming `/auth/session/status/{id}/poll` endpoint instead, so you do
> **not** need a fetch-streaming polyfill for auth - but you still need TextEncoder + URL from that same package.

Entry-file setup (e.g. `index.js`), **before importing `@pollar/core`**:

```ts
import 'react-native-get-random-values'; // crypto.getRandomValues
import 'react-native-polyfill-globals/auto'; // TextEncoder/TextDecoder + URL
// Optional: import 'react-native-quick-crypto' to upgrade to non-extractable WebCrypto keys (needs an Expo dev build).
```

## Overview

`@pollar/core` provides the `PollarClient` class and utilities to:

- Authenticate users via **Google**, **GitHub**, **Email (OTP)**, **passkey** (smart wallets), **Stellar wallets**
  (Freighter, Albedo, Stellar Wallets Kit) or **Solana wallets** (SIWS)
- Sign every authenticated request with **DPoP** (RFC 9449), making stolen tokens useless to an attacker without the
  per-session keypair
- Build, sign and submit Stellar transactions, and send payments on Stellar, Solana and Polygon
- Sign Soroban authorization entries, including **x402** payments, through `client.stellar.authEntrySigner()`
- Hold the user's keys with **Turnkey co-signed wallets** (`client.cosign`) under a **signature confirmation** policy
- Fetch wallet balances via `PollarClient` (`refreshBalance()` / `getWalletBalance()`) - balances are **multichain**,
  tagged by `chain`; every chain reports its native coin plus each token the app enabled. A balance is `null` when the
  chain could not be read, which must render as unavailable rather than as zero
- **Solana**: log in with **Sign In With Solana (SIWS)** and sign Solana transactions for sponsored external transfers
  (external-wallet connect via `@pollar/solana-wallet-standard-adapter`, preview)
- Swap assets across venues (SDEX / Soroswap / Aquarius on Stellar, Jupiter / Titan on Solana), earn yield, issue and
  fund cards, and run fiat on/off-ramps, routed across providers, swaps and bridges
- Write user-facing texts in English, Spanish or Portuguese
- React to real-time authentication state changes

## Quick Start (web)

```ts
import { PollarClient } from '@pollar/core';

const client = new PollarClient({ apiKey: 'your-api-key' });
// Storage and KeyManager autodetect:
//   storage  -> localStorage with in-memory fallback
//   keypair  -> WebCrypto ECDSA P-256, non-extractable, persisted in IndexedDB
```

## React Native (Expo)

```ts
// At your app entry, BEFORE importing @pollar/core - runtime polyfills (see table above):
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
// KeyManager autodetects -> NobleKeyManager (pure-JS @noble/curves p256).
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

For the silent-refresh scheduler on React Native, inject `createAppStateVisibilityProvider()` from
`@pollar/core/adapters/react-native-appstate` as `visibilityProvider`.

## Framework integration

`@pollar/core` is framework-agnostic: `PollarClient` is a plain class and the `on*StateChange` methods are
callback subscriptions. To render reactively, bridge those callbacks into your framework's state primitive. The
client instance should be a singleton (module scope, context, or DI) - never recreate it on every render.

### React / Next.js

`useSyncExternalStore` is the idiomatic bridge. In Next.js, only instantiate in Client Components (`'use client'`);
server-side, the SDK degrades to a no-op and warns.

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
important one. `silent` disables all SDK logging. State-transition chatter (`auth:...`, `transaction:...`, `network:...`)
and retry warnings live at `debug`, so the default `info` keeps the console quiet while still showing lifecycle events
(Initialized, Session stored/restored, Tokens refreshed) and all warnings/errors.

Route logs to your own sink (pino, Sentry breadcrumbs, a test spy...) with `logger` - filtering by `logLevel` still
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
dpopJkt?                                // thumbprint of the DPoP key the tokens are bound to
wallet   PollarPersistedWallet          // back-compat: always the Stellar one
wallets? PollarPersistedWallet[]        // every wallet the user holds, one per chain
```

where `PollarPersistedWallet` is:

```
{ type, provider?, address, chain?, existsOnStellar?, provisioning?, fundingMode?,
  createdAt?, linkedAt?, network?, deployTxHash? }
```

> The persisted wallet exposes only `address` (G-address for `internal`,
> C-address for `smart`, the connected pubkey for `external`), and it is
> `string | null` - null when the wallet has no address yet. `chain` is the
> chain the address lives on, **not** testnet-vs-mainnet, which is `network`;
> when it is absent the wallet is a Stellar one.
> When `wallets` is absent, treat that as "only `wallet` is known", not as
> "the user has no wallets". Sessions written by older SDKs are migrated
> transparently on read.

`dpopJkt` lets the client detect locally that the stored keypair is not the one the tokens are bound to, instead of
looping through 401s.

PII (`mail`, `first_name`, `last_name`, `avatar`, `providers.*`) lives **in memory only** on the `PollarClient` instance
and is fetched after auth. Reach it via:

```ts
const profile = client.getUserProfile();
// { mail, first_name, last_name, avatar, providers } | null
```

Storage keys are namespaced by `apiKeyHash` (first 8 hex chars of SHA-256 of your API key) so multiple SDK instances on
the same origin don't cross-contaminate.

Two keys sit beside the session and deliberately survive `logout()`, because they describe the
SERVER rather than the user and grant nothing on their own: `pollar:<hash>:dpopNonce` (the last
nonce the server issued) and `pollar:<hash>:dpopClockOffset` (the learned `serverTime - localTime`,
in seconds, so only a genuine cold start pays one proof rejected for clock skew before the offset
is known). The offset is learned only from answers that cannot come from the browser cache: a
non-GET/HEAD request, or a 401.

## End-to-end example

```ts
import { PollarClient } from '@pollar/core';

const client = new PollarClient({ apiKey: 'your-api-key' });

// React to auth state
const unsubscribe = client.onAuthStateChange((state) => {
  console.log(state.step, state.step === 'error' ? state.errorCode : '');
});

// Wait until the keypair is ready and any persisted session has been restored
await client.ready();

// Start an email login
client.login({ provider: 'email', email: 'user@example.com' });

// Submit the OTP - clientSessionId is tracked internally
client.verifyEmailCode('123456');

// After success
const profile = client.getUserProfile(); // PII (memory-only)
const sessions = await client.listSessions();
```

## API Reference

### `new PollarClient(config)`

| Option               | Type                      | Required | Description                                                                                                                                    |
| -------------------- | ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`             | `string`                  | Yes      | Your Pollar API key                                                                                                                            |
| `baseUrl`            | `string`                  | No       | Override the default API origin (no version path; the SDK calls `/v3`)                                                                         |
| `stellarNetwork`     | `'mainnet' \| 'testnet'`  | No       | Target Stellar network (default: `testnet`)                                                                                                    |
| `locale`             | `string`                  | No       | BCP 47 tag (`'es'`, `'pt-BR'`, `'en'`) for the SDK's modals. A language pinned in the dashboard wins; see [Languages](#languages)              |
| `storage`            | `Storage`                 | No       | Pluggable storage adapter. Web autodetects `localStorage` with in-memory fallback; RN must inject one                                          |
| `keyManager`         | `KeyManager`              | No       | Pluggable DPoP key manager. Web picks `WebCryptoKeyManager`; otherwise `NobleKeyManager`                                                       |
| `walletAdapters`     | `WalletAdapter[]`         | No       | Extra wallet adapter instances. Built-in `FreighterAdapter`/`AlbedoAdapter` auto-register; an entry overrides a built-in by reusing its `type` |
| `requestTimeoutMs`   | `number`                  | No       | Max ms a single SDK HTTP attempt waits before aborting with `PollarNetworkError`. Default `10000`; `0` disables                                |
| `submitTimeoutMs`    | `number`                  | No       | Same, for the submit-family calls (`submitTx`, `signAndSubmitTx`, `buildAndSignAndSubmitTx`). Default `30000`                                  |
| `loginTimeoutMs`     | `number`                  | No       | Same, for `POST /auth/login` alone - the one call that does real server-side work. Default `45000`; `0` disables                               |
| `retry`              | `PollarRetryConfig`       | No       | Retry-with-backoff for idempotent transport failures (refresh + GETs). Default `{ attempts: 2, baseDelayMs: 300 }`                             |
| `logLevel`           | `LogLevel`                | No       | Minimum severity the SDK logs (default `'info'`). See [Logging](#logging)                                                                      |
| `logger`             | `PollarLogger`            | No       | Sink the SDK writes logs to (default `console`)                                                                                                |
| `deviceLabel`        | `string`                  | No       | UI-friendly device label sent at `/auth/login` time and shown in `listSessions()` rows                                                         |
| `onStorageDegrade`   | `OnStorageDegrade`        | No       | Notified the first time `localStorage` falls back to in-memory mode (SSR, private browsing, quota, ...)                                        |
| `visibilityProvider` | `VisibilityProvider`      | No       | Foreground-detection signal for the silent-refresh scheduler. Web default; RN should inject an `AppState` provider                             |
| `maxIdleMs`          | `number`                  | No       | Stop proactive refreshes after this many ms of no client HTTP activity. Default `undefined` (refresh while visible)                            |
| `openAuthUrl`        | `AuthUrlOpener`           | No       | Strategy for opening the hosted OAuth URL. Web defaults to a popup; RN must provide one                                                        |
| `oauthRedirectUri`   | `string`                  | No       | `redirect_uri` sent to the backend for hosted OAuth. Web defaults to `window.location.origin`; RN = deep link                                  |
| `passkey`            | `PasskeyCeremony`         | No       | WebAuthn ceremony for Smart Wallet login (injected by `@pollar/react`). Required for `loginSmartWallet()`                                      |
| `passkeySign`        | `PasskeySigner`           | No       | Signs smart-account (C-address) transactions with the user's passkey. Required to send from a smart wallet                                     |
| `confirmation`       | `ConfirmationPolicy`      | No       | `'prompt'`, `'auto'` or `{ window: { seconds, maxUsd } }`. Unset, the dashboard setting applies; set, the stricter of the two wins             |
| `cosignManual`       | `boolean`                 | No       | Signing calls on a co-signed wallet return `cosign_pending` and the app approves through `client.cosign`. Default `false`                      |
| `cosignKeyManager`   | `KeyManager`              | No       | Device key of a Turnkey co-signed wallet. Defaults to a second `defaultKeyManager` under the `cosign` namespace, kept across logouts           |
| `recoveryPasskey`    | `RecoveryPasskeyCeremony` | No       | Passkey ceremonies for a Turnkey wallet's recovery (injected by `@pollar/react`)                                                               |

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

Submits the OTP code for email authentication. The active `clientSessionId` is tracked internally - no need to pass it.

#### `client.providerAction(provider, action, payload?): void`

Invokes a named secondary step on a registered auth provider (e.g. an email `sendCode` / `verifyCode`, or a custom
provider's multi-step continuation). Reuses the in-flight login `AbortController` so the step stays cancellable via
`cancelLogin()`. For email, prefer the dedicated `verifyEmailCode()` above.

#### `client.cancelLogin()`

Aborts any in-flight login flow and resets `authState` to `idle`. Safe to call from any step (including `error`).

#### `client.logout(options?): Promise<void>`

Server-side revokes the refresh-token family via `POST /v3/auth/logout`, then clears local storage and resets the
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

Returns the authenticated user's Stellar wallet as a discriminated union over `custody` (`'internal' | 'smart' | 'external'`),
each carrying `address` and a `provider`, or `null` when there is no wallet. To check whether a session exists, read
`getAuthState()` (`step === 'authenticated'`) or `getWallet()` - there is no `isAuthenticated()` helper. A
platform-managed Stellar wallet also carries `provisioning` - see
[Wallet provisioning](#wallet-provisioning) before offering any on-chain operation on a fresh session.

#### `client.hasWallet(): boolean` / `client.createWallet(options?): Promise<WalletInfo>`

For an app whose wallet creation is set to "on demand" in the dashboard (or never), or whose custody is left to the
user, a login creates no wallet: the session restores as signed in with `provisioning: 'NONE'`. `hasWallet()` says
whether the user has a wallet on any chain, and `createWallet({ custody })` creates it (`custody` is
`'COSIGNED' | 'SELF_CUSTODY'` when the user picks). It is idempotent, and throws `PollarApiError`
(`SDK_WALLET_PROVISIONING_DISABLED`, `SDK_WALLET_PROVISIONING_UNSUPPORTED`) when the app or the user cannot get one. A
signing call made without a wallet returns `SDK_WALLET_REQUIRED`; detect it with `isWalletRequired()` /
`WALLET_REQUIRED_CODE`.

#### `client.getUserProfile(): PollarUserProfile | null`

Returns the in-memory profile (`mail`, `first_name`, `last_name`, `avatar`, `providers`). `null` until `/auth/login`
completes. **This is the only way to read PII** - PII is not persisted to storage.

#### `client.ready(): Promise<void>`

Resolves once the keypair is initialized and any persisted session has been restored. Useful in tests and
server-side rendering.

#### `client.destroy(): void`

Detaches the cross-tab `storage` listener, aborts in-flight logins, and releases the keypair. Call this on unmount in
environments that re-instantiate `PollarClient`.

#### `client.refresh(): Promise<void>`

Forces an access-token refresh. Race-safe: concurrent calls coalesce into a single `/v3/auth/refresh` request.
Request middleware calls this automatically on a **token-expiry 401**, then retries idempotent GET/HEAD requests. A
**DPoP-Nonce challenge**, a **replayed-proof 401** or a proof rejected for **clock skew** does not refresh - it is
retried with a freshly re-signed proof, so a polling loop can't burn the refresh rate limit on nonce rotation.

#### `isPollarClient(value)` / `client.setPasskeyDefaults(defaults)`

`isPollarClient(value)` is a type guard that recognizes a client even across duplicate copies of this package
(`instanceof` cannot). `setPasskeyDefaults({ passkey?, passkeySign?, recoveryPasskey? })` lets the UI layer supply the
passkey ceremonies after construction; it only fills gaps and never replaces a ceremony passed in the config.

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

Revokes a specific refresh-token family. Revoking the **current** family does not immediately clear local state - the
next 401 triggers an auto-refresh, which fails (family revoked) and clears the session. Call `logout()` for an
immediate teardown.

---

### Wallet provisioning

The platform creates an end-user's Stellar account in the background, so a login can return
before the account is on the ledger. These four describe that window. Only the ACCOUNT is
described - trustlines are added incrementally over an app's life, so a wallet does not leave
`READY` because a token was enabled yesterday (per-asset state is `getEnabledAssetsState()`).

#### `wallet.provisioning: 'READY' | 'CREATING' | 'FAILED' | 'NONE'`

On `getWallet()`, `getWallets()` and the persisted session. `'NONE'` is a session without a wallet (see
[`createWallet()`](#clienthaswallet-boolean--clientcreatewalletoptions-promisewalletinfo)). **Absent** on a session
minted before 0.11.4 - read `undefined` as "not reported", not as a problem.

#### `client.onWalletStateChange(cb): () => void`

Fires when the platform-managed Stellar wallet's account changes state. Replays the current
value on subscribe, the same contract as `onAuthStateChange`, so a late subscriber never waits
for a transition that already happened, and a subscriber that came before the session was
restored hears its first value when the restore lands. A value another tab found and persisted
reaches this tab's subscribers too, once. Emits only on CHANGE: a wallet already `READY` at
login emits `READY` once, on subscribe, and never again.

```ts
const off = client.onWalletStateChange((provisioning) => {
  if (provisioning === 'CREATING') showPreparing();
  if (provisioning === 'READY') enableSending();
  if (provisioning === 'FAILED') showSupportPath();
});
```

While a wallet is `CREATING` the client polls `GET /v3/wallet/state` - 1s, 2s, 3s ... to a 10s
ceiling, at most 12 checks - and stops on `READY` or `FAILED`, on `logout()` and on `destroy()`.
Giving up is safe: the next login or session resume re-enqueues a creation that never landed.

#### `client.refreshWalletState(): Promise<WalletProvisioning | null>`

For a host that knows better than a timer - a screen the user just opened, a pull to refresh.
Returns the current value, or `null` when there is no session or the server could not answer.
Never throws.

#### `isWalletNotReady(errorOrOutcome)` / `WALLET_NOT_READY_CODE`

While the account is off the ledger the server refuses on-chain operations with
`SDK_WALLET_NOT_READY` (409) rather than letting each one fail as `op_no_source_account`. The
helper accepts either a thrown `PollarApiError` or a returned transaction outcome, since the tx
methods report failures as a value. The right response is to wait for `onWalletStateChange` -
not to retry.

```ts
import { isWalletNotReady } from '@pollar/core';

const outcome = await client.signAndSubmitTx(unsignedXdr);
if (isWalletNotReady(outcome)) {
  // the account is not on the ledger yet; wait for the transition
}
```

---

### Transactions

Every signing call passes the [signature confirmation](#co-signed-wallets-and-confirmation) first. A transaction-state
listener that throws is isolated and its error logged; it never fails the transaction.

#### `client.buildTx(operation, params, options?)`

Builds a Stellar transaction via the Pollar API.

```ts
await client.buildTx('payment', {
  destination: 'G...',
  amount: '10',
  asset: { type: 'native' },
});
```

#### `client.signTx(unsignedXdr, options?): Promise<SignOutcome>`

Signs an unsigned XDR. On an **embedded** session the backend signs and, by default, also applies sponsorship per the
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
via the submit path. Not applicable to embedded (internal) wallets - created on the server - nor to smart
(C-address) wallets. Trustlines are a separate step (`setTrustline`). The wallet exposes `existsOnStellar` +
`fundingMode` so a UI can decide whether to offer this.

#### `client.signAndSubmitTx(unsignedXdr?): Promise<SubmitOutcome>`

Signs and submits in one call. This is the path smart-wallet (passkey) sessions use - it runs the passkey ceremony -
and the argument is optional (it defaults to the transaction currently in `TransactionState`). Embedded and external
sessions can call it too.

#### `client.buildAndSignAndSubmitTx(operation, params, options?): Promise<SubmitOutcome>`

Build + sign + submit in one call. External and passkey wallets keep the granular `building -> built -> signing ->
submitting -> success` transitions (each composed call emits its own); embedded wallets take a single round-trip to
`/tx/build-sign-submit` and emit the compound `building-signing-submitting` step. For separate "Building..." /
"Signing..." / "Submitting..." indicators on an embedded flow, call `buildTx` / `signTx` / `submitTx` yourself instead.

`client.runTx(...)` is an alias with the same signature - a shorter "just do the thing" name.

#### `client.sendPayment(params): Promise<SubmitOutcome>`

One entry point for a payment on Stellar, Solana or Polygon. A Stellar payment routes through `buildAndSignAndSubmitTx`
(so external adapters and passkey wallets keep the split flow). A Solana payment is a single server-side call for an
embedded or co-signed wallet, and an external Solana wallet (Phantom, Solflare) signs the transfer the backend built.
A Polygon payment runs from an embedded or co-signed wallet; an external Polygon wallet signs its own transactions and
is refused. `SendPaymentParams` is a per-chain union - a Stellar member with a decimal `amount`, an `asset` and
optional build `options`, and Solana / Polygon members with an integer base-unit `amount` and an optional `mint` (the
SPL mint, or the ERC-20 contract on Polygon).

```ts
// Stellar
await client.sendPayment({ destination: 'G...', amount: '1.5', asset: { type: 'native' } });
// Stellar with a memo: 'text', 'id' or 'hash' (32 bytes as 64 hex characters, e.g. a SHA-256 receipt)
await client.sendPayment({
  destination: 'G...',
  amount: '1.5',
  asset: { type: 'native' },
  options: { memo: { type: 'hash', value: sha256Hex } },
});
// Solana: amount in lamports; omit `mint` for native SOL
await client.sendPayment({ chain: 'SOLANA', destination: '...', amount: '1500000000' });
```

#### `client.getTxStatus(hash): Promise<{ hash; status; resultCode?; operationCodes?; ... }>`

Polls the network status of a submitted transaction - `status` is `'PENDING' | 'SUCCESS' | 'FAILED'`.
`transactionErrorMessage(code, details?, language?)` turns a failure into text for the user.

#### `client.signAuthEntry(entryXdr, { validUntilLedger }): Promise<SignAuthEntryOutcome>`

Signs a Soroban authorization entry (`SorobanAuthorizationEntry`, base64 XDR) for a transaction someone else submits:
a contract that sponsors the gas, an x402 facilitator. External adapters sign it directly; embedded wallets are signed
by the backend, which first checks the entry against the app's contract/function allowlist and caps the validity
window; a co-signed wallet passes the same checks, then the device recomputes the entry's hash and votes
(`cosign_pending` under `cosignManual`). Smart (passkey) wallets cannot sign auth entries.

It passes the signature confirmation like every other signature. A token `transfer` on the Stellar asset contract of a
priced asset shows its destination, amount and asset (`kind: 'sign_auth_entry'`, `operation: 'transfer'`) and counts
its USD value against a window; any other entry asks. An agent that pays unattended sets the app to `AUTO`, or `WINDOW`
with a USD cap; a headless client under `'prompt'` with no `onConfirmationRequest` subscriber gets
`SDK_CONFIRMATION_UNAVAILABLE`. Emits no transaction state, so a UI subscribed to `onTransactionStateChange` is not
stranded on `signing`.

#### x402 and SEP-43: `client.stellar.authEntrySigner(options?)`

A SEP-43 signer over the user's wallet, the one stellar-sdk's contract client and x402's `ExactStellarScheme` take.
Each signature goes through `signAuthEntry`, so the allowlist, the validity window, the confirmation and a co-signed
wallet's vote all apply. It refuses a preimage for another network, an entry signed to another expiration, and a
wallet whose signing key is not its address (a wallet moved to Turnkey).

```ts
// ExactStellarScheme comes from your x402 client package
const scheme = new ExactStellarScheme(client.stellar.authEntrySigner(), { url });
```

`createAuthEntrySigner(deps, options?)` builds the same signer for a client built elsewhere. A
[custom adapter](#custom-adapters-adapterfn--pollaradapter) can return an auth-entry step instead of a transaction
(`isAuthEntryAdapterStep`, `completeAuthEntryStep`).

---

### Balances & assets

#### `client.refreshBalance(): Promise<void>`

Refreshes the authenticated user's OWN multichain balances and pushes the result to `WalletBalanceState`
(`onWalletBalanceStateChange`). No argument - always the current session's wallets. See the multichain notes in the
[Overview](#overview) (a `null` balance is an unreadable chain, not zero).

#### `client.getWalletBalance(publicKey, network?): Promise<WalletBalanceContent>`

General-purpose balance lookup for ANY wallet on ANY network - not scoped to this application, and it does not touch
`WalletBalanceState`. Use `refreshBalance()` for the session's own wallet.

#### `client.getWallets(): WalletInfo[]`

Every wallet the user holds, one per chain (`getWallet()` returns only the primary Stellar one). Returns `[]` when there
is no session; when the backend reports no multichain `wallets[]`, it falls back to the single Stellar wallet.

#### `client.refreshAssets(): Promise<void>` / `client.getEnabledAssetsState()`

`refreshAssets()` loads the app's enabled assets paired with the wallet's on-chain trustline state and pushes it to
`EnabledAssetsState` (`getEnabledAssetsState()` / `onEnabledAssetsStateChange()`).

#### `client.setTrustline(asset, opts?): Promise<TrustlineOutcome>`

Establishes (omit `limit`) or removes (`limit: '0'`) a trustline for `{ code, issuer }`. Who pays is decided
**server-side** from the app config: embedded wallets hit `POST /wallet/assets/trustline` (the server sponsors or
self-pays, then submits), external wallets co-sign whichever XDR `/wallet/assets/trustline/build` returns. Pass
`opts.skipSponsorship` to force a self-pay `change_trust`. Smart (passkey) wallets don't use classic trustlines.

---

### Swaps

Quote and execute Stellar asset swaps across multiple venues (SDEX, Soroswap, Aquarius). `getSwapQuote` returns one priced
route per venue (each with a ready-to-run `build` payload); pass the chosen quote to `swap`, which establishes any
missing trustline for the buy asset (unless `autoTrustline: false`) and then executes. It dispatches on the quote's
build shape: a prebuilt XDR (Soroswap) is signed and submitted directly, while an operation + params quote (Aquarius,
SDEX) runs through the `runTx` pipeline; either way you can subscribe via `onTransactionStateChange`. Smart (passkey)
wallets are not supported yet.

```ts
const quotes = await client.getSwapQuote({
  sellAsset: { type: 'native' },
  buyAsset: { type: 'credit_alphanum4', code: 'USDC', issuer: 'GA5Z...' },
  amount: '25',
  provider: 'auto', // or a concrete venue: 'sdex' | 'soroswap' | 'aquarius'
  slippageBps: 50,
});

const outcome = await client.swap(quotes[0]); // SubmitOutcome
```

Method signatures:

```ts
client.getSwapConfig(): Promise<SwapVenue[]>; // the app's Stellar venues
client.getSwapTokens(): Promise<SwapToken[]>;
client.getSwapQuote(params: SwapQuoteParams): Promise<SwapQuote[]>;
client.swap(quote: SwapQuote, opts?: { autoTrustline?: boolean }): Promise<SubmitOutcome>;
```

The standalone `quoteSwap(api, body): Promise<SwapQuoteContent>` export is available for advanced callers that already
hold a `PollarApiClient`.

On Solana, `getSolanaSwapQuote` quotes from the user's Solana wallet on Jupiter and Titan (mainnet). Amounts are integer
base units of each mint, quotes come best output first, and they carry no transaction: `swapSolana` asks for the
signature confirmation, then has the backend build the picked route for the wallet, refusing one whose simulation pays
less than its minimum. A co-signed wallet approves it on the device (which checks the swap calls a known router), an
external wallet signs it in the connected wallet; custodial wallets cannot swap on Solana.

```ts
const venues = await client.getSolanaSwapConfig(); // [] means no swap on Solana for this app

const [best] = await client.getSolanaSwapQuote({
  inputMint: 'So11111111111111111111111111111111111111112', // wrapped SOL for SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  amount: '100000000', // 0.1 SOL in lamports
  slippageBps: 50,
});

const outcome = await client.swapSolana(best); // SubmitOutcome
```

```ts
client.getSolanaSwapConfig(): Promise<SolanaSwapVenue[]>;
client.getSolanaSwapQuote(params: SolanaSwapQuoteParams): Promise<SolanaSwapQuote[]>;
client.swapSolana(quote: SolanaSwapQuote, opts?: { slippageBps?: number }): Promise<SubmitOutcome>;
```

---

### Ramps

A ramp is an order of one or more legs that Pollar runs server-side: the
provider's leg (fiat in or out), and a swap or a bridge when the asset or chain
the user wants is not the provider's. Pick a pair from the routes, quote it,
turn the quote the user accepts into an order, and follow the order.

```ts
import { describeRampAction, rampQuoteFields } from '@pollar/core';

const { routes } = await client.getRampRoutes('ONRAMP');
const { fiat, asset } = routes[0];
const { quotes, rejected } = await client.quoteRamp({
  direction: 'ONRAMP',
  fiat: { currency: fiat.currency, rail: fiat.rail, country: fiat.country },
  asset: { code: asset.code, identifier: asset.identifier, chain: asset.chain },
  amount: { value: '100', denomination: 'in' }, // 'out' fixes what the user receives
});
// Ask the user for rampQuoteFields(quotes[0]) and send the answers as `payee`.
const order = await client.createRampOrder({ quoteId: quotes[0].quoteId, payee: { name: 'Ana Perez' } });
await client.pollRampOrder(order.id, { onUpdate: (o) => render(describeRampAction(o)) });
```

- `pendingAction` says what the order waits for: `FIAT_PAYMENT` (a QR, already
  rendered in `instructions.scannable`, or bank details), `SIGNATURE` (sign with
  `signRampLeg(orderId, actionId)` from an explicit Authorize),
  `COSIGN_APPROVAL` (vote on it like any co-sign request) or `KYC` (a link).
- `nextPollAfter` is when to read the order again; `pollRampOrder` follows it
  and stops once the order settles.
- A failure carries `resolutionAction`; `rampResolutionText(failure)` turns it
  into what the user can do. `rampLegTitle` and `rampLegStatus` describe each leg.
- A route refused for its amount (`LIMIT_BELOW_MINIMUM`, `LIMIT_ABOVE_MAXIMUM`)
  carries `failure.limit` (`RampQuoteLimit`: `min`, `max`, `side`, `currency`),
  and `rampResolutionText` words it ("This route takes at least 1,450 ARS. Try a
  larger amount."). `rampNoRouteText(rejected)` says why no route quoted.
- A payee the provider would refuse answers `400 VALIDATION_ERROR` with the
  reason in `body.message`; a quote with no route answers `422 SDK_RAMPS_NO_ROUTE`
  with `body.rejected`.
- `listRampOrders({ pending: 'true' })` returns the orders waiting on the user,
  `listRampOrders({ open: 'true' })` every one not final yet.
- `checkRampOrder(id)` asks about the fiat payment now, for a user who says they
  paid; `retryRampOrder(id)` runs a held order again from where it stopped.
- Every ramp text helper takes a trailing optional language (`'en'` by default);
  see [Languages](#languages).

### Ramp adapters

To build a provider package for Pollar's backend, use `RampAdapter`, `defineRampAdapter` and `defineRampAdapterRegistration` from `@pollar/core` or `@pollar/core/ramps`. Install its server registration in the backend; its rails then appear in the routes above. Pollar retains credentials, persistence, lifecycle and reconciliation. See the [server registration guide](https://github.com/pollar-xyz/pollar/blob/main/docs/development/custom-ramp-adapters.md), [provider implementation](https://github.com/pollar-xyz/pollar/blob/main/examples/custom-ramp/adapter.ts) and [application example](https://github.com/pollar-xyz/pollar/blob/main/examples/custom-ramp/client.ts).

`RampChain` is a closed enum (`STELLAR`, `POLYGON`, `SOLANA`), independent of
wallet networks. Use `RampChain.POLYGON` or `'POLYGON'` for a quote filter,
route asset or signer registration. Chain and network are separate fields;
lowercase names, unknown chains and CAIP-2 identifiers are rejected. Adding
another chain requires a backend enum migration and an updated SDK contract.
Exact amount strings keep their precision and formatting.

Register a signer for each chain/encoding pair a leg may ask for with `client.registerRampSigningHandler(chain, encoding, async (action) => signedPayload)`, `STELLAR`/`xdr` included: core has no built-in ramp signer. In a Stellar signer, `assertRampStellarSigner(action, address)` refuses a transaction that does not spend from `address` (or a SEP-10 login that is not the anchor's challenge for it). Handlers must validate the payload and authorized wallet account, chain and network before returning a signed payload without broadcasting it. Polling never invokes signing, and a ramp leg always asks for the user's confirmation, whatever the policy.

The backend lists only the routes its configured rails, venues and bridges can run.

---

### Earn (yield vaults + lending)

Unified access to DeFindex vaults and Blend pools behind one provider-selected API. `getEarnProviders()` returns the
yield providers this app exposes (an empty array means Earn is disabled - hide any Earn UI); `getEarnOpportunities()`
lists a provider's vaults/pools with their live APY; `getEarnPosition()` returns the connected wallet's balance + APY
and a `withdrawUnit` (asset amount for Blend, share count for DeFindex). `earnDeposit` / `earnWithdraw` build the
provider's XDR server-side (contract-direct for Blend, via the DeFindex API for DeFindex) and then sign + submit it
through the same `runTx` transaction state machine (subscribe via `onTransactionStateChange`). The deposit `amount` is
the underlying asset amount; the withdraw `amount` is in the position's `withdrawUnit`. Smart (passkey) wallets are not
supported yet.

```ts
const providers = await client.getEarnProviders(); // e.g. ['blend', 'defindex'] - [] means Earn is off
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

### Cards

Issue and fund cards from the providers the app enabled. `getCardProviders()` returns them (an empty array means Cards
is off - hide any card UI); `cardProviderId` can be left out of every other card call while there is exactly one.

```ts
client.getCardProviders(): Promise<CardProvider[]>;
client.getCardRequirements(params?): Promise<CardRequirements>;
client.getCardHolder(params?): Promise<CardHolder | null>;
client.createCardHolder(params?): Promise<CardHolder>;
client.submitCardKyc(params: { termsAccepted: boolean; kyc: CardKycInput; cardProviderId? }): Promise<CardHolder>;
client.issueCard(params?): Promise<CardInfo>;
client.getCards(params?): Promise<CardInfo[]>; // never includes card numbers
client.getCardBalance(params?): Promise<CardBalance | null>;
client.getCardTransactions(params?): Promise<CardTransactionsPage>;
client.fundCard(params: {
  amount: string;
  chain?: 'STELLAR' | 'SOLANA';
  idempotencyKey?: string;
  cardProviderId?;
}): Promise<CardFundingOutcome>;
client.getCardFunding(fundingId: string): Promise<CardFunding>;
client.listCardFundings(params?): Promise<CardFunding[]>;
client.revealCardSecrets(cardId: string, params?): Promise<CardSecrets>;
```

- `fundCard` moves USDC from the user's wallet on `chain` (Stellar by default) to the card's collateral. A custodial
  wallet pays on the server; an external wallet (Freighter, Phantom, Solflare) signs the transfer the backend built; a
  co-signed wallet votes on the device (`cosign_pending` under `cosignManual`). The outcome is `ok`, `cancelled` (the
  user declined) or `cosign_pending`, each with the `funding`. On Solana the USDC goes straight to the provider's Solana
  address, with no bridge, and the funding goes `CREATED`, `SENT`, `CREDITED`. Co-signed funding requires sdk-api with
  the v3 funding routes.
- `idempotencyKey` names one funding the user means to make. A retry with the same key (a double click, a response
  that never arrived) returns the funding the key already started instead of paying again; a new funding needs a new
  key.
- `revealCardSecrets()` decrypts the card number and CVC on the device with a one-shot key the server never sees, on
  WebCrypto or in plain JavaScript on React Native. Show them and drop them: never store or log the result.

---

### KYC

Fetch KYC status/providers and start or resolve a KYC flow. Pass `corridorId` when a ramp route asks for KYC, or
`cardProviderId` for a card provider's KYC: the read then answers for that step, whichever of its options the user
passed. With neither id, `getKycStatus()` answers for the app's own KYC steps and names the `pendingStep`.

```ts
client.getKycStatus(providerId?: string, corridorId?: string, cardProviderId?: string): Promise<KycStatusContent>;
client.getKycProviders(country: string, corridorId?: string, cardProviderId?: string): Promise<{ providers: KycProvider[] }>;
client.startKyc(body: KycStartBody & { cardProviderId?: string }): Promise<KycStartResponse>;
client.resolveKyc(providerId: string, level?: KycLevel, country?: string, corridorId?: string, idempotencyKey?: string, cardProviderId?: string);
client.pollKycDecision(providerId: string, opts?: { intervalMs?: number; timeoutMs?: number; corridorId?: string; cardProviderId?: string }): Promise<KycStatusContent>;
client.pollKycStatus(providerId: string, opts?: { intervalMs?: number; timeoutMs?: number; corridorId?: string; cardProviderId?: string }): Promise<KycStatus>;
```

- `KycStatus` is `'none' | 'pending' | 'approved' | 'rejected' | 'expired'`. A read also carries `decisionStatus`
  (`'pending' | 'manual_review' | 'approved' | 'rejected' | 'expired'`) and `reviewReason`, which say why a `pending` is
  pending.
- `pollKycDecision()` stops when the decision settles - approved, rejected, expired, held for manual review, or approved
  by the vendor and still being recorded - and returns the whole read. `pollKycStatus()` is the same poll reduced to a
  status, so a session held for review returns `'pending'`.
- The status, providers and start calls throw `PollarApiError` with the backend code (`SDK_KYC_UNDER_REVIEW`,
  `SDK_KYC_ALREADY_APPROVED`, ...). `resolveKyc()` treats `SDK_KYC_ALREADY_APPROVED` as approved, and reusing the same
  `idempotencyKey` after a vendor failure returns the session already created instead of billing a new one.
- `startKyc()` gets a 30s budget instead of the 10s request default, since creating a session waits on the vendor.

#### Requirement steps

A ramp corridor, and an app's own KYC, can require ordered steps: every step is required, in order, and each accepts any
of its equivalent options. A ramp quote reports the first pending step of a locked route in `requirementsRequired`
(`RampQuoteRequirement`: `type`, `optionId`, `corridorId`, `position`, `completed` of `total`, `status`, `reviewReason`)
instead of quoting it; complete that step, then quote again.

```ts
client.getAppRequirements(): Promise<AppRequirements>; // the app's own steps and the first pending one
// FORM: read (prefilled with the user's previous answers) and submit
client.getRequirementForm(formId: string): Promise<RequirementForm>;
client.submitRequirementForm(formId: string, answers: RequirementFormAnswers): Promise<RequirementFormSubmitted>;
// REGISTRY_CHECK (SEGIP): the verified identity prefilled; only the surname split and the CI complement are editable
client.getRegistryCheck(optionId: string): Promise<RegistryCheck>;
client.submitRegistryCheck(optionId: string, edit: RegistryCheckEdit): Promise<RegistryCheckSubmitted>;
// PROVIDER_REGISTRATION: what the provider receives, then register on the user's consent
client.getProviderRegistration(corridorId: string): Promise<ProviderRegistration>;
client.submitProviderRegistration(corridorId: string): Promise<ProviderRegistrationSubmitted>;
```

For a `KYC` step, open the option the step names (`optionId`) with the step's `corridorId`. A form field's label, help
and option labels may carry `pt` (Portuguese) next to the Spanish and English ones, and a field with
`showIf: { key, in }` is asked only while the earlier select, multiselect or checkbox it names answers one of those
values (`'true'` or `'false'` for a checkbox); a hidden field is neither checked nor sent. These need an sdk-api that
serves `/v3/requirements`.

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

### Co-signed wallets and confirmation

A Turnkey co-signed wallet (`custody: 'COSIGNED'`) signs only with a vote from the user's device; a self-custody one
(`'SELF_CUSTODY'`) is the user's alone. `client.cosign` (a `CosignManager`) holds the device key and verifies each
Stellar, Solana and Polygon request on the device before voting. By default the SDK settles a request itself; with
`cosignManual: true` the signing calls return `{ status: 'cosign_pending', request }` and the app drives
`client.cosign.verify()` (which returns the device's `proposal`), `approve()`, `reject()` and `pending()`.

- `client.cosign.switchCustody(to)` moves the wallet between co-signed and self-custody, and
  `client.cosign.migrateWallets(custody?)` moves the wallets Pollar still holds to Turnkey.
- `client.cosign.recovery` adds and uses recovery methods (passkeys, email code, device enrollment, phrase export).
- `getCosignState()` / `onCosignStateChange()` report the co-sign state.
- `request.appPaysFee` is `true` when the fee payer of the payload is not the user, so a prompt can say the app covers
  the fee before the vote. Once a transaction is signed or submitted, `TransactionState` carries `sponsored` from the
  platform's answer.

Every signature, whatever the wallet's custody, first passes the confirmation policy: `'prompt'` waits for the user,
`{ window: { seconds, maxUsd } }` lets the signatures after a confirmed one sign without asking up to a USD cap, and
`'auto'` signs without a prompt. The dashboard setting applies when `confirmation` is unset (it defaults to
`'prompt'`), and the stricter of the two wins when it is set. `@pollar/react` and `@pollar/react-native` render the
prompt; a headless app subscribes:

```ts
client.onConfirmationRequest((pending) => {
  for (const request of pending) {
    // request.kind, request.network, request.operation, request.details
    showPrompt(request, { onConfirm: request.confirm, onReject: request.reject });
  }
});
```

Under `'prompt'` a signing call fails with `SDK_CONFIRMATION_UNAVAILABLE` while nothing is subscribed, rather than
signing unasked. `getPendingConfirmations()` returns the current list. `cosignRefusalMessage()` and
`appUnavailableMessage()` turn a refused co-sign or an unavailable app into text for the user.

---

### Languages

The SDK's user-facing texts come in English, Spanish and Portuguese (`PollarLanguage`: `'en' | 'es' | 'pt'`). The
language a modal shows is, strongest first: the one the app pins in the dashboard (Branding > Language), the one the
code asks for (a component's `language` prop, then the client's `locale`), then the browser or device language;
English when none is one the SDK has.

```ts
import { PollarClient, resolveLanguage, transactionErrorMessage } from '@pollar/core';

const client = new PollarClient({ apiKey: 'pk_...', locale: 'pt-BR' }); // any BCP 47 tag
const language = resolveLanguage({ code: [client.getLocale()], device: navigator.language }); // 'pt'

transactionErrorMessage(outcome.code, outcome.details, language);
```

`languageFromTag(tag)` maps a BCP 47 tag to a `PollarLanguage` (or `null`), and `localizedText()` picks a text in the
language asked, falling back to the closest one. The functions that write user-facing text take a trailing optional
language (`'en'` by default): `transactionErrorMessage`, `cosignRefusalMessage`, `appUnavailableMessage`, every ramp
text (`rampLegTitle`, `rampStepTitle`, `rampStepStatusText`, `rampNextApproval`, `rampFieldError`,
`rampResolutionText`, `rampOrderResolutionText`, `rampRequirementCopy`, `rampTrustlineErrorText`, `rampNoRouteText`,
`describeRampAction`, `rampWalletStep`, `rampLegNote`), and `authErrorMessage(code, language)` gives the text of a
backend auth error code.

---

### Stellar ownership proofs (SEP-53 / SEP-10)

`client.stellar` namespaces the Stellar-specific proof standards so the multichain client stays clean. Each method
dispatches by wallet type: external wallets sign client-side through their adapter, embedded wallets sign server-side
through the API, and smart (passkey) wallets yield an error outcome - a C-address has no classic ed25519 key to prove.
`client.stellar.authEntrySigner()` is covered under [Transactions](#x402-and-sep-43-clientstellarauthentrysigneroptions).

```ts
// SEP-53: prove ownership by signing an arbitrary message
const proof = await client.stellar.sep53.signMessage('verify me');
// { status: 'signed', signature, signerAddress, scheme: 'sep53' } | { status: 'error', details?, code? }

// SEP-10: sign a verifier-issued web-auth challenge transaction
const auth = await client.stellar.sep10.sign({
  challengeXdr,
  homeDomains: 'verifier.example.com', // optional; enables full SEP-10 validation on the embedded path
  webAuthDomain: 'auth.verifier.example.com', // optional
});
// { status: 'signed', signedXdr, signerAddress } | { status: 'error', details?, code? }
```

`signature` is base64 ed25519 over the SEP-53 digest (`SHA-256("Stellar Signed Message:\n" + message)`), produced
identically by external wallets and the embedded signer - `scheme` is always `sep53`, so the two proof paths are
interchangeable for a verifier.

For external wallets, SEP-53 needs an adapter that implements the optional `signStellarMessage` method: the built-in
`FreighterAdapter` does (native v6 `signMessage`), and `@pollar/stellar-wallets-kit-adapter` does via
`kit.signMessage`. Albedo does not support SEP-53 message signing and yields an error outcome - use a SEP-10 challenge
instead. SEP-10 reuses the adapter's existing `signTransaction`, so every Stellar adapter supports it.

---

### Network resilience

Every SDK HTTP attempt is bounded by `requestTimeoutMs` (default `10000`; `0` disables) so a stalled connection
fails fast instead of hanging forever; the submit-family calls use `submitTimeoutMs` (default `30000`) and
`POST /auth/login` uses `loginTimeoutMs` (default `45000`). Idempotent transport failures (token refresh + GETs) are
retried per `retry` (default `{ attempts: 2, baseDelayMs: 300 }`); HTTP responses (including 4xx/5xx) are never
retried. On timeout the call rejects with a `PollarNetworkError` (`code: 'SDK_NETWORK_TIMEOUT'`):

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

API errors that are thrown (KYC, requirements, wallet creation, ...) are `PollarApiError`s carrying the backend
code; detect them with `isPollarApiError()`.

---

### State

Each state domain has its own typed subscriber. All `on*StateChange` methods return an unsubscribe function.

```ts
const unsubAuth = client.onAuthStateChange((state) => {
  // state.step - one of:
  //   'idle' | 'creating_session' | 'entering_email' | 'sending_email' |
  //   'entering_code' | 'verifying_email_code' | 'opening_oauth' |
  //   'connecting_wallet' | 'signing_wallet_challenge' | 'wallet_not_installed' |
  //   'authenticating_wallet' | 'creating_passkey' | 'deploying_smart_account' |
  //   'authenticating' | 'authenticated' | 'error'
  // state.session  - PollarPersistedSession (when step === 'authenticated')
  // state.verified - boolean            (when step === 'authenticated')
  // state.errorCode / .message / .previousStep   (when step === 'error')
});

const unsubTx = client.onTransactionStateChange((s) => {
  /* build -> sign -> submit */
});
const unsubHistory = client.onTxHistoryStateChange((s) => {
  /* paginated rows, loaded with fetchTxHistory() */
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
`getWalletBalanceState()`, `getEnabledAssetsState()`, `getSessionsState()`, `getNetworkState()`, `getCosignState()`,
`getPendingConfirmations()`, `getLogger()`, `getLocale()`.

`fetchSessions()` refreshes `SessionsState` from the server (the same data `listSessions()` returns, pushed through the
subscriber instead of returned).

Error codes for the auth flow are surfaced via `AUTH_ERROR_CODES` / `AuthErrorCode`:

```ts
import { AUTH_ERROR_CODES, type AuthErrorCode } from '@pollar/core';

// AUTH_ERROR_CODES.EMAIL_CODE_INVALID
// AUTH_ERROR_CODES.EMAIL_CODE_EXPIRED
// AUTH_ERROR_CODES.SESSION_CREATE_FAILED
// AUTH_ERROR_CODES.WALLET_CONNECT_FAILED
// ...see types.ts for the full list
```

---

### `StellarClient`

Lightweight helper to submit a signed transaction straight to Horizon (bypassing the Pollar API). Balance fetching
lives on `PollarClient` (`refreshBalance()` / `getWalletBalance(publicKey, network?)`).

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

To introspect what is registered: `client.listWalletAdapters()` returns `{ id, meta, chain }[]` (meta sanitized),
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

An adapter function can instead return an `AuthEntryAdapterStep` (`{ unsignedAuthEntry, validUntilLedger, complete }`)
when someone else submits the transaction and pays the fee (an x402 facilitator, a contract that sponsors the gas).
`completeAuthEntryStep(step, client.signAuthEntry.bind(client))` signs the entry without submitting anything and passes
it to `complete`; its result is `{ status: 'completed', result }` or the reason nothing was signed.
`isAuthEntryAdapterStep(value)` tells the two shapes apart.

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
  PollarLanguage,

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
  WalletProvisioning,
  WalletAdapter,
  WalletAdapterMeta,
  ConnectWalletResponse,
  SignTransactionOptions,
  SignTransactionResponse,
  SignAuthEntryOptions,
  SignAuthEntryResponse,
  SignMessageOptions,
  SignMessageResponse,

  // Transactions
  SignOutcome,
  SubmitOutcome,
  SignAuthEntryOutcome,
  TrustlineOutcome,
  TransactionState,

  // Multichain wallet state
  WalletChain,
  PollarPersistedWallet,
  WalletBalanceRecord,
  WalletBalanceContent,
  WalletBalanceState,
  WalletAssetsContent,
  EnabledAssetRecord,
  EnabledAssetsState,
  SendPaymentParams,

  // Co-signed wallets + confirmation
  CosignCustody,
  CosignRequest,
  ConfirmationPolicy,
  ConfirmationRequest,
  PendingConfirmation,

  // Solana wallet adapters (SIWS)
  SolanaSignInInput,
  SolanaSignInOutput,
  SolanaSignMessageResponse,

  // Adapters
  AdapterFn,
  PollarAdapter,
  PollarAdapters,
  AuthEntryAdapterStep,
  AuthEntryAdapterOutcome,

  // Stellar ownership proofs + SEP-43
  StellarSepApi,
  StellarMessageProof,
  Sep10SignParams,
  Sep10Proof,
  Sep43AuthEntrySigner,
  AuthEntrySignerOptions,

  // Swaps
  SwapQuoteParams,
  SwapQuote,
  SwapProvider,
  SwapVenue,
  SolanaSwapQuoteParams,
  SolanaSwapQuote,
  SolanaSwapVenue,

  // Earn (yield vaults + lending)
  EarnProviderId,
  EarnOpportunity,
  EarnPosition,
  EarnPositionParams,
  EarnTxParams,
  EarnWithdrawUnit,

  // Ramps
  RampDirection,
  RampRoutesResponse,
  RampQuoteRequest,
  RampQuotesResponse,
  RampQuote,
  RampQuoteLimit,
  RampOrderRequest,
  RampOrder,
  RampOrdersQuery,
  RampOrdersPage,
  RampSigningHandler,
  RampAdapter,

  // Cards
  CardProvider,
  CardHolder,
  CardInfo,
  CardBalance,
  CardFunding,
  CardFundingChain,
  CardFundingOutcome,
  CardSecrets,

  // KYC
  KycLevel,
  KycStatus,
  KycDecisionStatus,
  KycStatusContent,
  KycStartBody,
  KycStartResponse,

  // Requirement steps
  RampQuoteRequirement,
  AppRequirements,
  RequirementForm,
  RequirementFormAnswers,
  RequirementFormSubmitted,
  RegistryCheck,
  RegistryCheckEdit,
  RegistryCheckSubmitted,
  ProviderRegistration,
  ProviderRegistrationSubmitted,

  // Distribution
  DistributionRule,
  DistributionClaimBody,
  DistributionClaimContent,

  // Stellar
  StellarNetwork,
  StellarClientConfig,
  StellarBalance,
} from '@pollar/core';

// Runtime values (NOT type-only - `WalletType` is an enum and `RampChain` a frozen object, so they
// cannot be imported with `import type` and then used as `WalletType.FREIGHTER`).
import {
  WalletType,
  RampChain,
  POLLAR_CORE_VERSION,
  AUTH_ERROR_CODES,
  PollarNetworkError,
  isPollarNetworkError,
  PollarApiError,
  isPollarApiError,
  isPollarClient,
  WALLET_NOT_READY_CODE,
  isWalletNotReady,
  WALLET_REQUIRED_CODE,
  isWalletRequired,
  createAuthEntrySigner,
  isAuthEntryAdapterStep,
  completeAuthEntryStep,
  resolveLanguage,
  languageFromTag,
  localizedText,
  transactionErrorMessage,
  toBaseUnits,
  fromBaseUnits,
} from '@pollar/core';
```

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
