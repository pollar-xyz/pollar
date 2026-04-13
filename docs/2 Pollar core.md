# @pollar/core

Framework-agnostic TypeScript client for Pollar. Use this package directly if you are not using React, or to build custom integrations on top of the Pollar platform.

```bash
npm install @pollar/core
```

---

## `PollarClient`

```typescript
import { PollarClient } from '@pollar/core';

const pollar = new PollarClient({
  apiKey: 'pub_testnet_xxxxxxxxxxxxxxxxxxxx',
});
```

**Constructor options:**

| Option           | Type             | Default                          | Description                                                                |
|------------------|------------------|----------------------------------|----------------------------------------------------------------------------|
| `apiKey`         | `string`         | —                                | **Required.** Your Pollar publishable key.                                 |
| `stellarNetwork` | `StellarNetwork` | `'testnet'`                      | Target Stellar network: `'testnet'` or `'mainnet'`.                        |
| `baseUrl`        | `string`         | `'https://sdk.api.pollar.xyz'`   | Override the Pollar API base URL. Useful for self-hosted deployments.      |

---

## Authentication

Pollar supports four authentication providers: Google OAuth, GitHub OAuth, Email OTP, and external Stellar wallets (Freighter and Albedo). All flows update `AuthState`, which can be observed via `onAuthStateChange`.

---

### `pollar.login(options)`

Unified entry point for starting an authentication flow. For email, this initiates the session and sends the OTP code in a single call. For wallet providers, it connects and authenticates the wallet.

```typescript
// OAuth providers
pollar.login({ provider: 'google' });
pollar.login({ provider: 'github' });

// Email OTP (sends code automatically)
pollar.login({ provider: 'email', email: 'user@example.com' });

// External wallet
pollar.login({ provider: 'wallet', type: WalletType.FREIGHTER });
pollar.login({ provider: 'wallet', type: WalletType.ALBEDO });
```

| Option     | Type                                                     | Description                                   |
|------------|----------------------------------------------------------|-----------------------------------------------|
| `provider` | `'google' \| 'github' \| 'email' \| 'wallet'`           | Authentication provider.                      |
| `email`    | `string`                                                 | Required when `provider` is `'email'`.        |
| `type`     | `WalletType`                                             | Required when `provider` is `'wallet'`.       |

---

### Email OTP — step-by-step flow

For use cases that require manual control over each step of the email OTP flow (e.g. custom UI), the following methods are available individually:

#### `pollar.beginEmailLogin()`

Initializes a new email session. Transitions `AuthState` to `entering_email`.

```typescript
pollar.beginEmailLogin();
```

#### `pollar.sendEmailCode(email)`

Sends the OTP code to the provided email address. Must be called when `AuthState.step === 'entering_email'`.

```typescript
pollar.sendEmailCode('user@example.com');
```

#### `pollar.verifyEmailCode(code)`

Verifies the OTP code entered by the user and completes authentication. Must be called when `AuthState.step === 'entering_code'`.

```typescript
pollar.verifyEmailCode('123456');
```

---

### `pollar.loginWallet(type)`

Directly initiates a wallet connection and authentication flow. Equivalent to `login({ provider: 'wallet', type })`.

```typescript
import { WalletType } from '@pollar/core';

pollar.loginWallet(WalletType.FREIGHTER);
pollar.loginWallet(WalletType.ALBEDO);
```

| Parameter | Type         | Description                          |
|-----------|--------------|--------------------------------------|
| `type`    | `WalletType` | `WalletType.FREIGHTER` or `WalletType.ALBEDO`. |

---

### `pollar.cancelLogin()`

Cancels any in-progress authentication flow and resets `AuthState` to `idle`.

```typescript
pollar.cancelLogin();
```

---

### `pollar.logout()`

Signs out the current user, clears the session from storage, and resets all client state.

```typescript
pollar.logout();
```

---

### `pollar.getAuthState()`

Returns the current authentication state synchronously.

```typescript
const state = pollar.getAuthState();

if (state.step === 'authenticated') {
  console.log(state.session);
}
```

---

### `pollar.onAuthStateChange(callback)`

Subscribes to authentication state changes. The callback is invoked immediately with the current state, and on every subsequent change. Returns an unsubscribe function.

```typescript
const unsubscribe = pollar.onAuthStateChange((state) => {
  if (state.step === 'authenticated') {
    console.log('Logged in:', state.session);
  }
});

// Later:
unsubscribe();
```

**`AuthState` steps:**

