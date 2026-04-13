# @pollar/react

React hooks and pre-built UI components for Pollar. Built on top of `@pollar/core`.

```bash
npm install @pollar/react
```

---

## `<PollarProvider>`

Wraps your application root. Required for all hooks and components to work. Internally renders the login, transaction, KYC, ramp, tx history, wallet balance, send, and receive modals — you do not need to mount them manually.

```tsx
import { PollarProvider } from '@pollar/react';

<PollarProvider
  config={{ apiKey: 'pub_testnet_xxxxxxxxxxxxxxxxxxxx' }}
>
  <App />
</PollarProvider>
```

**Props:**

| Prop       | Type                 | Required | Description                                                                      |
|------------|----------------------|----------|----------------------------------------------------------------------------------|
| `config`   | `PollarClientConfig` | Yes      | Client configuration. See `@pollar/core` for all available options.              |
| `styles`   | `PollarStyles`       | No       | Style overrides applied on top of the remote configuration.                      |
| `adapters` | `PollarAdapters`     | No       | Custom adapter functions for extending transaction flows (e.g. escrow). The provider uses a ref internally so passing an unstable reference does not cause unnecessary re-renders. |

**`PollarClientConfig`:**

| Option           | Type             | Default                        | Description                                 |
|------------------|------------------|--------------------------------|---------------------------------------------|
| `apiKey`         | `string`         | —                              | **Required.** Your Pollar API key.          |
| `stellarNetwork` | `StellarNetwork` | `'testnet'`                    | Target network: `'testnet'` or `'mainnet'`. |
| `baseUrl`        | `string`         | `'https://sdk.api.pollar.xyz'` | Override the Pollar API base URL.           |

---

## `usePollar()`

The primary hook. Provides access to all Pollar functionality from a single import. Must be used inside `<PollarProvider>`.

```tsx
'use client';
import { usePollar } from '@pollar/react';

function MyComponent() {
  const {
    isAuthenticated,
    walletAddress,
    login,
    logout,
    buildTx,
    signAndSubmitTx,
    tx,
    txHistory,
    network,
    setNetwork,
    walletBalance,
    refreshWalletBalance,
    getClient,
    openLoginModal,
    openTxModal,
    openKycModal,
    openRampModal,
    openTxHistoryModal,
    openWalletBalanceModal,
    openSendModal,
    openReceiveModal,
    appConfig,
    styles,
    adapters,
  } = usePollar();
}
```

---

### Authentication

| Property          | Type                                    | Description                                                                |
|-------------------|-----------------------------------------|----------------------------------------------------------------------------|
| `isAuthenticated` | `boolean`                               | Whether the user has an active session.                                    |
| `walletAddress`   | `string`                                | Public key of the authenticated wallet. Empty string if not authenticated. |
| `login`           | `(options: PollarLoginOptions) => void` | Initiates an authentication flow.                                          |
| `logout`          | `() => void`                            | Signs out the current user and clears the session.                         |

**`PollarLoginOptions`:**

| Value                                      | Description                                       |
|--------------------------------------------|---------------------------------------------------|
| `{ provider: 'google' }`                   | Opens Google OAuth flow.                          |
| `{ provider: 'github' }`                   | Opens GitHub OAuth flow.                          |
| `{ provider: 'email', email: string }`     | Sends an OTP code to the provided email address.  |
| `{ provider: 'wallet', type: WalletType }` | Connects a Stellar wallet (Freighter or Albedo).  |

---

### Transactions

| Property          | Type                                             | Description                                                                 |
|-------------------|--------------------------------------------------|-----------------------------------------------------------------------------|
| `tx`              | `TransactionState`                               | Current transaction state (reactive).                                       |
| `buildTx`         | `(operation, params, options?) => Promise<void>` | Builds an unsigned Stellar transaction.                                     |
| `signAndSubmitTx` | `(unsignedXdr: string) => Promise<void>`         | Signs and submits the built transaction.                                    |
| `openTxModal`     | `() => void`                                     | Opens the transaction modal programmatically.                               |

The transaction modal does **not** open automatically — call `openTxModal()` explicitly when needed. See `@pollar/core` for `TransactionState` step details.

---

### Network

| Property     | Type                                | Description                            |
|--------------|-------------------------------------|----------------------------------------|
| `network`    | `StellarNetwork`                    | Currently active network.              |
| `setNetwork` | `(network: StellarNetwork) => void` | Switches the active Stellar network.   |

---

### Wallet Balance

| Property              | Type                        | Description                                                                         |
|-----------------------|-----------------------------|-------------------------------------------------------------------------------------|
| `walletBalance`       | `WalletBalanceState`        | Current wallet balance state (reactive).                                            |
| `refreshWalletBalance`| `() => Promise<void>`       | Fetches balances for the authenticated wallet. Wrapped in `useCallback` — safe to use in `useEffect` dependency arrays. |
| `openWalletBalanceModal` | `() => void`             | Opens the wallet balance modal.                                                     |

