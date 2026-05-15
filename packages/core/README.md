# @pollar/core

Core SDK for [Pollar](https://pollar.xyz) — authentication and transaction utilities for Stellar-based applications.

> **0.7.0 ships sender-constrained tokens via DPoP (RFC 9449), pluggable storage and key managers, automatic
refresh-on-401, and removes PII from persisted storage.** This is a breaking change — read
> the [CHANGELOG](../../CHANGELOG.md) before upgrading. Requires HTTPS and
`sdk-api` ≥ Phase 5.

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
# Expo
npx expo install expo-secure-store react-native-get-random-values

# Bare React Native
npm i react-native-keychain react-native-get-random-values
```

## Overview

`@pollar/core` provides the `PollarClient` class and utilities to:

- Authenticate users via **Google**, **GitHub**, **Email (OTP)**, or **Stellar wallets** (Freighter, Albedo)
- Sign every authenticated request with **DPoP** (RFC 9449), making stolen tokens useless to an attacker without the
  per-session keypair
- Build and submit Stellar transactions
- Fetch Stellar account balances
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
// At your app entry — `crypto.getRandomValues` polyfill
import 'react-native-get-random-values';

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
import 'react-native-get-random-values';
import { PollarClient } from '@pollar/core';
import { createKeychainAdapter } from '@pollar/core/adapters/react-native-keychain';

const storage = await createKeychainAdapter();
const client = new PollarClient({ apiKey: 'your-api-key', storage });
```

## Preserved-on-disk storage shape

0.7.0 persists exactly:

```
clientSessionId, userId, status,
token { accessToken, refreshToken, expiresAt },
user { id?, ready },
wallet { publicKey, existsOnStellar?, createdAt? }
```

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
const profile = client.getUserProfile();   // PII (memory-only)
const sessions = await client.listSessions();
```

## API Reference

### `new PollarClient(config)`

| Option             | Type                     | Required | Description                                                                                              |
|--------------------|--------------------------|----------|----------------------------------------------------------------------------------------------------------|
| `apiKey`           | `string`                 | Yes      | Your Pollar API key                                                                                      |
| `baseUrl`          | `string`                 | No       | Override the default API endpoint                                                                        |
| `stellarNetwork`   | `'mainnet' \| 'testnet'` | No       | Target Stellar network (default: `testnet`)                                                              |
| `storage`          | `Storage`                | No       | Pluggable storage adapter. Web autodetects `localStorage` with in-memory fallback; RN must inject one    |
| `keyManager`       | `KeyManager`             | No       | Pluggable DPoP key manager. Web picks `WebCryptoKeyManager`; otherwise `NobleKeyManager`                  |
| `walletAdapter`    | `WalletAdapterResolver`  | No       | External wallet stack (e.g. Stellar Wallets Kit). Falls back to built-in `FreighterAdapter`/`AlbedoAdapter` |
| `deviceLabel`      | `string`                 | No       | UI-friendly device label sent at `/auth/login` time and shown in `listSessions()` rows                   |
| `onStorageDegrade` | `OnStorageDegrade`       | No       | Notified the first time `localStorage` falls back to in-memory mode (SSR, private browsing, quota, …)    |

---

### Authentication

#### `client.login(options)`

Initiates a login flow. Returns `{ cancelLogin }` to abort the flow at any point.

```ts
// Social providers
client.login({ provider: 'google' });
client.login({ provider: 'github' });

// Email OTP
client.login({ provider: 'email', email: 'user@example.com' });

// Stellar wallet
import { WalletType } from '@pollar/core';
client.login({ provider: 'wallet', type: WalletType.FREIGHTER });
client.login({ provider: 'wallet', type: WalletType.ALBEDO });
```

#### `client.verifyEmailCode(code)`

Submits the OTP code for email authentication. The active `clientSessionId` is tracked internally — no need to pass it.

#### `client.loginWallet(walletId)`

Lower-level entry point for wallet flows. Accepts any `WalletId` (`WalletType.FREIGHTER`, `WalletType.ALBEDO`, or an
opaque string id like `'xbull'` / `'lobstr'` resolved by `walletAdapter`).

#### `client.cancelLogin()`

Aborts any in-flight login flow and resets `authState` to `idle`. Safe to call from any step (including `error`).

#### `client.logout(options?): Promise<void>`

Server-side revokes the refresh-token family via `POST /v1/auth/logout`, then clears local storage and resets the
keypair. Server revocation is best-effort: a failed POST still clears local state.

```ts
await client.logout();                       // sign out this device
await client.logout({ everywhere: true });   // revoke every active session for this user
```

> Returns `Promise<void>` (was `void` pre-0.7.0). Existing fire-and-forget call sites keep working, but `await` it if
> you want to observe server-side revocation.

#### `client.logoutEverywhere(): Promise<void>`

Shorthand for `logout({ everywhere: true })`.

#### `client.isAuthenticated()`

Returns `true` if a valid session with a wallet public key is present.

#### `client.getUserProfile(): PollarUserProfile | null`

Returns the in-memory profile (`mail`, `first_name`, `last_name`, `avatar`, `providers`). `null` until `/auth/login`
completes. **This is the only way to read PII as of 0.7.0** — PII is no longer persisted to storage.

#### `client.ready(): Promise<void>`

Resolves once the keypair is initialized and any persisted session has been restored. Useful in tests and
server-side rendering.

#### `client.destroy(): void`

Detaches the cross-tab `storage` listener, aborts in-flight logins, and releases the keypair. Call this on unmount in
environments that re-instantiate `PollarClient`.

#### `client.refresh(): Promise<void>`

Forces an access-token refresh. Race-safe: concurrent calls coalesce into a single `/v1/auth/refresh` request.
Request middleware also calls this automatically on 401 with `DPoP-Nonce` rotation.

---

### Sessions

#### `client.listSessions(): Promise<SessionInfo[]>`

Returns one row per active refresh-token family for the authenticated user:

```ts
interface SessionInfo {
  familyId: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string;
  ipHash: string;
  deviceLabel?: string;
  expiresAt: string;
  current: boolean; // true for the family backing this client
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

#### `client.submitTx(signedXdr)`

Submits a signed XDR transaction to the network.

```ts
await client.submitTx(signedXdr);
```

---

### State

Each state domain has its own typed subscriber. All `on*StateChange` methods return an unsubscribe function.

```ts
const unsubAuth = client.onAuthStateChange((state) => {
  // state.step    — 'idle' | 'oauth' | 'email' | 'wallet' | 'success' | 'error'
  // state.session — PollarPersistedSession (when step === 'success')
  // state.errorCode — AuthErrorCode (when step === 'error')
});

const unsubTx       = client.onTransactionStateChange((s) => { /* build → sign → submit */ });
const unsubHistory  = client.onTxHistoryStateChange((s) => { /* paginated rows */ });
const unsubBalance  = client.onWalletBalanceStateChange((s) => { /* balances */ });
const unsubNetwork  = client.onNetworkStateChange((s) => { /* mainnet / testnet */ });

unsubAuth();
```

Snapshot getters are also available: `getAuthState()`, `getTransactionState()`, `getTxHistoryState()`,
`getWalletBalanceState()`, `getNetworkState()`.

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

Lightweight client to query Stellar account balances via Horizon.

```ts
import { StellarClient } from '@pollar/core';

const stellar = new StellarClient('testnet');
// or: new StellarClient({ horizonUrl: 'https://horizon.stellar.org' })

const result = await stellar.getBalances('GABC...');

if (result.success) {
  console.log(result.balances);
  // [{ asset: 'XLM', balance: '100.0000000' }, ...]
} else {
  console.error(result.errorCode); // 'ACCOUNT_NOT_FOUND' | 'HORIZON_ERROR' | 'NETWORK_ERROR'
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
  const { publicKey } = await adapter.connect();
}
```

To plug in external wallet stacks (e.g. Stellar Wallets Kit) without `@pollar/core` having to depend on them, pass a
`WalletAdapterResolver` to the client:

```ts
import { PollarClient, WalletType } from '@pollar/core';
import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

const client = new PollarClient({
  apiKey: 'pk_...',
  walletAdapter: stellarWalletsKit({ network: Networks.PUBLIC }),
});

client.loginWallet('xbull'); // any string id the kit understands
```

The resolver signature is:

```ts
type WalletAdapterResolver = (id: WalletId) => WalletAdapter | Promise<WalletAdapter>;
type WalletId = WalletType | (string & {});
```

---

### Custom adapters (`AdapterFn` / `PollarAdapter`)

Generic adapter contract for wrapping external signing flows (e.g. Trustless Work SDK). Adapter functions receive
params and return an unsigned XDR; the client handles signing and submission.

```ts
import type { AdapterFn, PollarAdapter, PollarAdapters } from '@pollar/core';

const trustlessWork: PollarAdapter = {
  initialize: (async (params) => ({ unsignedTransaction: '...' })) satisfies AdapterFn,
  release:    (async (params) => ({ unsignedTransaction: '...' })) satisfies AdapterFn,
};

const adapters: PollarAdapters = { trustlessWork };
```

> **Renamed in 0.7.0** — `EscrowFn` → `AdapterFn` and `EscrowAdapter` → `PollarAdapter`. Runtime contract is unchanged;
> rename your imports.

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
  AuthState,
  AuthErrorCode,

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
  WalletType,
  WalletId,
  WalletAdapter,
  WalletAdapterResolver,

  // Adapters (renamed from Escrow*)
  AdapterFn,
  PollarAdapter,
  PollarAdapters,

  // Stellar
  StellarNetwork,
  StellarClientConfig,
  StellarBalance,
} from '@pollar/core';

import { AUTH_ERROR_CODES } from '@pollar/core';
```

## License

MIT
