# @pollar

Official SDK monorepo for [Pollar](https://pollar.xyz) — authentication and transaction infrastructure for Stellar-based
applications.

This repository is managed with [Turborepo](https://turbo.build/repo) and contains the following published packages.

---

## Packages

> **0.7.0 is a breaking change.** Sender-constrained tokens via DPoP, no PII in storage, refresh-token rotation. Read
> the [CHANGELOG](./CHANGELOG.md) before upgrading. Requires `sdk-api` ≥ Phase 5.

### [`@pollar/core`](./packages/core)

**Version:** `0.7.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/core)

Framework-agnostic TypeScript SDK. Provides the `PollarClient` class and all lower-level utilities needed to integrate
Pollar authentication and Stellar transactions into any JavaScript environment.

**Key features:**

- Authentication via Google, GitHub, Email OTP, and Stellar wallets (Freighter, Albedo)
- **DPoP-bound access + refresh tokens** (RFC 9449) — stolen tokens are useless without the per-session keypair. Web
  keypair is non-extractable; React Native keypair lives in Keychain / EncryptedSharedPreferences
- **Pluggable `Storage` adapter** — autodetects `localStorage` on web with in-memory fallback; first-class adapters for
  Expo SecureStore and `react-native-keychain` shipped as sub-path exports
- **Pluggable `KeyManager`** — `WebCryptoKeyManager` (browsers) or `NobleKeyManager` (RN) with autodetection
- **Race-safe `client.refresh()`** — concurrent 401 retries coalesce into one refresh; auto-retry on 401 with
  `DPoP-Nonce` rotation
- Stellar transaction building and submission through the Pollar API
- Real-time state management with a typed event system (`onAuthStateChange`)
- `StellarClient` for querying account balances via Horizon
- KYC verification flow — provider selection, session start, and status polling _(not yet implemented on backend)_
- On/off-ramp support — quote fetching and on-ramp initiation _(not yet implemented on backend)_
- Transaction history — paginated fetch with status tracking
- Direct wallet adapters (`FreighterAdapter`, `AlbedoAdapter`) plus a pluggable `walletAdapter` slot
  (`WalletAdapterResolver`) for external wallet stacks
- `AdapterFn`, `PollarAdapter`, and `PollarAdapters` types — generic adapter contract for custom signing flows (e.g.
  Trustless Work SDK). _(Renamed from `EscrowFn` / `EscrowAdapter` in 0.7.0.)_
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

**Version:** `0.7.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/react)

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
- `<KycModal>` — identity verification flow with provider selection and status polling _(UI preview — backend coming
  soon)_
- `<RampWidget>` — buy/sell crypto with route comparison and payment instructions _(UI preview — backend coming soon)_
- `<TxHistoryModal>` — paginated transaction history viewer with auto-fetch on open and stellar.expert explorer links
- `<WalletBalanceModal>` — Stellar account balance display
- `<SessionsModal>` — drop-in active-sessions UI: lists every refresh-token family for the current user, per-row
  revoke, and a "Sign out everywhere" button (new in 0.7.0)
- `createPollarAdapterHook(key)` — factory for fully-typed hooks that wrap custom adapters with automatic XDR signing
- Template components for every modal — pure presentational layer for fully custom UIs
- Bundled stylesheet (`@pollar/react/styles.css`) with `pollar-` namespaced class names
- Peer dependency on React >= 18

```bash
npm install @pollar/react @pollar/core
```

---

### [`@pollar/privy-adapter`](./packages/privy-adapter)

**Version:** `0.7.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/privy-adapter)

Stateless HTTP sidecar that lets `sdk-api` sign Stellar transactions through your **Privy** server-wallet account
without your `PRIVY_APP_SECRET` ever leaving your infrastructure. Runs alongside `sdk-api`; Privy is treated as a
remote signer reached over an authenticated channel.

**Key features:**

- `createPollarPrivyAdapter(config)` — boots a Hono server (default port `3001`) exposing `POST /wallets/create`,
  `POST /wallets/sign`, `GET /wallets/:userId/address`, and `GET /health`. Returns `{ start, stop }` for lifecycle
  control
- Async `getCredentials()` resolver so any secret manager (AWS Secrets Manager, GCP Secret Manager, Vault…) works;
  cached for 5 min by default and rebuilt automatically on rotation
- Bearer auth on `/wallets/*` using constant-time comparison (`crypto.timingSafeEqual`)
- Configurable body-size cap (`maxBodyBytes`, default 64 KiB) and per-request timeout (`requestTimeoutMs`,
  default 10 s)
- Per-userId wallet-address LRU cache (1 000 entries, 10 min TTL) — no persistent state
- Maps Pollar `userId` → Privy DID via `custom_auth` linked accounts so wallets are namespaced per Pollar tenant
- Discriminated `SuccessCode` / `ErrorCode` enums; optional `onError(error, ctx)` hook for upstream telemetry
- Node ≥ 20

```bash
npm install @pollar/privy-adapter
```

---

### [`@pollar/stellar-wallets-kit-adapter`](./packages/stellar-wallets-kit-adapter)

**Version:** `0.7.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/stellar-wallets-kit-adapter)

Plugs [Stellar Wallets Kit](https://stellarwalletskit.dev) into Pollar as a single wallet adapter, without
`@pollar/core` having to depend on the kit. One install gives Pollar access to **every wallet module the kit
supports** — Freighter, Albedo, xBull, Lobstr, Rabet, Hana, Bitget, OneKey, Klever, Fordefi, CactusLink, HotWallet,
plus Ledger / Trezor / WalletConnect via opt-in.

**Key features:**

- `stellarWalletsKit(options?)` — factory that returns a `WalletAdapterResolver` you hand to
  `PollarClientConfig.walletAdapter`
- `StellarWalletsKitAdapter` — direct `WalletAdapter` implementation for use outside `PollarClient`
- Defaults to 12 zero-setup modules; pass an explicit `modules` list to add Ledger / Trezor / WalletConnect or to
  trim the bundle
- One-shot lazy `init` — `StellarWalletsKit.init(...)` runs on the first `loginWallet` call; importing the package
  has no startup cost
- Peer deps: `@creit.tech/stellar-wallets-kit@^2.0.0` and `@pollar/core@*` (the kit is **not** bundled)

```bash
npm install @pollar/stellar-wallets-kit-adapter @creit.tech/stellar-wallets-kit
```

---

## Repository Structure

```
@pollar/
├── packages/
│   ├── core/                            # @pollar/core — framework-agnostic SDK
│   ├── react/                           # @pollar/react — React bindings and UI components
│   ├── privy-adapter/                   # @pollar/privy-adapter — Privy ↔ Stellar HTTP sidecar
│   └── stellar-wallets-kit-adapter/     # @pollar/stellar-wallets-kit-adapter — Stellar Wallets Kit bridge
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