---

### Transaction History

| Property             | Type             | Description                          |
|----------------------|------------------|--------------------------------------|
| `txHistory`          | `TxHistoryState` | Current tx history state (reactive). |
| `openTxHistoryModal` | `() => void`     | Opens the transaction history modal. |

---

### KYC

| Property       | Type                                                                                  | Description                       |
|----------------|---------------------------------------------------------------------------------------|-----------------------------------|
| `openKycModal` | `(options?: { country?: string; level?: KycLevel; onApproved?: () => void }) => void` | Opens the KYC verification modal. |

| Option       | Type         | Default   | Description                                                           |
|--------------|--------------|-----------|-----------------------------------------------------------------------|
| `country`    | `string`     | `'MX'`    | ISO 3166-1 alpha-2 country code to filter providers.                  |
| `level`      | `KycLevel`   | `'basic'` | Required KYC level: `'basic'`, `'intermediate'`, or `'enhanced'`.    |
| `onApproved` | `() => void` | —         | Callback invoked when the KYC verification is successfully approved.  |

---

### Ramps

| Property        | Type         | Description                        |
|-----------------|--------------|------------------------------------|
| `openRampModal` | `() => void` | Opens the fiat on/off-ramp widget. |

---

### Send & Receive

| Property           | Type         | Description                  |
|--------------------|--------------|------------------------------|
| `openSendModal`    | `() => void` | Opens the send modal.        |
| `openReceiveModal` | `() => void` | Opens the receive modal.     |

---

### Utilities

| Property               | Type                          | Description                                                                                            |
|------------------------|-------------------------------|--------------------------------------------------------------------------------------------------------|
| `getClient`            | `() => PollarClient`          | Returns the underlying `PollarClient` instance. Wrapped in `useCallback` — safe in `useEffect` deps.   |
| `appConfig`            | `PollarConfig`                | Application configuration fetched from the Pollar Dashboard.                                           |
| `styles`               | `PollarStyles`                | Resolved styles, merging remote config with any local overrides.                                       |
| `adapters`             | `PollarAdapters \| undefined` | Custom adapters passed to `<PollarProvider>`.                                                          |

---

### Modal entry points

All Pollar modals are mounted inside `<PollarProvider>` and controlled programmatically:

| Function                   | Description                             |
|----------------------------|-----------------------------------------|
| `openLoginModal()`         | Opens the login modal.                  |
| `openTxModal()`            | Opens the transaction modal.            |
| `openKycModal(options?)`   | Opens the KYC modal.                    |
| `openRampModal()`          | Opens the ramp widget.                  |
| `openTxHistoryModal()`     | Opens the transaction history modal.    |
| `openWalletBalanceModal()` | Opens the wallet balance modal.         |
| `openSendModal()`          | Opens the send modal.                   |
| `openReceiveModal()`       | Opens the receive modal.                |

---

## Components

### `<WalletButton>`

Pre-built button that handles the complete authentication flow. When logged out, opens the login modal. When logged in, shows the wallet address with a dropdown for Send, Receive, balance, transaction history, and logout. An inline spinner appears to the right of the address during in-progress transactions without affecting the button layout.

```tsx
import { WalletButton } from '@pollar/react';

<WalletButton />
```

No props required. Appearance is controlled by the `styles` configuration passed to `<PollarProvider>`.

---

### `<SendModal>`

Full send flow in a single modal. Handles asset selection (app-enabled assets listed first, then any asset with a non-zero balance), amount input with available balance hint, destination address, and inline transaction status (build → sign → success/error) without opening a secondary modal.

```tsx
import { SendModal } from '@pollar/react';

<SendModal onClose={() => setOpen(false)} />
```

| Prop      | Type         | Description                                              |
|-----------|--------------|----------------------------------------------------------|
| `onClose` | `() => void` | **Required.** Called when the user dismisses the modal.  |

---

### `<ReceiveModal>`

Displays the connected wallet address as a QR code with copy-to-clipboard support. No external QR library required — `qr.js` is bundled internally.

```tsx
import { ReceiveModal } from '@pollar/react';

<ReceiveModal onClose={() => setOpen(false)} />
```

| Prop      | Type         | Description                                              |
|-----------|--------------|----------------------------------------------------------|
| `onClose` | `() => void` | **Required.** Called when the user dismisses the modal.  |

---

### `<KycModal>`

Pre-built KYC verification modal. Can be rendered directly when you need more control than `openKycModal()` provides.

```tsx
import { KycModal } from '@pollar/react';

<KycModal
  onClose={() => setOpen(false)}
  country="US"
  level="basic"
  onApproved={() => console.log('KYC approved')}
/>
```

| Prop         | Type         | Default   | Description                                             |
|--------------|--------------|-----------|---------------------------------------------------------|
| `onClose`    | `() => void` | —         | **Required.** Called when the user dismisses the modal. |
| `country`    | `string`     | `'MX'`    | ISO 3166-1 alpha-2 country code to filter providers.    |
| `level`      | `KycLevel`   | `'basic'` | Required KYC level.                                     |
| `onApproved` | `() => void` | —         | Called when KYC is successfully approved.               |

