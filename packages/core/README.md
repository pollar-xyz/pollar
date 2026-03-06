# @pollar/core

Core SDK for [Pollar](https://pollar.xyz) — authentication and transaction utilities for Stellar-based applications.

## Installation

```bash
npm install @pollar/core
# or
pnpm add @pollar/core
# or
yarn add @pollar/core
```

## Overview

`@pollar/core` provides the `PollarClient` class and utilities to:

- Authenticate users via **Google**, **GitHub**, **Email (OTP)**, or **Stellar wallets** (Freighter, Albedo)
- Build and submit Stellar transactions
- Fetch Stellar account balances
- React to real-time authentication state changes

## Quick Start

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

| Option          | Type     | Required | Description                                        |
| --------------- | -------- | -------- | -------------------------------------------------- |
| `apiKey`        | `string` | Yes      | Your Pollar API key                                |
| `baseUrl`       | `string` | No       | Override the default API endpoint                  |
| `stellarNetwork`| `'mainnet' \| 'testnet'` | No | Target Stellar network (default: `testnet`) |

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

Submits the OTP code for email authentication. Use `clientSessionId` received from the `EMAIL_AUTH_START_SUCCESS` state event.

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