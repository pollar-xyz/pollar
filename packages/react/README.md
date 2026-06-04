# @pollar/react

React bindings for [Pollar](https://pollar.xyz) — drop-in authentication UI, transaction modals, and hooks for
Stellar-based applications.

> **0.8.0 reshapes `<PollarProvider>` props (breaking).** `config` → `client`
> (now accepts a `PollarClient` instance or a `PollarClientConfig`); `styles`
> moves under `appConfig.styles`; new `appConfig` prop is the opt-out switch
> for the remote `/applications/config` fetch (pass it — even `{}` — to skip
> the fetch); new `ui.renderWallets` slot replaces the default Freighter/Albedo
> picker. Read the [CHANGELOG](../../CHANGELOG.md) and
> [UPGRADE.md](../../UPGRADE.md) before upgrading.

## Installation

```bash
npm install @pollar/react @pollar/core
# or
pnpm add @pollar/react @pollar/core
# or
yarn add @pollar/react @pollar/core
```

**Peer dependencies:** `react >= 18`, `react-dom >= 18`. Node ≥ 20 in toolchains.

## Quick Start

Wrap your application with `PollarProvider` and use the `usePollar` hook anywhere in the tree.

```tsx
import { PollarProvider } from '@pollar/react';
import '@pollar/react/styles.css';

export default function App({ children }: { children: React.ReactNode }) {
  return <PollarProvider client={{ apiKey: 'your-api-key' }}>{children}</PollarProvider>;
}
```

```tsx
import { usePollar } from '@pollar/react';

export function Profile() {
  const { isAuthenticated, walletAddress, login, logout, getClient } = usePollar();

  if (!isAuthenticated) {
    return <button onClick={() => login({ provider: 'google' })}>Sign in with Google</button>;
  }

  // PII (email, name, avatar, providers) lives in memory only — fetch it from the client.
  const profile = getClient().getUserProfile();

  return (
    <div>
      <p>Wallet: {walletAddress}</p>
      <p>Email: {profile?.mail}</p>
      <button onClick={logout}>Sign out</button>
    </div>
  );
}
```

## API Reference

### `<PollarProvider>`

Context provider that initialises the Pollar client and makes it available to child components.

```tsx
<PollarProvider
  client={{
    apiKey: 'your-api-key',
    baseUrl: 'https://sdk.api.pollar.xyz', // optional
    stellarNetwork: 'testnet', // optional, default: 'testnet'
    storage, // optional, RN apps inject this
    keyManager, // optional, autodetects on web
    walletAdapter, // optional, external wallet stack
    deviceLabel: 'iPhone — Safari', // optional, shown in SessionsModal
    onStorageDegrade, // optional, telemetry hook
  }}
  // Optional: pass `appConfig` (even `{}`) to skip the remote
  // `/applications/config` fetch and use local-only styles/branding.
  appConfig={{
    styles: {
      /* optional style overrides */
    },
  }}
  ui={{
    // Optional: replace the default Freighter/Albedo wallet picker.
    // See "External wallet stacks" below for a kit-powered example.
    renderWallets: undefined,
  }}
  adapters={
    {
      /* optional named adapter set */
    }
  }
>
  {children}
</PollarProvider>
```

| Prop        | Type                                    | Required | Description                                                                                                                                                                                              |
| ----------- | --------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`    | `PollarClient \| PollarClientConfig`    | Yes      | Either a pre-built `PollarClient` (testing, reuse outside React) or a `PollarClientConfig` the provider will construct one from. **Locked at first render** — swapping after mount is ignored            |
| `appConfig` | `PollarConfig`                          | No       | Local override of `/applications/config`. **Presence is the opt-out switch**: pass it (even `{}`) and the remote fetch is skipped. Omit it to keep the existing remote-fetch-on-mount behaviour          |
| `ui`        | `{ renderWallets?: RenderWalletsSlot }` | No       | UI customisation slots. `renderWallets` replaces the default Freighter/Albedo buttons in `LoginModal`'s wallet picker. Receives `{ onConnect, authState }` and is expected to call `onConnect(walletId)` |
| `adapters`  | `PollarAdapters`                        | No       | Named set of `PollarAdapter` objects (e.g. Trustless Work). See below                                                                                                                                    |

> **Renamed in 0.8.0** — `config` → `client`, `styles` → `appConfig.styles`.
> If you were passing `styles={{ ... }}` directly, move it to
> `appConfig={{ styles: { ... } }}` (which also opts you out of the remote
> `/applications/config` fetch). See [UPGRADE.md](../../UPGRADE.md) for the
> full migration matrix.

---

### `usePollar()`

Returns the full Pollar context. Every modal opener returned here renders an already-wired modal — no extra mounting
needed.

```ts
const {
  // Session
  isAuthenticated, // boolean — true when a wallet public key is present
  walletAddress, // string — '' until authenticated
  walletType, // WalletId | null

  // Client escape hatch
  getClient, // () => PollarClient — for getUserProfile(), listSessions(), …

  // Auth
  login, // (options: PollarLoginOptions) => void
  logout, // () => void  (fire-and-forget; await getClient().logout() if you need the promise)
  openLoginModal, // () => void

  // Sessions (new in 0.7.0)
  openSessionsModal, // () => void

  // Transactions
  tx, // TransactionState
  buildTx, // (operation, params, options?) => Promise<void>
  signAndSubmitTx, // (unsignedXdr: string) => Promise<void>
  openTxModal, // () => void

  // Transaction history
  txHistory, // TxHistoryState
  openTxHistoryModal, // () => void

  // Wallet balance
  walletBalance, // WalletBalanceState
  refreshWalletBalance, // () => Promise<void>
  openWalletBalanceModal, // () => void

  // Send / Receive
  openSendModal, // () => void
  openReceiveModal, // () => void

  // Network
  network, // StellarNetwork — 'mainnet' | 'testnet'
  setNetwork, // (network: StellarNetwork) => void

  // KYC (UI ready — backend coming soon)
  openKycModal, // (options?: { country?, level?, onApproved? }) => void

  // Ramp (UI ready — backend coming soon)
  openRampModal, // () => void

  // App config / styles served by the Pollar API
  appConfig, // PollarConfig
  styles, // PollarStyles

  // Adapters (from PollarProvider props)
  adapters, // PollarAdapters | undefined
} = usePollar();
```

> **0.6.0 renames** — `transaction` → `tx`, `openTransactionModal` → `openTxModal`, `config` → `appConfig`,
> `openRampWidget` → `openRampModal`, `refreshBalance` → `refreshWalletBalance`. Existing code on 0.5.x must update.

#### Login options

```ts
// Social providers (opens a popup)
login({ provider: 'google' });
login({ provider: 'github' });

// Email OTP
login({ provider: 'email', email: 'user@example.com' });

// Built-in Stellar wallet adapters
import { WalletType } from '@pollar/core';
login({ provider: 'wallet', type: WalletType.FREIGHTER });
login({ provider: 'wallet', type: WalletType.ALBEDO });

// Any external adapter (e.g. Stellar Wallets Kit) when `walletAdapter` is set on config
login({ provider: 'wallet', type: 'xbull' });
login({ provider: 'wallet', type: 'lobstr' });
```

---

### Components

Every modal mounts itself when its `openXModal()` action is called. You don't need to render these directly — they're
already wired inside `<PollarProvider>` — but they're exported in case you want to mount them yourself.

| Component              | Purpose                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<WalletButton>`       | Drop-in button. Opens login when signed out; signed in, shows the wallet address with a dropdown (Send, Receive, balance, history, sign out). Inline arc spinner during in-progress transactions |
| `<SendModal>`          | Full send flow: asset picker, amount, destination, inline build → sign → success/error                                                                                                           |
| `<ReceiveModal>`       | Wallet address as QR code with copy-to-clipboard (no external QR dependency required)                                                                                                            |
| `<TxHistoryModal>`     | Paginated transaction history with auto-fetch on open and stellar.expert explorer links                                                                                                          |
| `<WalletBalanceModal>` | Stellar account balances with refresh button                                                                                                                                                     |
| `<SessionsModal>`      | **New in 0.7.0.** Lists every active refresh-token family for the current user with device metadata, marks the local session, per-row revoke, and a "Sign out everywhere" button                 |
| `<KycModal>`           | Identity verification flow — provider selection + status polling _(UI preview — backend coming soon)_                                                                                            |
| `<RampWidget>`         | Buy/sell crypto — direction tabs, route comparison, payment instructions _(UI preview — backend coming soon)_                                                                                    |

```tsx
import { WalletButton } from '@pollar/react';

export function Header() {
  return <WalletButton />;
}
```

---

### Template components

Every modal ships a pure presentational "template" companion — same name with a `Template` suffix. Use these when you
want to swap the chrome but keep the data wiring from `usePollar()`.

| Wrapper                 | Template                       |
| ----------------------- | ------------------------------ |
| `<WalletButton>`        | `<WalletButtonTemplate>`       |
| _(internal LoginModal)_ | `<LoginModalTemplate>`         |
| `<SendModal>`           | `<SendModalTemplate>`          |
| `<ReceiveModal>`        | `<ReceiveModalTemplate>`       |
| `<TransactionModal>`    | `<TransactionModalTemplate>`   |
| `<TxHistoryModal>`      | `<TxHistoryModalTemplate>`     |
| `<WalletBalanceModal>`  | `<WalletBalanceModalTemplate>` |
| `<KycModal>`            | `<KycModalTemplate>`           |
| `<RampWidget>`          | `<RampWidgetTemplate>`         |
| `<SessionsModal>`       | `<SessionsModalTemplate>`      |

`<TxStatusView>` is the shared status component (build → sign → success/error) reused by `TransactionModal` and
`SendModal`; it's exported on its own for consumers that want to embed the lifecycle elsewhere.

---

### Custom adapters

The `adapters` prop on `<PollarProvider>` accepts any named set of `PollarAdapter` objects. Each adapter function
receives params, returns an unsigned XDR, and Pollar handles signing and submission automatically.

```tsx
import type { PollarAdapter } from '@pollar/core';

const trustlessWork: PollarAdapter = {
  initialize: async (params) => ({ unsignedTransaction: '…' }),
  release: async (params) => ({ unsignedTransaction: '…' }),
};

<PollarProvider client={{ apiKey }} adapters={{ trustlessWork }}>
  …
</PollarProvider>;
```

> **Renamed in 0.7.0** — `EscrowFn` → `AdapterFn` and `EscrowAdapter` → `PollarAdapter`. Runtime contract is
> unchanged; rename your imports.

#### `createPollarAdapterHook(key)`

Factory that generates a fully-typed hook mirroring an adapter's API with automatic XDR signing built in:

```ts
import { createPollarAdapterHook } from '@pollar/react';

const useTrustlessWork = createPollarAdapterHook<typeof trustlessWork>('trustlessWork');

function MyComponent() {
  const tw = useTrustlessWork();
  await tw.initialize({
    /* … */
  }); // unsigned XDR is built, signed, and submitted automatically
}
```

---

### External wallet stacks (Stellar Wallets Kit, …)

Pass a `WalletAdapterResolver` to `client.walletAdapter` so Pollar can reach
wallets that live outside `@pollar/core`. The signing path alone (no UI
changes):

```tsx
import { PollarProvider } from '@pollar/react';
import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

<PollarProvider
  client={{
    apiKey: 'your-api-key',
    walletAdapter: stellarWalletsKit({ network: Networks.PUBLIC }),
  }}
>
  {children}
</PollarProvider>;
```

Then any `login({ provider: 'wallet', type: '<kit wallet id>' })` is routed
through the kit. The built-in `LoginModal` still shows only Freighter / Albedo
unless you also wire `ui.renderWallets` (next section).

#### Showing every kit wallet in `LoginModal`

The `ui.renderWallets` slot replaces the hardcoded Freighter+Albedo buttons.
`@pollar/stellar-wallets-kit-adapter/picker` ships a bundle that builds both
halves (signing + picker UI) from a single options object — drop both into
`<PollarProvider>` and the kit's full wallet list (xBull, Lobstr, Rabet, …)
renders in `LoginModal`:

```tsx
import { PollarProvider } from '@pollar/react';
import { createStellarWalletsKitBundle } from '@pollar/stellar-wallets-kit-adapter/picker';
import { Networks } from '@creit.tech/stellar-wallets-kit';

const bundle = createStellarWalletsKitBundle({
  network: Networks.PUBLIC,
  picker: { wallets: ['xbull', 'lobstr', 'freighter'] }, // subset, optional
});

<PollarProvider
  client={{ apiKey: 'your-api-key', walletAdapter: bundle.walletAdapter }}
  ui={{ renderWallets: bundle.renderWallets }}
>
  {children}
</PollarProvider>;
```

If you only want a custom picker (no kit), `renderWallets` is just a function
of `{ onConnect, authState }` — return whatever JSX you want and call
`onConnect(walletId)` when the user picks a wallet:

```tsx
ui={{
  renderWallets: ({ onConnect, authState }) => (
    <button disabled={authState.step !== 'idle'} onClick={() => onConnect('xbull')}>
      xBull
    </button>
  ),
}}
```

---

## Styles

Import the bundled stylesheet once in your application entry point:

```ts
import '@pollar/react/styles.css';
```

All class names are prefixed with `pollar-` to avoid conflicts.

---

## TypeScript

`@pollar/react` ships full type declarations. Key exported types:

```ts
import type {
  AuthProviderProps,
  AuthContextValue,
  LoginButtonProps,
  AuthModalProps,
  PollarConfig,
  PollarStyles,

  // 0.8.0 — wallet picker slot
  RenderWalletsProps,
  RenderWalletsSlot,

  // Template props
  SendModalTemplateProps,
  ReceiveModalTemplateProps,
  TransactionModalTemplateProps,
  TxStatusViewProps,
  WalletBalanceModalTemplateProps,
  SessionsModalTemplateProps,
  SessionsState,

  // Step unions
  KycStep,
  RampStep,
} from '@pollar/react';
```

The state types (`TransactionState`, `TxHistoryState`, `WalletBalanceState`, `NetworkState`, `AuthState`,
`PollarPersistedSession`, `PollarUserProfile`, `SessionInfo`, …) are re-exported from `@pollar/core`.

---

## License

MIT
