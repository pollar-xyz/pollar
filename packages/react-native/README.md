# @pollar/react-native

React Native bindings for [Pollar](https://pollar.xyz): a context provider, a hook and pre-built modals for
authentication and transactions in Stellar mobile applications. Built on top of
[`@pollar/core`](../core/README.md).

## Installation

```bash
npm install @pollar/react-native @pollar/core
```

**Peer dependencies:** `@pollar/core ^0.11.3`, `react >= 18`, `react-native >= 0.72`.

Add the runtime polyfills and one storage backend:

```bash
# Expo (works in Expo Go)
npx expo install expo-secure-store react-native-get-random-values
npm i react-native-polyfill-globals

# Bare React Native
npm i react-native-keychain react-native-get-random-values react-native-polyfill-globals
```

## Setup

### 1. Polyfills

Every authenticated request carries a DPoP proof, which needs `crypto.getRandomValues`, `TextEncoder` and `URL`.
Hermes does not ship all of them. Import these at the very top of your entry file, before anything imports
`@pollar/core`:

```ts
import 'react-native-get-random-values';
import 'react-native-polyfill-globals/auto';
```

If one is missing, no authenticated request works. See the
[`@pollar/core` README](../core/README.md) for the details.

### 2. Storage

React Native has no `localStorage`. Without a storage adapter the session and the DPoP key live in memory, and the
user is logged out every time the app restarts (the SDK warns about it in the console). The adapters load their
native module lazily, so they are async: create the storage before you render the provider.

```tsx
import { PollarClientConfig } from '@pollar/core';
import { createSecureStoreAdapter } from '@pollar/core/adapters/expo';
// Bare React Native: import { createKeychainAdapter } from '@pollar/core/adapters/react-native-keychain';
import { PollarProvider } from '@pollar/react-native';
import { useEffect, useState } from 'react';

export default function App() {
  const [config, setConfig] = useState<PollarClientConfig | null>(null);

  useEffect(() => {
    createSecureStoreAdapter().then((storage) => setConfig({ apiKey: 'pub_testnet_xxxxxxxx', storage }));
  }, []);

  if (!config) return null;

  return (
    <PollarProvider config={config}>
      <MyApp />
    </PollarProvider>
  );
}
```

`config` is read once, on mount. To switch API keys, remount the provider (for example with `key={apiKey}`).

### 3. OAuth (Google, GitHub)

`window.open` does not exist on React Native, so pass an opener and your app's deep link. The SDK polls the auth
session until the backend marks it ready, so the opener only has to show the page:

```ts
import * as WebBrowser from 'expo-web-browser';

const config: PollarClientConfig = {
  apiKey: 'pub_testnet_xxxxxxxx',
  storage,
  oauthRedirectUri: 'myapp://auth',
  openAuthUrl: async ({ getUrl, redirectUri }) => {
    const url = await getUrl();
    if (url) await WebBrowser.openAuthSessionAsync(url, redirectUri);
  },
};
```

Add the same redirect URI to your application in the Pollar dashboard.

### 4. App state (optional)

To refresh the session as soon as the app returns to the foreground, pass an `AppState`-backed visibility provider:

```ts
import { createAppStateVisibilityProvider } from '@pollar/core/adapters/react-native-appstate';

const visibilityProvider = await createAppStateVisibilityProvider();
```

## `<PollarProvider>`

Creates the `PollarClient`, exposes it through `usePollar()` and mounts the login, transaction, KYC, ramp, transaction
history and wallet balance modals. You do not render the modals yourself.

| Prop       | Type                 | Required | Description                                                            |
| ---------- | -------------------- | -------- | ---------------------------------------------------------------------- |
| `config`   | `PollarClientConfig` | Yes      | Passed to `new PollarClient(config)`. Read once on mount.              |
| `styles`   | `PollarStyles`       | No       | Merged over the styles configured in the dashboard.                    |
| `adapters` | `PollarAdapters`     | No       | Custom transaction builders, used with `createPollarAdapterHook(key)`. |

## `usePollar()`

```ts
const {
  // session
  isAuthenticated, // boolean
  walletAddress, // string, '' when logged out
  walletType, // WalletId | null, the external wallet id when one is connected
  login, // (options: PollarLoginOptions) => void
  logout, // () => void
  getClient, // () => PollarClient

  // transactions
  transaction, // TransactionState
  buildTx, // (operation, params, options?) => Promise<BuildOutcome>
  signAndSubmitTx, // (unsignedXdr?: string) => Promise<SubmitOutcome>

  // balances and history
  walletBalance, // WalletBalanceState
  refreshBalance, // () => Promise<void>
  txHistory, // TxHistoryState

  // network and configuration
  network, // StellarNetwork
  setNetwork, // (network: StellarNetwork) => void
  config, // PollarConfig, the application config from the dashboard
  styles, // PollarStyles, the resolved styles

  // modals
  openLoginModal,
  openTransactionModal,
  openKycModal, // (options?: { country?, level?, onApproved? }) => void
  openRampWidget,
  openTxHistoryModal,
  openWalletBalanceModal,
} = usePollar();
```

`buildTx` opens the transaction modal automatically, and the user confirms from there.

### Login options

```ts
login({ provider: 'google' });
login({ provider: 'github' });
login({ provider: 'email', email: 'user@example.com' });
login({ provider: WalletType.FREIGHTER }); // import { WalletType } from '@pollar/core'
```

The login modal also offers Freighter and Albedo when the application enables them. `@pollar/core` ships those two
adapters for the web (browser extension and popup), so on a device they only work if you register adapters with
the same ids through `walletAdapters` in the client config.

## Components

- `<WalletButton>`: opens the login modal when logged out; when logged in, shows the address with a menu for
  balance, transaction history and logout.
- `<KycModal>`, `<KycStatus>`, `<RampWidget>`, `<RouteDisplay>`, `<WalletBalanceModal>`: the modals, for when you
  want to mount one yourself.
- `LoginModalTemplate`, `TransactionModalTemplate`, `KycModalTemplate`, `RampWidgetTemplate`,
  `TxHistoryModalTemplate`, `WalletBalanceModalTemplate`, `WalletButtonTemplate`: the presentational layer of each
  component, to build your own container around it.
- `createPollarAdapterHook(key)`: builds a typed hook over an adapter passed to `PollarProvider`. Each method builds
  the transaction and then signs and submits it.

Components are styled with `StyleSheet`; there is no stylesheet to import. Theme, accent color, logo and login
methods come from the dashboard and can be overridden with the `styles` prop.

## Developing in the monorepo

```bash
npm install
npx turbo build --filter=@pollar/react-native   # builds @pollar/core first
```

To try a local build in an app, publish both packages with [yalc](https://github.com/wclr/yalc)
(`yalc publish` in `packages/core` and `packages/react-native`, then `yalc add @pollar/core @pollar/react-native` in
the app) and restart Metro with `npm start -- -c`.

## License

Apache-2.0
