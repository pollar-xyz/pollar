# @pollar/react

React bindings for [Pollar](https://pollar.xyz) — drop-in authentication UI, transaction modals, and hooks for
Stellar-based applications.

> **0.7.0 is a breaking change.** The context's session is now `PollarPersistedSession | null` and PII has moved to
> `client.getUserProfile()`. Read the [CHANGELOG](../../CHANGELOG.md) before upgrading.

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
  return <PollarProvider config={{ apiKey: 'your-api-key' }}>{children}</PollarProvider>;
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
  config={{
    apiKey: 'your-api-key',
    baseUrl: 'https://sdk.api.pollar.xyz', // optional
    stellarNetwork: 'testnet', // optional, default: 'testnet'
    // 0.7.0 options threaded straight through to PollarClient:
    storage, // optional, RN apps inject this
    keyManager, // optional, autodetects on web
    walletAdapter, // optional, external wallet stack
    deviceLabel: 'iPhone — Safari', // optional, shown in SessionsModal
    onStorageDegrade, // optional, telemetry hook
  }}
  styles={
    {
      /* optional style overrides */
    }
  }
  adapters={
    {
      /* optional named adapter set */
    }
  }
>
  {children}
</PollarProvider>
```

| Prop       | Type                 | Required | Description                                                               |
| ---------- | -------------------- | -------- | ------------------------------------------------------------------------- |
| `config`   | `PollarClientConfig` | Yes      | Configuration passed verbatim to `PollarClient`                           |
| `styles`   | `PollarStyles`       | No       | Per-app style overrides; merged on top of `appConfig.styles` from the API |
| `adapters` | `PollarAdapters`     | No       | Named set of `PollarAdapter` objects (e.g. Trustless Work). See below     |

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

<PollarProvider config={{ apiKey }} adapters={{ trustlessWork }}>
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

Pass a `WalletAdapterResolver` to `config.walletAdapter` so Pollar can reach wallets that live outside `@pollar/core`:

```tsx
import { PollarProvider } from '@pollar/react';
import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

<PollarProvider
  config={{
    apiKey: 'your-api-key',
    walletAdapter: stellarWalletsKit({ network: Networks.PUBLIC }),
  }}
>
  {children}
</PollarProvider>;
```

Then any `login({ provider: 'wallet', type: '<kit wallet id>' })` is routed through the kit.

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
