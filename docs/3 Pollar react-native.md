# @pollar/react-native

React Native hooks and pre-built UI components for Pollar. Built on top of `@pollar/core`.

```bash
npm install @pollar/react-native @pollar/core
```

---

## `<PollarProvider>`

Wraps your application root. Required for all hooks and components to work. Internally renders the login, transaction, KYC, ramp, tx history, and wallet balance modals — you do not need to mount them manually.

```tsx
import { PollarProvider } from '@pollar/react-native';

<PollarProvider
  config={{ apiKey: 'pub_testnet_xxxxxxxxxxxxxxxxxxxx' }}
>
  <App />
</PollarProvider>
```

**Props:**

| Prop     | Type                 | Required | Description                                                         |
|----------|----------------------|----------|---------------------------------------------------------------------|
| `config` | `PollarClientConfig` | Yes      | Client configuration. See `@pollar/core` for all available options. |
| `styles` | `PollarStyles`       | No       | Style overrides applied on top of the remote configuration.         |

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
import { usePollar } from '@pollar/react-native';

function MyComponent() {
  const {
    isAuthenticated,
    walletAddress,
    login,
    logout,
    buildTx,
    signAndSubmitTx,
    transaction,
    txHistory,
    network,
    setNetwork,
    refreshBalance,
    getClient,
    openLoginModal,
    openTransactionModal,
    openKycModal,
    openRampWidget,
    openTxHistoryModal,
    openWalletBalanceModal,
    config,
    styles,
  } = usePollar();
}
```

---

### Authentication

| Property          | Type                                    | Description                                                               |
|-------------------|-----------------------------------------|---------------------------------------------------------------------------|
| `isAuthenticated` | `boolean`                               | Whether the user has an active session.                                   |
| `walletAddress`   | `string`                                | Public key of the authenticated wallet. Empty string if not authenticated. |
| `login`           | `(options: PollarLoginOptions) => void` | Initiates an authentication flow.                                         |
| `logout`          | `() => void`                            | Signs out the current user and clears the session.                        |

**`PollarLoginOptions`:**

| Value                                      | Description                                       |
|--------------------------------------------|---------------------------------------------------|
| `{ provider: 'google' }`                   | Opens Google OAuth flow.                          |
| `{ provider: 'github' }`                   | Opens GitHub OAuth flow.                          |
| `{ provider: 'email', email: string }`     | Sends an OTP code to the provided email address.  |
| `{ provider: 'wallet', type: WalletType }` | Connects a Stellar wallet (Freighter or Albedo).  |

---

### Transactions

| Property               | Type                                             | Description                                   |
|------------------------|--------------------------------------------------|-----------------------------------------------|
| `transaction`          | `TransactionState`                               | Current transaction state (reactive).         |
| `buildTx`              | `(operation, params, options?) => Promise<void>` | Builds an unsigned Stellar transaction.       |
| `signAndSubmitTx`      | `(unsignedXdr: string) => Promise<void>`         | Signs and submits the built transaction.      |
| `openTransactionModal` | `() => void`                                     | Opens the transaction modal programmatically. |

The transaction modal opens automatically when `buildTx` is called. See `@pollar/core` for `TransactionState` step details.

---

### Network

| Property     | Type                               | Description                           |
|--------------|------------------------------------|---------------------------------------|
| `network`    | `StellarNetwork`                   | Currently active network.             |
| `setNetwork` | `(network: StellarNetwork) => void` | Switches the active Stellar network. |

---

### Wallet Balance

| Property                 | Type                                                       | Description                                                                         |
|--------------------------|------------------------------------------------------------|-------------------------------------------------------------------------------------|
| `refreshBalance`         | `(publicKey?: string) => Promise<void>`                    | Fetches balances for the given public key. Uses the authenticated wallet if omitted. |
| `openWalletBalanceModal` | `() => void`                                               | Opens the wallet balance modal.                                                     |

---

### Transaction History

| Property            | Type             | Description                          |
|---------------------|------------------|--------------------------------------|
| `txHistory`         | `TxHistoryState` | Current tx history state (reactive). |
| `openTxHistoryModal` | `() => void`    | Opens the transaction history modal. |

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

| Property         | Type         | Description                        |
|------------------|--------------|------------------------------------|
| `openRampWidget` | `() => void` | Opens the fiat on/off-ramp widget. |

---

### Utilities

| Property    | Type                 | Description                                                            |
|-------------|----------------------|------------------------------------------------------------------------|
| `getClient` | `() => PollarClient` | Returns the underlying `PollarClient` instance for direct API access.  |
| `config`    | `PollarConfig`       | Application configuration fetched from the Pollar Dashboard.          |
| `styles`    | `PollarStyles`       | Resolved styles, merging remote config with any local overrides.       |

---

### Modal entry points

All Pollar modals are mounted inside `<PollarProvider>` and controlled programmatically:

| Function                  | Description                             |
|---------------------------|-----------------------------------------|
| `openLoginModal()`        | Opens the login modal.                  |
| `openTransactionModal()`  | Opens the transaction modal.            |
| `openKycModal(options?)`  | Opens the KYC modal.                    |
| `openRampWidget()`        | Opens the ramp widget.                  |
| `openTxHistoryModal()`    | Opens the transaction history modal.    |
| `openWalletBalanceModal()` | Opens the wallet balance modal.        |

---

## Components

### `<WalletButton>`

Pre-built button that handles the complete authentication flow. When logged out, opens the login modal. When logged in, shows the wallet address with a dropdown for balance, transaction history, and logout.

```tsx
import { WalletButton } from '@pollar/react-native';