| Step                    | Description                                              |
|-------------------------|----------------------------------------------------------|
| `idle`                  | No active session or flow.                               |
| `creating_session`      | Creating a client session on the server.                 |
| `entering_email`        | Waiting for the user to provide their email address.     |
| `sending_email`         | Sending the OTP code to the user's email.                |
| `entering_code`         | Waiting for the user to enter the OTP code.              |
| `verifying_email_code`  | Verifying the submitted OTP code.                        |
| `opening_oauth`         | Opening the OAuth provider window.                       |
| `connecting_wallet`     | Connecting to the external wallet extension.             |
| `wallet_not_installed`  | The requested wallet extension is not installed.         |
| `authenticating_wallet` | Authenticating with the connected wallet.                |
| `authenticating`        | Finalizing authentication with the Pollar server.        |
| `authenticated`         | User is authenticated. `session` is available.           |
| `error`                 | An error occurred. `message` and `errorCode` are set.    |

---

## Network

### `pollar.getNetwork()`

Returns the currently active Stellar network.

```typescript
const network = pollar.getNetwork(); // 'testnet' | 'mainnet'
```

---

### `pollar.setNetwork(network)`

Switches the active Stellar network.

```typescript
pollar.setNetwork('mainnet');
```

---

### `pollar.onNetworkStateChange(callback)`

Subscribes to network state changes. Returns an unsubscribe function.

```typescript
const unsubscribe = pollar.onNetworkStateChange((state) => {
  if (state.step === 'connected') {
    console.log('Network:', state.network);
  }
});
```

---

## Transactions

Pollar handles transaction building and signing through a state machine. Use `onTransactionStateChange` to observe progress in your UI.

### `pollar.buildTx(operation, params, options?)`

Builds an unsigned Stellar transaction on the server. Transitions `TransactionState` through `building` → `built` (or `error`).

```typescript
await pollar.buildTx('payment', {
  destination: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  amount: '10.00',
  asset: { type: 'credit_alphanum4', code: 'USDC', issuer: 'GABC...' },
});
```

| Parameter   | Type              | Description                              |
|-------------|-------------------|------------------------------------------|
| `operation` | `string`          | Stellar operation type (e.g. `payment`). |
| `params`    | `object`          | Operation-specific parameters.           |
| `options`   | `object`          | Optional build-time overrides.           |

---

### `pollar.signAndSubmitTx(unsignedXdr)`

Signs and submits a previously built transaction. For custodial wallets (social/email login), signing is performed server-side. For external wallets (Freighter/Albedo), signing is performed client-side and submitted directly to Horizon.

Must be called when `TransactionState.step === 'built'`.

```typescript
const state = pollar.getTransactionState();

if (state?.step === 'built') {
  await pollar.signAndSubmitTx(state.buildData.unsignedXdr);
}
```

---

### `pollar.getTransactionState()`

Returns the current transaction state synchronously, or `null` if no transaction is in progress.

```typescript
const state = pollar.getTransactionState();
```

---

### `pollar.onTransactionStateChange(callback)`

Subscribes to transaction state changes. Returns an unsubscribe function.

```typescript
const unsubscribe = pollar.onTransactionStateChange((state) => {
  if (state.step === 'success') {
    console.log('Transaction hash:', state.hash);
  }
});
```

**`TransactionState` steps:**

| Step       | Description                                              |
|------------|----------------------------------------------------------|
| `idle`     | No transaction in progress.                              |
| `building` | Building the transaction on the server.                  |
| `built`    | Transaction built. `buildData.unsignedXdr` is available. |
| `signing`  | Signing and submitting the transaction.                  |
| `success`  | Transaction confirmed. `hash` is available.              |
| `error`    | Transaction failed. `details` may contain the error.     |

---

## Wallet Balance

### `pollar.refreshBalance(publicKey?)`

Fetches the current balances for the given public key. If omitted, uses the authenticated wallet's public key.

```typescript
await pollar.refreshBalance();
```

---

### `pollar.getWalletBalanceState()`

Returns the current wallet balance state synchronously.

```typescript
const state = pollar.getWalletBalanceState();

if (state.step === 'loaded') {
  console.log(state.data.balances);
}
```

---

### `pollar.onWalletBalanceStateChange(callback)`

Subscribes to wallet balance state changes. Returns an unsubscribe function.

```typescript
const unsubscribe = pollar.onWalletBalanceStateChange((state) => {
  if (state.step === 'loaded') {
    console.log(state.data.balances);
  }
});
```

---

## Transaction History

