# @pollar

Official SDK monorepo for [Pollar](https://pollar.xyz) — authentication and transaction infrastructure for Stellar and Solana
applications.

This repository is managed with [Turborepo](https://turbo.build/repo) and contains the following published packages.

---

## Packages

> **0.10.0 is a breaking change.** External wallets are now registered as a
> `walletAdapters: WalletAdapter[]` array (the old singular `walletAdapter` resolver and
> `loginWallet(id)` are gone; enter any wallet through `login({ provider: id })`). It also
> adds multi-venue swaps, SEP-24 on/off-ramps, a self-driving `@pollar/privy-adapter`
> (web + React Native), custom auth providers, and per-request network timeout/retry. Every
> user re-authenticates once on upgrade (the local storage namespace was widened). Read the
> [CHANGELOG](./CHANGELOG.md) and [UPGRADE.md](./UPGRADE.md) for the full version history before upgrading.

### [`@pollar/core`](./packages/core)

**Version:** `0.11.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/core)

Framework-agnostic TypeScript SDK. Provides the `PollarClient` class and all lower-level utilities needed to integrate
Pollar authentication and multichain (Stellar + Solana) transactions into any JavaScript environment.

**Key features:**

- Authentication via Google, GitHub, Email OTP, Stellar wallets (Freighter, Albedo), and Solana wallets
  (Phantom, Solflare, Backpack)
- **DPoP-bound access + refresh tokens** (RFC 9449) — stolen tokens are useless without the per-session keypair. Web
  keypair is non-extractable; React Native keypair lives in Keychain / EncryptedSharedPreferences
- **Pluggable `Storage` adapter** — autodetects `localStorage` on web with in-memory fallback; first-class adapters for
  Expo SecureStore and `react-native-keychain` shipped as sub-path exports
- **Pluggable `KeyManager`** — `WebCryptoKeyManager` (browsers) or `NobleKeyManager` (RN) with autodetection
- **Race-safe `client.refresh()`** — concurrent 401 retries coalesce into one refresh; auto-retry on 401 with
  `DPoP-Nonce` rotation
- Stellar transaction building and submission through the Pollar API; balances via `refreshBalance()` /
  `getWalletBalance()` on `PollarClient`
- **Multichain (Stellar + Solana)** - v2 wallet balances are tagged by `chain` and report Solana (SOL) alongside
  Stellar assets; login supports **Sign In With Solana (SIWS)** and the SDK signs Solana transactions for sponsored
  external transfers. Solana external-wallet connect ships via `@pollar/solana-wallet-standard-adapter`
- Real-time state management with a typed event system (`onAuthStateChange`)
- **Multi-venue swaps** - `getSwapQuote()` ranks routes across SDEX / Soroswap / Aquarius; `swap()` sets the trustline
  and executes through the standard tx pipeline with on-chain `minReceived` slippage. All three venues execute; which
  ones an app offers is driven by its per-app `GET /swap/config`
- **Earn (yield + lending)** - `getEarnProviders()` / `getEarnOpportunities()` / `getEarnPosition()` /
  `earnDeposit()` / `earnWithdraw()` unify DeFindex vaults and Blend pools behind one provider-selected API, each
  opportunity carrying its live APY
- **SEP-24 on/off-ramps** - anchor deposit/withdraw interactive flow via the `ramps` endpoints
- **Account creation** - `createAccount()` puts an external wallet's classic account on-chain via a sponsored
  `createAccount`; the wallet surfaces `existsOnStellar` + `fundingMode`
- **Sponsored trustlines** - `setTrustline` routes by the asset's `sponsored` flag, so external wallets can set
  app-sponsored trustlines
- **Network resilience** - per-request timeout (default 10s) and idempotent-request retry; typed `PollarNetworkError`
- KYC verification flow - provider selection, session start, and status polling
- Transaction history - paginated fetch with status tracking
- Built-in wallet adapters (`FreighterAdapter`, `AlbedoAdapter`) plus a `walletAdapters: WalletAdapter[]` array for
  external wallet stacks (each adapter auto-renders as a login entry and overrides a built-in by its `type`)
- `AdapterFn`, `PollarAdapter`, and `PollarAdapters` types — generic adapter contract for custom signing flows (e.g.
  Trustless Work SDK)
- Active-session management — `listSessions()` / `revokeSession(familyId)` / `logoutEverywhere()` against the
  refresh-token family on the server
- `getUserProfile()` for in-memory PII access; `destroy()` to tear down the client cleanly
- Full TypeScript typings, ships with ESM and CJS builds

```bash
npm install @pollar/core
```

**Web (no extra setup):**

```ts
import { PollarClient } from '@pollar/core';

const client = new PollarClient({ apiKey: 'pk_...' });
```

**Expo / React Native:**

```ts
import 'react-native-get-random-values'; // at app entry
import { PollarClient } from '@pollar/core';
import { createSecureStoreAdapter } from '@pollar/core/adapters/expo';

const storage = await createSecureStoreAdapter();
const client = new PollarClient({ apiKey: 'pk_...', storage });
```

> HTTPS is required — DPoP needs `SubtleCrypto` and `crypto.randomUUID`, both secure-context only.

---

### [`@pollar/react`](./packages/react)

**Version:** `0.11.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/react)

React bindings built on top of `@pollar/core`. Provides a context provider, hook, and pre-built UI components for
drop-in authentication in React applications.

**Key features:**

- `<PollarProvider>` — wraps your app and initialises the Pollar client; accepts `adapters` for custom signing flows
- `usePollar()` — hook exposing session state, `login`, `logout`, balances, transaction/history state, and modal entry
  points
- `<WalletButton>` — ready-made button that opens the authentication modal; dropdown includes Send, Receive, balance,
  and tx history; shows an inline spinner during in-progress transactions
- `<SendModal>` — full send flow in a single modal: asset picker, amount input, destination address, and inline
  transaction status (build → sign → success/error)
- `<ReceiveModal>` — displays the connected wallet address as a QR code with copy-to-clipboard; no external QR
  dependency required
- `<SwapModal>` - multi-venue swap UI over the core swap API, with a route selector across venues and paste-a-custom-token
- `<EarnModal>` - deposit/withdraw across DeFindex vaults and Blend pools, with live APY, wallet balance, over-spend
  guards, and auto-trustline on deposit; `usePollar()` mirrors the earn methods
- `<RampWidget>` - SEP-24 buy/sell flow wired to the core ramps endpoints (external wallets sign the pending XDR inline)
- `<KycModal>` - identity verification flow with provider selection and status polling _(UI preview - backend coming
  soon)_
- `<TxHistoryModal>` — paginated transaction history viewer with auto-fetch on open and explorer links (stellar.expert for Stellar, Solscan for Solana)
- `<WalletBalanceModal>` — multichain wallet balance display (Stellar + Solana), each balance tagged by chain on multichain apps
- `<SessionsModal>` — drop-in active-sessions UI: lists every refresh-token family for the current user, per-row
  revoke, and a "Sign out everywhere" button
- `createPollarAdapterHook(key)` — factory for fully-typed hooks that wrap custom adapters with automatic XDR signing
- Template components for every modal — pure presentational layer for fully custom UIs
- Bundled stylesheet (`@pollar/react/styles.css`) with `pollar-` namespaced class names
- Peer dependency on React >= 18

```bash
npm install @pollar/react @pollar/core
```

---

### [`@pollar/privy-adapter`](./packages/privy-adapter)

**Version:** `0.11.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/privy-adapter)

Client-side **Privy** wallet adapter for `@pollar/core`. It drives the whole Privy flow itself - email / Google / GitHub
login, creating the user's Privy embedded wallet (Stellar or Solana), and raw-hash signing - then hands the signature to Pollar for
the standard SEP-10 (Stellar) or SIWS (Solana) login + transaction flow. Self-driving: you configure it once and register it in `walletAdapters`,
you do not wire up Privy's hooks yourself.

**Key features:**

- `createPrivyAdapter(config)` + `<PrivyAdapterProvider>` - a `WalletAdapter` plus interactive-login methods the Pollar
  login modal drives (renders a Privy button and sub-modal for the configured `loginMethods`)
- **Web and React Native / Expo** - the right build is picked automatically (`@privy-io/react-auth` on web,
  `@privy-io/expo` on RN); a non-React host fails fast with `PrivyAdapterUnsupportedError`
- Auto-sync host login (`onProviderAuthChange`) that recovers web OAuth redirects and persisted Privy sessions;
  optional `cleanupOAuthRedirect` and `debug` logging
- For server-side custody instead, use `@pollar/privy-server-adapter` below

```bash
npm install @pollar/privy-adapter @pollar/core @stellar/stellar-sdk @privy-io/react-auth react react-dom
```

---

### [`@pollar/privy-server-adapter`](./packages/privy-server-adapter)

**Version:** `0.11.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/privy-server-adapter)