---

### `<KycStatus>`

Displays the current KYC status as a styled badge.

```tsx
import { KycStatus } from '@pollar/react';

<KycStatus status="approved" />
```

| Prop        | Type             | Description                                      |
|-------------|------------------|--------------------------------------------------|
| `status`    | `KycStatusValue` | **Required.** `'none'`, `'pending'`, `'approved'`, or `'rejected'`. |
| `className` | `string`         | Optional additional CSS class.                   |

---

### `<RampWidget>`

Pre-built fiat on/off-ramp widget with support for on-ramp (fiat → crypto) and off-ramp (crypto → fiat) flows.

```tsx
import { RampWidget } from '@pollar/react';

<RampWidget onClose={() => setOpen(false)} />
```

| Prop      | Type         | Description                                              |
|-----------|--------------|----------------------------------------------------------|
| `onClose` | `() => void` | **Required.** Called when the user dismisses the widget. |

---

### `<WalletBalanceModal>`

Displays the token balances of the authenticated wallet with a manual refresh option.

```tsx
import { WalletBalanceModal } from '@pollar/react';

<WalletBalanceModal onClose={() => setOpen(false)} />
```

| Prop      | Type         | Description                                             |
|-----------|--------------|---------------------------------------------------------|
| `onClose` | `() => void` | **Required.** Called when the user dismisses the modal. |

---

## Template components

Template components handle rendering only — they receive all data and callbacks as props and contain no internal logic. Use them to build fully custom UI while reusing Pollar's layout and visual structure.

| Component                      | Description                                                   |
|--------------------------------|---------------------------------------------------------------|
| `<LoginModalTemplate>`         | Login provider selection and email OTP screens.               |
| `<KycModalTemplate>`           | KYC provider selection and verification screens.              |
| `<RampWidgetTemplate>`         | Ramp input, quote selection, and payment instruction screens. |
| `<TransactionModalTemplate>`   | Transaction details, signing, and result screens.             |
| `<TxHistoryModalTemplate>`     | Transaction history list screen.                              |
| `<WalletBalanceModalTemplate>` | Wallet balance screen.                                        |
| `<WalletButtonTemplate>`       | Wallet button and dropdown rendering.                         |
| `<SendModalTemplate>`          | Send form and inline transaction status screens.              |
| `<ReceiveModalTemplate>`       | QR code and copy address screen.                              |
| `<TxStatusView>`               | Shared transaction status component (build/sign/success/error lifecycle). Reused by `SendModal` and `TransactionModal`. |

Import the corresponding `*Props` type for full type safety:

```tsx
import {
  TransactionModalTemplate,
  type TransactionModalTemplateProps,
  WalletBalanceModalTemplate,
  type WalletBalanceModalTemplateProps,
  SendModalTemplate,
  type SendModalTemplateProps,
  ReceiveModalTemplate,
  type ReceiveModalTemplateProps,
  TxStatusView,
  type TxStatusViewProps,
} from '@pollar/react';
```

---

## `createPollarAdapterHook`

Factory function that generates a fully-typed hook wrapping a named adapter from `<PollarProvider>`. The generated hook mirrors the adapter's API and automatically handles XDR signing and submission via `signAndSubmitTx`.

```tsx
import { createPollarAdapterHook } from '@pollar/react';
import type { EscrowAdapter } from '@pollar/core';

// Define once — outside your component
const usePollarEscrow = createPollarAdapterHook<EscrowAdapter>('escrow');

function MyComponent() {
  const escrow = usePollarEscrow();

  async function handleCreateEscrow() {
    await escrow.createEscrow({ amount: '100', asset: 'USDC', counterparty: 'G...' });
  }
}
```

Pass the adapter to `<PollarProvider>`:

```tsx
import { trustlessWorkEscrow } from './adapters/escrow';

<PollarProvider
  config={{ apiKey: '...' }}
  adapters={{ escrow: trustlessWorkEscrow }}
>
  <App />
</PollarProvider>
```

Each adapter function receives its params and must return an unsigned XDR string. Pollar then signs and submits it automatically.

---

## Types

```typescript
import type {
  PollarConfig,
  PollarStyles,
  AuthProviderProps,
  AuthContextValue,
  LoginButtonProps,
  AuthModalProps,
  KycStep,
  RampStep,
  TransactionModalTemplateProps,
  WalletBalanceModalTemplateProps,
  SendModalTemplateProps,
  ReceiveModalTemplateProps,
  TxStatusViewProps,
} from '@pollar/react';
```

Core types such as `TransactionState`, `TxHistoryState`, `WalletBalanceState`, `PollarLoginOptions`, `StellarNetwork`, `WalletType`, `EscrowFn`, `EscrowAdapter`, and `PollarAdapters` are imported directly from `@pollar/core`.