### `pollar.fetchTxHistory(params?)`

Fetches paginated transaction history for the authenticated wallet.

```typescript
await pollar.fetchTxHistory({
  limit: 20,
  type: 'payment',
  asset: 'USDC',
});
```

| Option   | Type     | Default | Description                                                        |
|----------|----------|---------|--------------------------------------------------------------------|
| `limit`  | `number` | —       | Number of records to return.                                       |
| `cursor` | `string` | —       | Pagination cursor from a previous response.                        |
| `type`   | `string` | —       | Filter by transaction type: `payment`, `activation`, `trustline`, `receive`. |
| `asset`  | `string` | —       | Filter by asset code.                                              |

---

### `pollar.getTxHistoryState()`

Returns the current transaction history state synchronously.

```typescript
const state = pollar.getTxHistoryState();

if (state.step === 'loaded') {
  console.log(state.data.records);
}
```

---

### `pollar.onTxHistoryStateChange(callback)`

Subscribes to transaction history state changes. Returns an unsubscribe function.

```typescript
const unsubscribe = pollar.onTxHistoryStateChange((state) => {
  if (state.step === 'loaded') {
    console.log(state.data.records);
  }
});
```

---

## KYC

Pollar provides a KYC (Know Your Customer) flow that integrates with third-party identity verification providers.

### `pollar.getKycProviders(country)`

Returns the list of available KYC providers for the given country code.

```typescript
const providers = await pollar.getKycProviders('US');
```

---

### `pollar.getKycStatus(providerId?)`

Returns the current KYC status for the authenticated user. Optionally scoped to a specific provider.

```typescript
const status = await pollar.getKycStatus();
// 'none' | 'pending' | 'approved' | 'rejected'
```

---

### `pollar.startKyc(body)`

Initiates a KYC verification session with the specified provider.

```typescript
const session = await pollar.startKyc({
  providerId: 'provider_id',
  level: 'basic',
  redirectUrl: 'https://yourapp.com/kyc/callback',
});
```

---

### `pollar.resolveKyc(providerId, level?)`

Resolves the outcome of a completed KYC session.

```typescript
await pollar.resolveKyc('provider_id', 'basic');
```

---

### `pollar.pollKycStatus(providerId, opts?)`

Polls the KYC status until it reaches a terminal state (`approved` or `rejected`), or until the timeout is exceeded.

```typescript
const finalStatus = await pollar.pollKycStatus('provider_id', {
  intervalMs: 2000,
  timeoutMs: 60000,
});
```

| Option       | Type     | Description                               |
|--------------|----------|-------------------------------------------|
| `intervalMs` | `number` | Polling interval in milliseconds.         |
| `timeoutMs`  | `number` | Maximum wait time before throwing.        |

**`KycStatus` values:** `'none'` · `'pending'` · `'approved'` · `'rejected'`

**`KycLevel` values:** `'basic'` · `'intermediate'` · `'enhanced'`

---

## Ramps

Pollar supports on-ramp (fiat → crypto) and off-ramp (crypto → fiat) flows through integrated third-party providers.

### `pollar.getRampsQuote(query)`

Returns available quotes for a ramp operation.

```typescript
const quotes = await pollar.getRampsQuote({
  direction: 'onramp',
  fiatCurrency: 'USD',
  cryptoAsset: 'USDC',
  amount: '100',
});
```

---

### `pollar.createOnRamp(body)`

Creates an on-ramp transaction (fiat → crypto).

```typescript
const onramp = await pollar.createOnRamp({ ... });
console.log(onramp.paymentInstructions);
```

---

### `pollar.createOffRamp(body)`

Creates an off-ramp transaction (crypto → fiat).

```typescript
const offramp = await pollar.createOffRamp({ ... });
```

---

### `pollar.getRampTransaction(txId)`

Returns the current state of a ramp transaction by ID.

```typescript
const tx = await pollar.getRampTransaction('tx_id');
console.log(tx.status);
```

---

### `pollar.pollRampTransaction(txId, opts?)`

Polls a ramp transaction until it reaches a terminal status.

```typescript
const finalStatus = await pollar.pollRampTransaction('tx_id', {
  intervalMs: 3000,
  timeoutMs: 120000,
});
```

| Option       | Type     | Description                        |
|--------------|----------|------------------------------------|
| `intervalMs` | `number` | Polling interval in milliseconds.  |
| `timeoutMs`  | `number` | Maximum wait time before throwing. |

---

## App Config

### `pollar.getAppConfig()`

