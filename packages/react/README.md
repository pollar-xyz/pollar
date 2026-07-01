# @pollar/react

React bindings for [Pollar](https://pollar.xyz) — drop-in authentication UI, transaction modals, and hooks for
Stellar-based applications.

> **0.10.0** requires `@pollar/core@^0.10.0`. Headline features: on-chain swaps
> via `<SwapModal>` + `usePollar().swap` / `getSwapQuote` / `openSwapModal`;
> live SEP-24 on/off-ramps through `<RampWidget>` (now wired to
> `client.createOnRamp` / `client.createOffRamp`); and a self-driving Privy
> adapter (registered interactive adapters are auto-driven to completion before
> `login({ provider })`). Read the [CHANGELOG](../../CHANGELOG.md) before
> upgrading.
>
> **0.8.0 reshapes `<PollarProvider>` props (breaking).** `config` > `client`
> (now accepts a `PollarClient` instance or a `PollarClientConfig`); `styles`
> moves under `appConfig.styles`; new `appConfig` prop is the opt-out switch
> for the remote `/applications/config` fetch (pass it - even `{}` - to skip
> the fetch). Read the [CHANGELOG](../../CHANGELOG.md) and
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
  const { isAuthenticated, wallet, login, logout, getClient } = usePollar();

  if (!isAuthenticated) {
    return <button onClick={() => login({ provider: 'google' })}>Sign in with Google</button>;
  }

  // PII (email, name, avatar, providers) lives in memory only - fetch it from the client.
  const profile = getClient().getUserProfile();

  return (
    <div>
      <p>Wallet: {wallet?.address}</p>
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
  adapters={
    {
      /* optional named adapter set */
    }
  }
>
  {children}
</PollarProvider>
```

| Prop        | Type                                 | Required | Description                                                                                                                                                                                     |
| ----------- | ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`    | `PollarClient \| PollarClientConfig` | Yes      | Either a pre-built `PollarClient` (testing, reuse outside React) or a `PollarClientConfig` the provider will construct one from. **Locked at first render** — swapping after mount is ignored   |
| `appConfig` | `PollarConfig`                       | No       | Local override of `/applications/config`. **Presence is the opt-out switch**: pass it (even `{}`) and the remote fetch is skipped. Omit it to keep the existing remote-fetch-on-mount behaviour |
| `adapters`  | `PollarAdapters`                     | No       | Named set of `PollarAdapter` objects (e.g. Trustless Work). See below                                                                                                                           |

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
  isAuthenticated, // boolean - true when a wallet address is present
  wallet, // WalletInfo | null - read wallet?.address for the on-chain address
  verified, // boolean - true once the server has confirmed the session

  // Client escape hatch
  getClient, // () => PollarClient - for getUserProfile(), listSessions(), …

  // Auth
  login, // (options: PollarLoginOptions) => void
  logout, // () => void  (fire-and-forget; await getClient().logout() if you need the promise)
  openLoginModal, // () => void

  // Sessions
  sessions, // SessionsState
  openSessionsModal, // () => void

  // Transactions
  tx, // TransactionState
  buildTx, // (operation, params, options?) => Promise<BuildOutcome>
  signAndSubmitTx, // (unsignedXdr?: string) => Promise<SubmitOutcome>  (custodial; XDR optional)
  signTx, // (unsignedXdr: string) => Promise<SignOutcome>  (external-wallet only)
  submitTx, // (signedXdr: string) => Promise<SubmitOutcome>
  buildAndSignAndSubmitTx, // (operation, params, options?) => Promise<SubmitOutcome>  (one-shot)
  runTx, // alias of buildAndSignAndSubmitTx
  openTxModal, // () => void

  // Transaction history
  txHistory, // TxHistoryState
  openTxHistoryModal, // () => void

  // Wallet balance
  walletBalance, // WalletBalanceState
  refreshWalletBalance, // () => Promise<void>
  openWalletBalanceModal, // () => void

  // Enabled assets / trustlines
  enabledAssets, // EnabledAssetsState
  refreshAssets, // () => Promise<void>
  setTrustline, // (asset, opts?) => Promise<TrustlineOutcome>
  openEnabledAssetsModal, // () => void

  // Swap (DEX/AMM)
  getSwapQuote, // (params: SwapQuoteParams) => Promise<SwapQuote[]>
  swap, // (quote: SwapQuote, opts?) => Promise<SubmitOutcome>
  openSwapModal, // () => void

  // Distribution rules
  openDistributionRulesModal, // () => void

  // Send / Receive
  openSendModal, // () => void
  openReceiveModal, // () => void

  // Network
  network, // StellarNetwork - 'mainnet' | 'testnet'
  setNetwork, // (network: StellarNetwork) => void

  // KYC (UI ready - backend coming soon)
  openKycModal, // (options?: { country?, level?, onApproved? }) => void

  // Ramp (SEP-24 on/off-ramps, wired through core)
  openRampModal, // () => void

  // App config / styles served by the Pollar API
  appConfig, // PollarConfig
  styles, // PollarStyles

  // Adapters (from PollarProvider props)
  adapters, // PollarAdapters | undefined
} = usePollar();
```

Custody is derived from `wallet`, not a separate field - e.g.
`wallet?.custody === 'external' ? wallet.provider : null`.

> **0.6.0 renames** - `transaction` > `tx`, `openTransactionModal` > `openTxModal`, `config` > `appConfig`,
> `openRampWidget` > `openRampModal`, `refreshBalance` > `refreshWalletBalance`. Existing code on 0.5.x must update.

#### Login options

```ts
// Social providers (opens a popup)
login({ provider: 'google' });
login({ provider: 'github' });

// Email OTP
login({ provider: 'email', email: 'user@example.com' });

// Built-in Stellar wallet adapters (the adapter's `type` IS the provider)
import { WalletType } from '@pollar/core';
login({ provider: WalletType.FREIGHTER }); // 'freighter-native'
login({ provider: WalletType.ALBEDO }); // 'albedo-native'

// Any external adapter (e.g. Stellar Wallets Kit) registered via `walletAdapters`
login({ provider: 'xbull' });
login({ provider: 'lobstr' });
```

#### Self-driving interactive adapters (Privy, …)

Registered adapters that opt into the interactive-auth contract
(`isInteractiveAuthAdapter` + `onProviderAuthChange`) are auto-driven by the
provider:

- `LoginModal` renders a login entry per registered wallet adapter, so each
  interactive provider gets its own button.
- Picking one opens `PrivyLoginSubmodal`, which drives the adapter's own login
  (email code / OAuth) to completion, then hands off to `login({ provider })`
  (which runs `connect()` + SEP-10).
- If the provider authenticates outside the sub-modal - after an OAuth redirect
  that reloaded the page, or a persisted provider session on load - the
  provider's `onProviderAuthChange` subscription fires `login({ provider })`
  automatically when Pollar has no session yet.

---

### Components

Every modal mounts itself when its `openXModal()` action is called. You don't need to render these directly — they're
already wired inside `<PollarProvider>` — but they're exported in case you want to mount them yourself.

| Component              | Purpose                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<WalletButton>`         | Drop-in button. Opens login when signed out; signed in, shows the wallet address with a dropdown (Send, Receive, copy address, balance, history, ramp, KYC, distribution rules, sessions, sign out). Inline arc spinner during in-progress transactions |
| `<SendModal>`            | Full send flow: asset picker, amount, destination, inline build > sign > success/error                                                                                                           |
| `<SwapModal>`            | On-chain asset-to-asset swap: pick from/to assets and amount, quote across venues, execute (auto-trustline on the buy asset when needed)                                                          |
| `<ReceiveModal>`         | Wallet address as QR code with copy-to-clipboard (no external QR dependency required)                                                                                                            |
| `<TxHistoryModal>`       | Paginated transaction history with auto-fetch on open and stellar.expert explorer links                                                                                                          |
| `<WalletBalanceModal>`   | Stellar account balances with refresh button                                                                                                                                                     |
| `<EnabledAssetsModal>`   | The application's dashboard-enabled assets with per-asset trustline state; establish/remove trustlines                                                                                            |
| `<DistributionRulesModal>` | Manage the wallet's distribution rules                                                                                                                                                         |
| `<SessionsModal>`        | **New in 0.7.0.** Lists every active refresh-token family for the current user with device metadata, marks the local session, per-row revoke, and a "Sign out everywhere" button                 |
| `<KycModal>`             | Identity verification flow - provider selection + status polling _(UI preview - backend coming soon)_                                                                                            |
| `<RampWidget>`           | Buy/sell crypto via SEP-24 - direction tabs, route comparison, payment instructions (wired to `client.createOnRamp` / `client.createOffRamp`)                                                     |

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
| `<SwapModal>`           | `<SwapModalTemplate>`          |
| `<ReceiveModal>`        | `<ReceiveModalTemplate>`       |
| `<TransactionModal>`    | `<TransactionModalTemplate>`   |
| `<TxHistoryModal>`      | `<TxHistoryModalTemplate>`     |
| `<WalletBalanceModal>`  | `<WalletBalanceModalTemplate>` |
| `<EnabledAssetsModal>`  | `<EnabledAssetsModalTemplate>` |
| `<DistributionRulesModal>` | `<DistributionRulesModalTemplate>` |
| `<KycModal>`            | `<KycModalTemplate>`           |
| `<RampWidget>`          | `<RampWidgetTemplate>`         |
| `<SessionsModal>`       | `<SessionsModalTemplate>`      |

`<TxStatusView>` is the shared status component (build → sign → success/error) reused by `TransactionModal` and
`SendModal`; it's exported on its own for consumers that want to embed the lifecycle elsewhere.

> **0.8.1** — `onWalletConnect` is now **optional** on `<LoginModalTemplate>` (defaults to a no-op).

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

Register adapters for wallets that live outside `@pollar/core` by passing a
`walletAdapters: WalletAdapter[]` array. `LoginModal` auto-renders one button per
registered adapter, and each is reachable via `login({ provider: adapter.type })`.
`stellarWalletsKitAdapters()` returns that array (one adapter per kit module):

```tsx
import { PollarProvider } from '@pollar/react';
import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

<PollarProvider
  client={{
    apiKey: 'your-api-key',
    walletAdapters: stellarWalletsKitAdapters({
      network: Networks.PUBLIC,
      picker: { wallets: ['xbull', 'lobstr', 'freighter'] }, // subset, optional
    }),
  }}
>
  {children}
</PollarProvider>;
```

Each adapter's `meta.group` controls placement: adapters sharing a group label
collapse behind one gateway button (the kit wallets default to `'Wallet'`),
while adapters with no group — e.g. Privy — render as their own button in the
root view. Pass `picker.groupLabel` to give the kit wallets a distinct gateway.

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
  LoginButtonProps,
  AuthModalProps,
  PollarConfig,
  PollarStyles,

  // Custom-provider contracts (re-exported from @pollar/core)
  PollarAuthProvider,
  AuthProviderContext,

  // Template props
  WalletButtonTemplateProps,
  SendModalTemplateProps,
  SwapModalTemplateProps,
  SwapAssetOption,
  ReceiveModalTemplateProps,
  TransactionModalTemplateProps,
  TxStatusViewProps,
  WalletBalanceModalTemplateProps,
  EnabledAssetsModalTemplateProps,
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