<WalletButton />
```

No props required. Appearance is controlled by the `styles` configuration passed to `<PollarProvider>`.

---

### `<KycModal>`

Pre-built KYC verification modal. Can be rendered directly when you need more control than `openKycModal()` provides.

```tsx
import { KycModal } from '@pollar/react-native';

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

Displays the current KYC status for the authenticated user.

```tsx
import { KycStatus } from '@pollar/react-native';

<KycStatus status="approved" />
```

---

### `<RampWidget>`

Pre-built fiat on/off-ramp widget with support for on-ramp (fiat → crypto) and off-ramp (crypto → fiat) flows.

```tsx
import { RampWidget } from '@pollar/react-native';

<RampWidget onClose={() => setOpen(false)} />
```

| Prop      | Type         | Description                                              |
|-----------|--------------|----------------------------------------------------------|
| `onClose` | `() => void` | **Required.** Called when the user dismisses the widget. |

---

### `<WalletBalanceModal>`

Displays the token balances of the authenticated wallet with a manual refresh option.

```tsx
import { WalletBalanceModal } from '@pollar/react-native';

<WalletBalanceModal onClose={() => setOpen(false)} />
```

| Prop      | Type         | Description                                             |
|-----------|--------------|---------------------------------------------------------|
| `onClose` | `() => void` | **Required.** Called when the user dismisses the modal. |

---

## Template components

Template components handle rendering only — they receive all data and callbacks as props and contain no internal logic. Use them to build fully custom UI while reusing Pollar's layout and visual structure.

| Component                      | Description                                                  |
|--------------------------------|--------------------------------------------------------------|
| `<LoginModalTemplate>`         | Login provider selection and email OTP screens.              |
| `<KycModalTemplate>`           | KYC provider selection and verification screens.             |
| `<RampWidgetTemplate>`         | Ramp input, quote selection, and payment instruction screens.|
| `<TransactionModalTemplate>`   | Transaction details, signing, and result screens.            |
| `<TxHistoryModalTemplate>`     | Transaction history list screen.                             |
| `<WalletBalanceModalTemplate>` | Wallet balance screen.                                       |

Import the corresponding `*Props` type for full type safety:

```tsx
import {
  TransactionModalTemplate,
  type TransactionModalTemplateProps,
  WalletBalanceModalTemplate,
  type WalletBalanceModalTemplateProps,
} from '@pollar/react-native';
```

---

## Production Setup

### 1. Get your API key

Create an account at the [Pollar Dashboard](https://pollar.xyz) and generate a publishable API key for your application.

| Prefix            | Network | Usage                                    |
|-------------------|---------|------------------------------------------|
| `pub_testnet_`    | Testnet | Development and testing (safe to expose) |
| `pub_mainnet_`    | Mainnet | Production (safe to expose)              |

### 2. Configure your app

```tsx
<PollarProvider
  config={{
    apiKey: 'pub_testnet_xxxxxxxxxxxxxxxxxxxx',  // Replace with your key
    stellarNetwork: 'testnet',                    // 'testnet' for dev, 'mainnet' for prod
  }}
>
  <App />
</PollarProvider>
```

### 3. Switch to production

When ready for production, replace your key and network:

```tsx
<PollarProvider
  config={{
    apiKey: 'pub_mainnet_xxxxxxxxxxxxxxxxxxxx',
    stellarNetwork: 'mainnet',
  }}
>
  <App />
</PollarProvider>
```

The SDK automatically connects to the Pollar backend at `https://sdk.api.pollar.xyz` and fetches your application's remote configuration (enabled providers, styles, branding) from the Dashboard.

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
} from '@pollar/react-native';
```

Core types such as `TransactionState`, `TxHistoryState`, `WalletBalanceContent`, `PollarLoginOptions`, `StellarNetwork`, and `WalletType` are imported directly from `@pollar/core`.