Returns the application configuration associated with your API key, as configured in the Pollar Dashboard.

```typescript
const config = await pollar.getAppConfig();
```

---

## Wallet Adapters

`@pollar/core` ships two ready-made wallet adapters and exports the `WalletAdapter` interface for building custom ones.

### `WalletAdapter` interface

| Method                              | Returns                          | Description                                         |
|-------------------------------------|----------------------------------|-----------------------------------------------------|
| `type`                              | `WalletType`                     | Wallet type identifier.                             |
| `isAvailable()`                     | `Promise<boolean>`               | Whether the wallet extension is installed.          |
| `connect()`                         | `Promise<ConnectWalletResponse>` | Connects the wallet and returns the public key.     |
| `disconnect()`                      | `Promise<void>`                  | Disconnects the wallet.                             |
| `getPublicKey()`                    | `Promise<string \| null>`        | Returns the current public key, or null.            |
| `signTransaction(xdr, options?)`    | `Promise<SignTransactionResponse>`| Signs a transaction XDR.                           |
| `signAuthEntry(entryXdr, options?)` | `Promise<SignAuthEntryResponse>` | Signs a Soroban auth entry.                         |

### `FreighterAdapter`

Implements `WalletAdapter` for the [Freighter](https://www.freighter.app/) browser extension.

```typescript
import { FreighterAdapter, WalletType } from '@pollar/core';

const adapter = new FreighterAdapter();
const available = await adapter.isAvailable();
```

### `AlbedoAdapter`

Implements `WalletAdapter` for [Albedo](https://albedo.link/) (popup/redirect flow, no extension required).

```typescript
import { AlbedoAdapter } from '@pollar/core';

const adapter = new AlbedoAdapter();
```

---

## `StellarClient`

Lightweight client for submitting signed transactions directly to the Stellar Horizon API.

```typescript
import { StellarClient } from '@pollar/core';

const stellar = new StellarClient({ network: 'testnet' });
const result = await stellar.submitTransaction(signedXdr);

if (result.success) {
  console.log('Hash:', result.hash);
} else {
  console.error('Error:', result.errorCode);
}
```

**Constructor options:**

| Option    | Type             | Description                                                    |
|-----------|------------------|----------------------------------------------------------------|
| `network` | `StellarNetwork` | `'testnet'` or `'mainnet'`. Also accepts a custom Horizon URL. |

---

## `isValidSession`

Utility that checks whether a session object is still valid (not expired).

```typescript
import { isValidSession } from '@pollar/core';

const valid = isValidSession(session);
```

---

## Custom Adapters

`PollarAdapters` is a generic record type that maps adapter names to `EscrowAdapter` instances. Adapters allow you to wrap external signing functions (e.g. Trustless Work SDK) and have Pollar handle signing and submission automatically.

```typescript
import type { EscrowFn, EscrowAdapter, PollarAdapters } from '@pollar/core';

// An EscrowFn receives params and returns an unsigned XDR string
const createEscrow: EscrowFn<{ amount: string; counterparty: string }> = async (params) => {
  const xdr = await trustlessWork.buildEscrow(params);
  return xdr; // unsigned XDR
};

const adapters: PollarAdapters = {
  escrow: { createEscrow },
};
```

Pass `adapters` to `<PollarProvider>` (React) or use them directly with `createPollarAdapterHook` from `@pollar/react`.

---

## Types

```typescript
import type {
  PollarClientConfig,
  PollarLoginOptions,
  AuthState,
  AuthErrorCode,
  NetworkState,
  TransactionState,
  TxBuildBody,
  TxBuildContent,
  TxSignAndSendBody,
  TxHistoryState,
  TxHistoryParams,
  TxHistoryRecord,
  WalletBalanceState,
  WalletBalanceRecord,
  WalletBalanceContent,
  KycLevel,
  KycStatus,
  KycFlow,
  KycProvider,
  KycStartBody,
  KycStartResponse,
  RampsQuoteQuery,
  RampQuote,
  RampsQuoteResponse,
  RampsOnrampBody,
  RampsOnrampResponse,
  RampsOfframpBody,
  RampsOfframpResponse,
  RampsTransactionResponse,
  RampTxStatus,
  RampDirection,
  PaymentInstructions,
  EscrowFn,
  EscrowAdapter,
  PollarAdapters,
  PollarFlowError,
} from '@pollar/core';

import { WalletType, FreighterAdapter, AlbedoAdapter, StellarClient, isValidSession } from '@pollar/core';
```