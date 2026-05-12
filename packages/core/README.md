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

## Original (0.6.x style) example

```ts
import { PollarClient } from '@pollar/core';

const client = new PollarClient({ apiKey: 'your-api-key' });

// Listen to state changes
client.onStateChange((entry) => {
  console.log(entry.var, entry.code, entry.status);
});

// Login with email
const { cancelLogin } = client.login({ provider: 'email', email: 'user@example.com' });

// Verify the OTP code sent to the user
await client.verifyEmailCode(clientSessionId, '123456');
```

## API Reference

### `new PollarClient(config)`

| Option           | Type                     | Required | Description                                 |
|------------------|--------------------------|----------|---------------------------------------------|
| `apiKey`         | `string`                 | Yes      | Your Pollar API key                         |
| `baseUrl`        | `string`                 | No       | Override the default API endpoint           |
| `stellarNetwork` | `'mainnet' \| 'testnet'` | No       | Target Stellar network (default: `testnet`) |

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

#### `client.verifyEmailCode(clientSessionId, code)`

Submits the OTP code for email authentication. Use `clientSessionId` received from the `EMAIL_AUTH_START_SUCCESS` state
event.

#### `client.logout()`

Clears the current session from memory and storage.

#### `client.isAuthenticated()`

Returns `true` if a valid session with a wallet public key is present.

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

#### `client.onStateChange(callback)`

Subscribe to state changes. Returns an unsubscribe function.

```ts
const unsubscribe = client.onStateChange((entry) => {
  // entry.var    — 'authentication' | 'transaction' | 'network'
  // entry.code   — granular event code (see STATE_VAR_CODES)
  // entry.status — 'NONE' | 'LOADING' | 'SUCCESS' | 'ERROR'
  // entry.data   — optional payload
  // entry.level  — 'info' | 'warn' | 'error'
  // entry.ts     — timestamp (ms)
});

// Unsubscribe
unsubscribe();
```

All state codes are available via `STATE_VAR_CODES`:

```ts
import { STATE_VAR_CODES } from '@pollar/core';

// STATE_VAR_CODES.authentication.EMAIL_AUTH_START_SUCCESS
// STATE_VAR_CODES.transaction.BUILD_TRANSACTION_SUCCESS
// STATE_VAR_CODES.network.NETWORK_UPDATED
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

## TypeScript

`@pollar/core` is written in TypeScript and ships full type declarations.

Key exported types:

```ts
import type {
  PollarClientConfig,
  PollarLoginOptions,
  PollarState,
  PollarStateEntry,
  StateAuthenticationCodes,
  StateTransactionCodes,
  StateNetworkCodes,
  StateVarCodes,
  StellarNetwork,
  StellarBalance,
  GetBalancesResult,
} from '@pollar/core';
```

## License

MIT
