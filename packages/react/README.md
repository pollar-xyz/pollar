# @pollar/react

React bindings for [Pollar](https://pollar.xyz) — drop-in authentication UI, transaction modals, and hooks for
Stellar and Solana applications.

> **0.11.1** requires `@pollar/core@^0.11.1`. Headline feature: a **network
> picker** (`<ChainSelect>`) across the wallet-balance, enabled-assets, send and
> receive modals - each scopes its rows to the selected chain instead of tagging
> every row, and the filter is local (the backend returns every chain in one
> payload, so switching networks costs no request). Balances now format against
> each token's own `decimals`, and a `null` balance renders as a dash rather than
> as `0`, because `null` means the chain could not be read. The login modal shows
> loading / error state when the app config fails to load. See the
> [CHANGELOG](../../CHANGELOG.md) and [UPGRADE.md](../../UPGRADE.md) for the full
> version history before upgrading.

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
    baseUrl: 'https://sdk.api.pollar.xyz', // optional, origin only — the SDK appends /v2
    stellarNetwork: 'testnet', // optional, default: 'testnet'
    storage, // optional, RN apps inject this
    keyManager, // optional, autodetects on web
    walletAdapters, // optional, WalletAdapter[] — external wallet stacks
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

---

### `usePollar()`

Returns the full Pollar context. Every modal opener returned here renders an already-wired modal — no extra mounting
needed.

```ts
const {
  // Session
  isAuthenticated, // boolean - true when a wallet address is present
  wallet, // WalletInfo | null - read wallet?.address for the on-chain address
  wallets, // WalletInfo[] - every wallet the user holds, one per chain. To drive
  //          a network picker, prefer the useChains() hook (below) over reading
  //          this directly - it applies the app's configured chain order
  verified, // boolean - true once the server has confirmed the session

  // App config (the remote /config fetch behind the login modal)
  configStatus, // 'loading' | 'ready' | 'error'
  retryConfig, // () => void - re-runs the fetch after an error

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
  sendPayment, // (params: SendPaymentParams) => Promise<SubmitOutcome>
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
  setTrustline, // (asset, opts?: { limit?, skipSponsorship? }) => Promise<TrustlineOutcome>  (sponsorship decided server-side)
  openEnabledAssetsModal, // () => void

  // Swap (DEX/AMM)
  getSwapQuote, // (params: SwapQuoteParams) => Promise<SwapQuote[]>
  swap, // (quote: SwapQuote, opts?) => Promise<SubmitOutcome>
  getSwapConfig, // () => Promise<SwapVenue[]>  (which venues this app offers)
  getSwapTokens, // () => Promise<SwapToken[]>
  openSwapModal, // () => void

  // Earn (yield vaults + lending — DeFindex + Blend)
  getEarnProviders, // () => Promise<EarnProviderId[]>  ([] means Earn is disabled)
  getEarnOpportunities, // (provider: EarnProviderId) => Promise<EarnOpportunity[]>
  getEarnPosition, // (params: EarnPositionParams) => Promise<EarnPosition>
  earnDeposit, // (params: EarnTxParams) => Promise<SubmitOutcome>
  earnWithdraw, // (params: EarnTxParams) => Promise<SubmitOutcome>
  openEarnModal, // () => void

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

#### When the app config fails to load

The login modal is gated on the remote app-config fetch. While it runs the modal shows a spinner; if it fails, it shows
"Could not load sign-in options. Check your connection and try again." plus a **Try again** button wired to
`retryConfig()`. Both states are readable from `usePollar().configStatus` (`'loading' | 'ready' | 'error'`) if you are
driving `<LoginModalTemplate>` yourself. Passing `appConfig` to `<PollarProvider>` opts out of the fetch entirely, so
neither state can occur.

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

### `useChains()`

The single source of truth for "which chains, in what order, and which address to
show". Every built-in component (`<WalletButton>`, the network pickers) reads from
it, so they can never disagree about which chain leads. Use it when you build your
own wallet button or picker instead of calling `chainsOf(wallets)` yourself —
`chainsOf` alone cannot know the app's configured order.

```ts
import { useChains } from '@pollar/react';

const { chains, primaryChain, primaryAddress, ready } = useChains();
```

| Field            | Type                  | Description                                                                                                             |
| ---------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `chains`         | `WalletChain[]`       | Chains to offer, in the app's configured order: those the app serves **and** the user holds. `[]` until config resolves |
| `primaryChain`   | `WalletChain \| null` | The app's first configured chain the user holds. `null` until ready                                                     |
| `primaryAddress` | `string`              | The address on `primaryChain`. Falls back to the session's first wallet while config is in flight                       |
| `ready`          | `boolean`             | `false` while `/config` is loading or failed — gate any chain UI on it                                                  |

The order and membership come from the app's `/applications/config`
(`appConfig.application.chains`), not from the session's `wallets`: a chain the app
switched off stops appearing on the next page load even for a user whose stored
session still carries it.

---

### Components

Every modal mounts itself when its `openXModal()` action is called. You don't need to render these directly — they're
already wired inside `<PollarProvider>` — and most are exported in case you want to mount them yourself.

> Two wrappers are **not** exported: `<TxHistoryModal>` and `<TransactionModal>`. Only their templates
> (`TxHistoryModalTemplate` / `TransactionModalTemplate`) are public. Mount those instead if you need to drive them
> yourself.

| Component                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<WalletButton>`           | Drop-in button. Opens login when signed out; signed in, shows the wallet address with a dropdown (Send, Receive, copy address, balance, history, ramp, KYC, distribution rules, sessions, sign out, plus a "Create account" action when the external wallet has no on-chain account yet). Inline arc spinner during in-progress transactions                                             |
| `<SendModal>`              | Full send flow: network picker, asset picker, amount, destination, inline build > sign > success/error. Sending is available on Stellar and Solana; Polygon can be browsed but not sent from                                                                                                                                                                                             |
| `<SwapModal>`              | On-chain asset-to-asset swap: pick from/to assets and amount, quote across venues, execute (auto-trustline on the buy asset when needed); paste a custom buy token (code + issuer)                                                                                                                                                                                                       |
| `<EarnModal>`              | Deposit/withdraw across DeFindex vaults and Blend pools: provider + opportunity selection with live APY, wallet balance, over-spend guards, and auto-trustline on deposit                                                                                                                                                                                                                |
| `<ReceiveModal>`           | Wallet address as QR code with copy-to-clipboard (no external QR dependency required)                                                                                                                                                                                                                                                                                                    |
| `<TxHistoryModal>`         | Paginated transaction history with auto-fetch on open and stellar.expert explorer links                                                                                                                                                                                                                                                                                                  |
| `<WalletBalanceModal>`     | Multichain wallet balances (Stellar, Polygon, Solana). A `<ChainSelect>` in the header picks the network and the rows are filtered to it; shows that chain's address plus a refresh button. An unreadable chain's balance renders as a dash, never as `0`. On Solana testnet each row offers a faucet hint — a devnet SOL faucet on the native row, Circle's USDC faucet on the USDC row |
| `<EnabledAssetsModal>`     | The application's dashboard-enabled assets for the network picked in the header, with per-asset trustline state; establish/remove trustlines (Stellar only - other chains are informational)                                                                                                                                                                                             |
| `<DistributionRulesModal>` | Manage the wallet's distribution rules                                                                                                                                                                                                                                                                                                                                                   |
| `<SessionsModal>`          | Lists every active refresh-token family for the current user with device metadata, marks the local session, per-row revoke, and a "Sign out everywhere" button                                                                                                                                                                                                                           |
| `<KycModal>`               | Identity verification flow - provider selection + status polling _(UI preview - backend coming soon)_                                                                                                                                                                                                                                                                                    |
| `<RampWidget>`             | Buy/sell crypto via SEP-24 - direction tabs, route comparison, payment instructions (wired to `client.createOnRamp` / `client.createOffRamp`)                                                                                                                                                                                                                                            |

```tsx
import { WalletButton } from '@pollar/react';

export function Header() {
  return <WalletButton />;
}
```

---

### Template components

Almost every modal ships a pure presentational "template" companion — same name with a `Template` suffix. Use these when
you want to swap the chrome but keep the data wiring from `usePollar()`. (`<EarnModal>` is the exception: it has no
template yet.)

> The wallet-balance, enabled-assets, send and receive templates each require `chains`, `selectedChain` and
> `onSelectChain`. Get `chains` (in the app's configured order) from `useChains()`, keep `selectedChain` in your own
> state, and render `<ChainSelect>` for the stock picker. `useChains()` is preferred over `chainsOf(wallets)` on its
> own, which cannot know the configured order; if you do call `chainsOf` directly, pass the order as its second
> argument. `addressForChain(wallets, selectedChain)` gives the address for the picked chain.

| Wrapper                    | Template                           |
| -------------------------- | ---------------------------------- |
| `<WalletButton>`           | `<WalletButtonTemplate>`           |
| _(internal LoginModal)_    | `<LoginModalTemplate>`             |
| `<SendModal>`              | `<SendModalTemplate>`              |
| `<SwapModal>`              | `<SwapModalTemplate>`              |
| `<ReceiveModal>`           | `<ReceiveModalTemplate>`           |
| `<TransactionModal>`       | `<TransactionModalTemplate>`       |
| `<TxHistoryModal>`         | `<TxHistoryModalTemplate>`         |
| `<WalletBalanceModal>`     | `<WalletBalanceModalTemplate>`     |
| `<EnabledAssetsModal>`     | `<EnabledAssetsModalTemplate>`     |
| `<DistributionRulesModal>` | `<DistributionRulesModalTemplate>` |
| `<KycModal>`               | `<KycModalTemplate>`               |
| `<RampWidget>`             | `<RampWidgetTemplate>`             |
| `<SessionsModal>`          | `<SessionsModalTemplate>`          |

`<TxStatusView>` is the shared status component (build → sign → success/error) reused by `TransactionModal` and
`SendModal`; it's exported on its own for consumers that want to embed the lifecycle elsewhere.

> `onWalletConnect` is **optional** on `<LoginModalTemplate>` (defaults to a no-op).

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

  // Network picker
  ChainSelectProps,
  UseChainsResult,

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