Server-side Privy adapter. A stateless HTTP proxy that lets Pollar sign Stellar or Solana transactions through your **Privy**
server-wallet account without your `PRIVY_APP_SECRET` ever leaving your infrastructure. You run it in your own backend
and point Pollar at its URL. (Formerly published as `@pollar/privy-adapter`, before the client-side rewrite took that
name.)

**Key features:**

- `createPollarPrivyAdapter(config)` - boots a Hono server (default port `3001`) exposing `POST /wallets/create`,
  `POST /wallets/sign`, `GET /wallets/:userId/address`, and `GET /health`. Returns `{ start, stop }` for lifecycle
  control
- Async `getCredentials()` resolver so any secret manager (AWS Secrets Manager, GCP Secret Manager, Vault) works;
  cached for 5 min by default and rebuilt automatically on rotation
- Bearer auth on `/wallets/*` using constant-time comparison (`crypto.timingSafeEqual`)
- Configurable body-size cap (`maxBodyBytes`, default 64 KiB) and per-request timeout (`requestTimeoutMs`, default 10 s)
- Per-userId wallet-address LRU cache (1000 entries, 10 min TTL) - no persistent state
- **Operation allowlist** - optional `allowedOperations` / `restrictToTrustlines` cap what `/wallets/sign` will sign;
  disallowed transactions are rejected with `TX_OPERATION_NOT_ALLOWED` (403) before any Privy round-trip
