# @pollar/react

React bindings for [Pollar](https://pollar.xyz) - drop-in authentication UI, transaction modals, and hooks for
Stellar and Solana applications.

> **0.12.1** (requires `@pollar/core@^0.12.1`). Every modal and exported template speaks English, Spanish and
> Portuguese (see [Language](#language)). `<SwapModal>` swaps on Solana too, with a Network selector when the app has
> venues on both chains. `<SendModal>` offers a Hash memo next to Text and ID. `<ConfirmModal>` shows a Soroban token
> transfer (`kind: 'sign_auth_entry'`) with its destination, amount and asset. `<ConfirmModal>`, `<CosignModal>` and
> every transaction status view share one review: what moves, a fee badge when who pays is known, and "Show details"
> with the addresses, network, fee, raw transaction and hash. `<RequirementFormModal>` asks a field
> with `showIf` only while the answer it depends on matches. `<CardModal>` copies the number, expiry date and CVC,
> offers a network picker when the user holds a wallet on Stellar and Solana, and funds the card from a co-signed
> wallet too. The email code input takes an autofilled one-time code. The ramp widget says a route's minimum or
> maximum and offers "Change amount", and an order whose price changed before anything moved offers "Get a new quote".
> `openRampModal(options)` opens the ramp widget on a direction, country, fiat, asset and amount.
> A hook built with `createPollarAdapterHook` signs the auth entry an adapter answers with, without submitting
> anything, and hands it to the adapter's `complete`.
>
> See the [CHANGELOG](https://github.com/pollar-xyz/pollar/blob/main/CHANGELOG.md) for earlier releases and [UPGRADE.md](https://github.com/pollar-xyz/pollar/blob/main/UPGRADE.md) before upgrading.

## Installation

```bash
npm install @pollar/react @pollar/core
# or
pnpm add @pollar/react @pollar/core
# or
yarn add @pollar/react @pollar/core
```

**Peer dependencies:** `@pollar/core ^0.12.1`, `react >= 18`, `react-dom >= 18`. Node >= 20 in toolchains. npm 7+
installs peers automatically; on npm 6, Yarn 1 or `--legacy-peer-deps`, list `@pollar/core` in your own dependencies.

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
    baseUrl: 'https://sdk.api.pollar.xyz', // optional, origin only - the SDK appends /v3
    stellarNetwork: 'testnet', // optional, default: 'testnet'
    locale: 'pt-BR', // optional, BCP 47 tag for the modals' language (see Language below)
    storage, // optional, RN apps inject this
    keyManager, // optional, autodetects on web
    walletAdapters, // optional, WalletAdapter[] - external wallet stacks
    deviceLabel: 'iPhone - Safari', // optional, shown in SessionsModal
    onStorageDegrade, // optional, telemetry hook
  }}
  // Optional: pass `appConfig` to skip the remote `/applications/config` fetch
  // and use a local config instead. `application` is required; `styles` may be partial,
  // but a login method it leaves out (emailEnabled, providers, ...) is off.
  appConfig={{
    application: { name: 'My app', network: 'testnet', chains: ['STELLAR'] },
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

| Prop               | Type                                 | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client`           | `PollarClient \| PollarClientConfig` | Yes      | Either a pre-built `PollarClient` (testing, reuse outside React) or a `PollarClientConfig` the provider will construct one from. **Locked at first render** - swapping after mount is ignored                                                                                                                                                                                                                                  |
| `appConfig`        | `PollarConfig`                       | No       | Local replacement for `/applications/config`, used verbatim and never merged with the server's answer. **Presence is the opt-out switch**: pass it and the remote fetch is skipped. Omit it to fetch the config on mount, which keeps branding, login methods and chains current. Unlike `client`, it can be added or swapped after mount - the context re-applies it (compared by value, so an inline object literal is fine) |
| `adapters`         | `PollarAdapters`                     | No       | Named set of `PollarAdapter` objects (e.g. Trustless Work). See [Custom adapters](#custom-adapters)                                                                                                                                                                                                                                                                                                                            |
| `onStorageDegrade` | `OnStorageDegrade`                   | No       | Called once when persistent storage falls back to in-memory mode (Safari private browsing, sandboxed iframes), so the session will not survive a reload                                                                                                                                                                                                                                                                        |

---

### `usePollar()`

Returns the full Pollar context. Every modal opener returned here renders an already-wired modal - no extra mounting
needed.

```ts
const {
  // Session
  isAuthenticated, // boolean - true while a session exists, with or without a wallet
  wallet, // WalletInfo | null - read wallet?.address for the on-chain address
  wallets, // WalletInfo[] - every wallet the user holds, one per chain. To drive
  //          a network picker, prefer the useChains() hook (below) over reading
  //          this directly - it applies the app's configured chain order
  verified, // boolean - true once the server has confirmed the session
  hasWallet, // boolean - false until createWallet() runs on an app that creates wallets on demand
  createWallet, // (options?: { custody? }) => Promise<WalletInfo>  (custody: the user's pick under USER_CHOICE)

  // App config (the remote /config fetch behind the login modal)
  configStatus, // 'loading' | 'ready' | 'error'
  retryConfig, // () => void - re-runs the fetch after an error

  // Client escape hatch
  getClient, // () => PollarClient - for getUserProfile(), listSessions(), ...

  // Auth
  login, // (options: PollarLoginOptions) => void
  logout, // () => void  (fire-and-forget; await getClient().logout() if you need the promise)
  openLoginModal, // () => void

  // Sessions
  sessions, // SessionsState
  openSessionsModal, // () => void

  // Co-signed wallets (Turnkey)
  cosign, // CosignState - requests waiting for this device's vote
  openCosignModal, // () => void  (also opens by itself when a request arrives)
  setCosignNextStep, // (next: string | null) => void - keeps the prompt open for a flow's next approval
  recovery, // RecoveryState | null
  recoveryLocked, // boolean - true while the wallet cannot be recovered without this device
  refreshRecovery, // () => void
  openRecoveryModal, // () => void  (passkeys, email, devices, recovery phrase)
  custodyMigration, // CustodyMigrationState | null - while `required`, the provider shows the move to Turnkey
  refreshCustodyMigration, // () => void

  // Signature confirmation
  confirmations, // PendingConfirmation[] - signing calls waiting under confirmation: 'prompt'; the provider shows the first

  // Transactions
  tx, // TransactionState
  buildTx, // (operation, params, options?) => Promise<BuildOutcome>
  signAndSubmitTx, // (unsignedXdr?: string) => Promise<SubmitOutcome>  (the smart-wallet path; embedded and external can call it too; XDR optional)
  signTx, // (unsignedXdr: string) => Promise<SignOutcome>  (embedded: server signs; external: adapter signs; not for smart wallets)
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
  swap, // (quote: SwapQuote, opts?: { autoTrustline? }) => Promise<SubmitOutcome>
  getSwapConfig, // () => Promise<SwapVenue[]>  (which venues this app offers)
  getSwapTokens, // () => Promise<SwapToken[]>
  getSolanaSwapConfig, // () => Promise<SolanaSwapVenue[]>  (Jupiter, Titan; mainnet)
  getSolanaSwapQuote, // (params: SolanaSwapQuoteParams) => Promise<SolanaSwapQuote[]>
  swapSolana, // (quote: SolanaSwapQuote, opts?: { slippageBps? }) => Promise<SubmitOutcome>
  openSwapModal, // () => void

  // Earn (yield vaults + lending - DeFindex + Blend)
  getEarnProviders, // () => Promise<EarnProviderId[]>  ([] means Earn is disabled)
  getEarnOpportunities, // (provider: EarnProviderId) => Promise<EarnOpportunity[]>
  getEarnPosition, // (params: EarnPositionParams) => Promise<EarnPosition>
  earnDeposit, // (params: EarnTxParams) => Promise<SubmitOutcome>
  earnWithdraw, // (params: EarnTxParams) => Promise<SubmitOutcome>
  openEarnModal, // () => void

  // Cards (the card calls live on getClient(): getCardProviders, issueCard, fundCard, ...)
  openCardModal, // () => void

  // Distribution rules
  openDistributionRulesModal, // () => void

  // Send / Receive
  openSendModal, // () => void
  openReceiveModal, // () => void

  // Network
  network, // StellarNetwork - 'mainnet' | 'testnet'
  setNetwork, // (network: StellarNetwork) => void

  // KYC: without corridorId/providerId it walks the app's own KYC steps
  openKycModal, // (options?: { corridorId?, providerId?, country?, level?, onApproved? }) => void

  // Ramp (fiat on/off-ramps on the v3 ramps API, wired through core)
  openRampModal, // (options?: RampModalOptions) => void

  // App config / styles served by the Pollar API
  appConfig, // PollarConfig
  styles, // PollarStyles

  // Adapters (from PollarProvider props)
  adapters, // PollarAdapters | undefined
} = usePollar();
```

Custody is derived from `wallet`, not a separate field - e.g.
`wallet?.custody === 'external' ? wallet.provider : null`.

#### Ramp options

`openRampModal()` opens the ramp widget on its defaults. `openRampModal(options)` opens it on a direction, country,
fiat, asset and amount; the user can still change each one.

```ts
import type { RampModalOptions } from '@pollar/react';

openRampModal({ country: 'BR', direction: flow === 'withdraw' ? 'sell' : 'buy' });
openRampModal({ direction: 'buy', country: 'MX', fiat: 'MXN', asset: 'USDC', amount: '500' });
```

| Option      | Type              | Description                                                          |
| ----------- | ----------------- | -------------------------------------------------------------------- |
| `direction` | `'buy' \| 'sell'` | Buy (on-ramp) or sell (off-ramp). Defaults to `'buy'`                |
| `country`   | `string`          | ISO 3166-1 alpha-2, e.g. `'BR'`                                      |
| `fiat`      | `string`          | Currency code, e.g. `'BRL'`. Defaults to the country's first fiat    |
| `asset`     | `string`          | Asset code, e.g. `'USDC'`. Defaults to the first asset for that fiat |
| `amount`    | `string`          | A plain decimal, e.g. `'100'` or `'12.5'`; anything else is left out |

A country that does not route in the requested direction, or that the app does not offer, opens on the widget's default
country, without the fiat, asset or amount; a fiat or asset the country does not offer opens on the country's first one.
Nothing is thrown. The options wait for the routes when they are still loading. Each call starts over: opening again
with other options, or with none, drops the earlier ones. `<RampWidget initial={options}>` takes the same options.

#### Login options

```ts
// Social providers (opens a popup)
login({ provider: 'google' });
login({ provider: 'github' });

// Email OTP (the code input accepts a code the browser or keyboard autofills, or a paste)
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

#### Self-driving interactive adapters (Privy, ...)

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
own wallet button or picker instead of calling `chainsOf(wallets)` yourself -
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
| `ready`          | `boolean`             | `false` while `/config` is loading or failed - gate any chain UI on it                                                  |

The order and membership come from the app's `/applications/config`
(`appConfig.application.chains`), not from the session's `wallets`: a chain the app
switched off stops appearing on the next page load even for a user whose stored
session still carries it.

---

### Language

Every modal, shared block (footer, copy button, amount field, pickers) and exported template speaks English (`en`),
Spanish (`es`) and Portuguese (`pt`). The provider picks the language once, in this order:

1. The language the app pins in the dashboard (Branding > Language, served as `styles.language`).
2. The `language` prop of `<RampWidget>`, `<KycModal>`, `<RequirementFormModal>`, `<RegistryCheckModal>` or
   `<ProviderRegistrationModal>`, a BCP 47 tag.
3. The client's `locale` (`client={{ apiKey, locale: 'pt-BR' }}`), any BCP 47 tag.
4. The browser language.

A tag the modals have no translation for is skipped, and English is the fallback. Every exported template takes a
`language` prop (`PollarLanguage` from `@pollar/core`: `'en' | 'es' | 'pt'`); a template rendered inside the provider
follows the provider's language, and one rendered outside it uses the browser's.

---

### Components

Every modal mounts itself when its `openXModal()` action is called. You don't need to render these directly - they're
already wired inside `<PollarProvider>` - and most are exported in case you want to mount them yourself.

> Two wrappers are **not** exported: `<TxHistoryModal>` and `<TransactionModal>`. Only their templates
> (`TxHistoryModalTemplate` / `TransactionModalTemplate`) are public. Mount those instead if you need to drive them
> yourself.
>
> The provider also shows three prompts by itself, with no opener: `<ConfirmModal>` (internal) for a signing call
> waiting under `confirmation: 'prompt'`, including a Soroban token transfer (`kind: 'sign_auth_entry'`) with its
> destination, amount and asset; `<CosignModal>` when a co-signed wallet has a request for this device; and
> `<CustodyMigrationModal>` while `custodyMigration.required` asks to move a custodial wallet to Turnkey.

| Component                                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<WalletButton>`                            | Drop-in button. Opens login when signed out; signed in, shows the wallet address with a dropdown (Send, Receive, copy address, balance, history, ramp, KYC, distribution rules, sessions, recovery methods, sign out, plus a "Create account" action when the external wallet has no on-chain account yet). Inline arc spinner during in-progress transactions                                                                                                                                                     |
| `<SendModal>`                               | Full send flow: network picker (shown when the app has more than one chain), asset picker, amount with Max (from the available balance), destination with Paste, a Stellar memo (Text, ID or Hash: 64 hex characters), inline build > sign > success/error. A Stellar destination with no account offers to create it with the XLM being sent. Sending is available on Stellar and Solana; Polygon can be browsed but not sent from                                                                                |
| `<SwapModal>`                               | On-chain asset-to-asset swap on Stellar and Solana (a Network selector when the app has venues on both): pick from/to assets and amount, quote across venues, execute (auto-trustline on the buy asset when needed); paste a custom Stellar buy token (code + issuer). On Solana it sells what the Solana wallet holds, buys SOL or a token the app enabled, shows the route's output and minimum, and links the swap to Solscan                                                                                   |
| `<EarnModal>`                               | Deposit/withdraw across DeFindex vaults and Blend pools: provider + opportunity selection with live APY, wallet balance, over-spend guards, and auto-trustline on deposit                                                                                                                                                                                                                                                                                                                                          |
| `<ReceiveModal>`                            | Wallet address as QR code with copy-to-clipboard (no external QR dependency required)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `<TxHistoryModal>`                          | Paginated multichain transaction history with auto-fetch on open. A `<ChainSelect>` in the header filters server-side (switching networks refetches and resets to page 1); rows link to their own chain's explorer (stellar.expert for Stellar, explorer.solana.com for Solana) and show the unified `{ amount, unit }` fee                                                                                                                                                                                        |
| `<WalletBalanceModal>`                      | Multichain wallet balances (Stellar, Polygon, Solana). A `<ChainSelect>` picks the network and the rows are filtered to it; shows that chain's address plus a refresh button, and each row's issuer with a copy action. An unreadable chain's balance renders as a dash, never as `0`. On Solana testnet each row offers a faucet hint - a devnet SOL faucet on the native row, Circle's USDC faucet on the USDC row                                                                                               |
| `<EnabledAssetsModal>`                      | The application's dashboard-enabled assets for the network picked in the header, with per-asset trustline state; establish/remove trustlines (Stellar only - other chains are informational)                                                                                                                                                                                                                                                                                                                       |
| `<DistributionRulesModal>`                  | Manage the wallet's distribution rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `<SessionsModal>`                           | Lists every active refresh-token family for the current user with device metadata, marks the local session, per-row revoke, and a "Sign out everywhere" button                                                                                                                                                                                                                                                                                                                                                     |
| `<KycModal>`                                | Identity verification: hosted (iframe or redirect) flow per option, corridor-scoped when a ramp route asks for it (`corridorId`), or started on one option (`providerId`). Shows review, expiry and retry states; without either id it walks the app's own KYC steps                                                                                                                                                                                                                                               |
| `<RampWidget>`                              | Buy/sell crypto: direction tabs, country, fiat and asset pickers, route comparison leg by leg, the fields a route asks for, then the order's progress with its pending action (payment QR or bank details, Authorize, co-sign approval, verification link) and what to do when a leg fails. A route refused for its amount says the minimum or maximum it takes and offers "Change amount"; an order whose price changed before anything moved offers "Get a new quote". Orders waiting on the user can be resumed |
| `<RequirementFormModal>`                    | One `FORM` requirement step of a ramp route: renders the form the backend names (`formId`), prefilled with the user's previous answers, and stores the answers encrypted. A field with `showIf: { key, in }` is shown only while the earlier select, multiselect or checkbox it names answers one of those values, and is neither checked nor sent while hidden. `<RampWidget>` opens it itself; exported for consumers who build their own route list from `requirementsRequired`                                 |
| `<RegistryCheckModal>`                      | One `REGISTRY_CHECK` step (SEGIP through Stereum, `optionId`): the verified identity prefilled and read-only except the surname split and the CI complement; a check the registry did not confirm shows the review state with nothing to retry                                                                                                                                                                                                                                                                     |
| `<ProviderRegistrationModal>`               | One `PROVIDER_REGISTRATION` step (`corridorId`): lists what the ramp provider receives and registers the user with it on consent; an already registered user is passed through                                                                                                                                                                                                                                                                                                                                     |
| `<CardModal>`                               | Opened with `openCardModal()`: the card provider's sign-up, identity verification and issuing, then the card with the app's logo and label, its balance and movements, and the number revealed on the device. Copy buttons next to the number and CVC while the details are shown, and next to the expiry date always. Funds the card from the wallet, including a co-signed one, with a network picker when the user holds a wallet on Stellar and Solana, and shows each funding's steps                         |
| `<RecoveryModal>`                           | Opened with `openRecoveryModal()`: the recovery methods of a Turnkey wallet (passkeys, email, devices, recovery phrase)                                                                                                                                                                                                                                                                                                                                                                                            |
| `<CosignModal>`                             | The approval prompt of a co-signed wallet. Enables Approve only after the request verifies against Turnkey                                                                                                                                                                                                                                                                                                                                                                                                         |
| `<CustodyMigrationModal>`                   | Moves a custodial wallet to Turnkey after login when the app keeps its wallets there (`state`, `onMoved`, `onLater` props)                                                                                                                                                                                                                                                                                                                                                                                         |
| `<KycStatus>`                               | A KYC status badge (`status`, optional `label`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `<RouteDisplay>` / `<RejectedRouteDisplay>` | One ramp route, offered or refused, as the ramp widget lists it                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

```tsx
import { WalletButton } from '@pollar/react';

export function Header() {
  return <WalletButton />;
}
```

---

### Template components

Almost every modal ships a pure presentational "template" companion - same name with a `Template` suffix. Use these when
you want to swap the chrome but keep the data wiring from `usePollar()`. (`<EarnModal>`, `<CardModal>`, `<RequirementFormModal>`,
`<RegistryCheckModal>` and `<ProviderRegistrationModal>` are the exceptions: they have no template.)

> The enabled-assets template requires `chains`, `selectedChain` and `onSelectChain`; the wallet-balance, send and
> receive templates require `selectedChain` and take `chains` / `onSelectChain` as optional - pass both to show the
> picker, which renders only with two or more chains. Get `chains` (in the app's configured order) from `useChains()`, keep
> `selectedChain` in your own state, and render `<ChainSelect>` for the stock picker. `useChains()` is preferred over `chainsOf(wallets)` on its
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
| `<CosignModal>`            | `<CosignModalTemplate>`            |
| `<RecoveryModal>`          | `<RecoveryModalTemplate>`          |
| `<CustodyMigrationModal>`  | `<CustodyMigrationModalTemplate>`  |

`<TxStatusView>` is the shared status component (build -> sign -> success/error) reused by `TransactionModal` and
`SendModal`; it's exported on its own for consumers that want to embed the lifecycle elsewhere. It shows the same
review as `<ConfirmModal>` and `<CosignModal>`: the asset and chain logos with the sender and recipient, the fee badge
once the platform reports who paid, and "Show details".

> `onWalletConnect` is **optional** on `<LoginModalTemplate>` (defaults to a no-op).

> `notReadyReason` is **optional** on `<SendModalTemplate>`, `<ReceiveModalTemplate>` and
> `<WalletButtonTemplate>`. Render it when it is present: it is the sentence for a Stellar account the platform is still creating, and
> without it a custom Send lets the user build a payment the server will refuse
> (`SDK_WALLET_NOT_READY`). To phrase it yourself, call the exported
> `walletNotReadyReason(wallet, chain)`. It gates on `STELLAR` and on the ACCOUNT only, so a
> Solana wallet, an external wallet (which never carries `provisioning`) and a missing trustline
> all read as `null` - no reason to block.

---

### Custom adapters

The `adapters` prop on `<PollarProvider>` accepts any named set of `PollarAdapter` objects. Each adapter function
receives params and returns either an unsigned transaction or a Soroban auth entry to sign; Pollar handles the
signing (and, for a transaction, the submission).

```tsx
import type { PollarAdapter } from '@pollar/core';

const trustlessWork = {
  initialize: async (params: InitializeParams) => ({ unsignedTransaction: '...' }),
  release: async (params: ReleaseParams) => ({ unsignedTransaction: '...' }),
} satisfies PollarAdapter;

<PollarProvider client={{ apiKey }} adapters={{ trustlessWork }}>
  ...
</PollarProvider>;
```

#### `createPollarAdapterHook(key)`

Factory that generates a fully-typed hook mirroring an adapter's API with signing built in:

```tsx
import { createPollarAdapterHook } from '@pollar/react';

const useTrustlessWork = createPollarAdapterHook<typeof trustlessWork>('trustlessWork');

function ReleaseButton() {
  const tw = useTrustlessWork();
  // The adapter builds the XDR; the hook signs and submits it and resolves with a SubmitOutcome.
  return (
    <button
      onClick={() =>
        tw.release({
          /* ... */
        })
      }
    >
      Release
    </button>
  );
}
```

#### Auth-entry steps

When someone else submits the call and pays its fee (an x402 facilitator, a contract that sponsors the gas), an
adapter function answers `{ unsignedAuthEntry, validUntilLedger, complete }` instead of `{ unsignedTransaction }`.
The hook signs the entry with the user's wallet through `signAuthEntry` (the app's allowlist, the validity window,
the signature confirmation, a co-signed wallet's vote), submits nothing, and passes the signed entry to `complete`.
The call resolves with `{ status: 'completed', result }`, where `result` is what `complete` returned, or with the
signing outcome that stopped it (`{ status: 'cosign_pending', request }` or `{ status: 'error', code?, details? }`).

```ts
const x402 = {
  pay: async (params: PayParams) => ({
    unsignedAuthEntry: entryXdr, // base64 XDR of the unsigned SorobanAuthorizationEntry
    validUntilLedger, // within the app's validity window
    complete: async (signedAuthEntry: string) => submitToFacilitator(signedAuthEntry),
  }),
} satisfies PollarAdapter;
```

`isAuthEntryAdapterStep` and `completeAuthEntryStep` (from `@pollar/core`) run the same step outside React.

---

### External wallet stacks (Stellar Wallets Kit, ...)

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
while adapters with no group - e.g. Privy - render as their own button in the
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

  // Network picker and co-signing
  ChainSelectProps,
  UseChainsResult,
  UseCosignResult,

  // Modal theming
  ModalStyleOverrides,
  ModalVariant,
  ModalChrome,

  // Template props
  WalletButtonTemplateProps,
  SendModalTemplateProps,
  SendMemoType,
  SwapModalTemplateProps,
  SwapAssetOption,
  ReceiveModalTemplateProps,
  TransactionModalTemplateProps,
  TxStatusViewProps,
  WalletBalanceModalTemplateProps,
  EnabledAssetsModalTemplateProps,
  CustomTrustlineModalTemplateProps,
  SessionsModalTemplateProps,
  SessionsState,
  CosignModalTemplateProps,
  RecoveryModalTemplateProps,
  RecoveryView,
  CustodyMigrationModalTemplateProps,

  // Step unions
  KycStep,
  RampStep,
} from '@pollar/react';
```

The state types (`TransactionState`, `TxHistoryState`, `WalletBalanceState`, `NetworkState`, `AuthState`,
`CosignState`, `RecoveryState`, `PendingConfirmation`, `PollarPersistedSession`, `PollarUserProfile`, `SessionInfo`,
`PollarLanguage`, ...) are exported by `@pollar/core`; import them from there.

---

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