- Server-side only (Node 20+); do not import it in a client bundle

```bash
npm install @pollar/privy-server-adapter
```

---

### [`@pollar/accesly-adapter`](./packages/accesly-adapter)

**Version:** `0.11.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/accesly-adapter)

Client-side **Accesly** smart-account wallet adapter for `@pollar/core`. Signs Stellar transactions with a user's
Accesly C-address (passkey + MPC) smart wallet, client-side.

**Key features:**

- `createAcceslyAdapter({ address, signXdr, meta? })` - wraps an Accesly session (`useAccesly` from `@accesly/react`)
  as a Pollar `WalletAdapter`; renders as an `accesly` login entry (`login({ provider: 'accesly' })`)

```bash
npm install @pollar/accesly-adapter @pollar/core @accesly/react @accesly/core
```

---

### [`@pollar/stellar-wallets-kit-adapter`](./packages/stellar-wallets-kit-adapter)

**Version:** `0.11.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/stellar-wallets-kit-adapter)

Plugs [Stellar Wallets Kit](https://stellarwalletskit.dev) into Pollar as a set of wallet adapters, without
`@pollar/core` having to depend on the kit. One install gives Pollar access to **every wallet module the kit
supports** - Freighter, Albedo, xBull, Lobstr, Rabet, Hana, Bitget, OneKey, Klever, Fordefi, CactusLink, HotWallet,
plus Ledger / Trezor / WalletConnect via opt-in.

**Key features:**

- `stellarWalletsKitAdapters(options?)` - factory that returns a `WalletAdapter[]` you pass to
  `PollarClientConfig.walletAdapters` (one adapter per module)
- `StellarWalletsKitAdapter` - direct `WalletAdapter` implementation for use outside `PollarClient`
- Defaults to 12 zero-setup modules; pass an explicit `modules` list to add Ledger / Trezor / WalletConnect or to
  trim the bundle
- SSR-safe: `stellarWalletsKitAdapters()` returns `[]` when there is no `window` (Next.js / Remix) and builds the real
  list when it re-runs on the client
- Peer deps: `@creit.tech/stellar-wallets-kit@^2.0.0` and `@pollar/core@^0.10.0` (the kit is **not** bundled)

```bash
npm install @pollar/stellar-wallets-kit-adapter @creit.tech/stellar-wallets-kit
```

---

### [`@pollar/solana-wallet-standard-adapter`](./packages/solana-wallet-standard-adapter)

**Version:** `0.11.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/solana-wallet-standard-adapter)

The Solana counterpart to `@pollar/stellar-wallets-kit-adapter`. Connects user-controlled Solana wallets (Phantom,
Solflare, Backpack, ...) to `@pollar/core` through the [Wallet Standard](https://github.com/wallet-standard/wallet-standard),
without bundling any wallet SDK into `@pollar/core`. Login uses **SIWS (Sign In With Solana)** via each wallet's native
`solana:signIn` feature - the Solana analogue of Stellar's SEP-10 challenge.

**Key features:**

- `solanaWalletStandardAdapters(options?)` - discovers every installed Solana wallet and returns one `WalletAdapter`
  each to pass to `PollarClientConfig.walletAdapters`; SSR-safe (returns `[]` when there is no `window`)
- `SolanaWalletStandardAdapter` - direct `WalletAdapter` implementation for use outside `PollarClient`
- Peer deps: `@pollar/core@^0.11.0-rc.0` plus the `@wallet-standard/*` packages and `@solana/wallet-standard-features`
  (no wallet SDK bundled)

```bash
npm install @pollar/solana-wallet-standard-adapter @pollar/core
```

---

## Repository Structure

```
@pollar/
├── packages/
│   ├── core/                            # @pollar/core - framework-agnostic SDK
│   ├── react/                           # @pollar/react - React bindings and UI components
│   ├── privy-adapter/                   # @pollar/privy-adapter - client-side Privy wallet adapter (web + RN)
│   ├── privy-server-adapter/            # @pollar/privy-server-adapter - server-side Privy signing proxy
│   ├── accesly-adapter/                 # @pollar/accesly-adapter - client-side Accesly smart-wallet adapter
│   ├── stellar-wallets-kit-adapter/     # @pollar/stellar-wallets-kit-adapter - Stellar Wallets Kit bridge
│   └── solana-wallet-standard-adapter/  # @pollar/solana-wallet-standard-adapter - Solana Wallet Standard bridge
├── examples/                            # Example apps (e.g. privy-web)
├── docs/                                # API reference documentation
├── tests/                                # Smoke tests for the built SDK
├── turbo.json                           # Turborepo pipeline configuration
└── tsconfig.base.json                   # Shared TypeScript base configuration
```

---

## Development

This monorepo uses [Turborepo](https://turbo.build/repo) for task orchestration and [npm](https://docs.npmjs.com/cli/v10)
workspaces as the package manager (pinned via `packageManager` in the root `package.json`).

### Prerequisites

- Node.js >= 20 (matches the `engines` floor declared by every published package)
- npm >= 10

### Install dependencies

```bash
npm install
```

### Build all packages

```bash
npm run build
```

### Build in watch mode

```bash
npm run dev
```

### Type-check all packages

```bash
npm run lint
```

### Clean build artifacts

```bash
npm run clean
```

---

## License

MIT
