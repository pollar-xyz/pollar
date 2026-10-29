# @pollar

Official SDK monorepo for [Pollar](https://pollar.xyz): authentication and transaction infrastructure for Stellar and Solana
applications.

This repository is managed with [Turborepo](https://turbo.build/repo) and contains the following published packages.

## Solana

Pollar runs on Solana end to end for wallets and payments:

- **Sign in** with Phantom, Solflare or Backpack (Sign In With Solana, via `@pollar/solana-wallet-standard-adapter`), or
  with email / Google / GitHub to get a **Pollar-managed Solana wallet**, with no seed phrase.
- **Turnkey co-signed wallets** (mainnet): every signature is a 2-of-2 vote between the user's device and Pollar, and the
  device verifies the transaction, including Solana CCTP burns, before it votes.
- **Hold, send and receive SOL and SPL tokens** with `sendPayment()` and the drop-in React modals, with **app-sponsored
  fees** and token accounts created for the recipient.
- **Fiat on/off-ramps to Solana**: Bolivia (BOB, via Stereum + CCTP) and Brazil (BRL via Pix, PagFinance).

---

## Packages

> **0.12.1** (`@pollar/core`, `@pollar/react`, `@pollar/react-native`) is additive on 0.12.0. Soroban auth entries
> are signed by the Pollar wallet for **x402** and other sponsored-fee flows (`client.stellar.authEntrySigner()`, a
> SEP-43 signer for x402's `ExactStellarScheme`), co-signed wallets sign those entries, and Stellar sends take hash
> memos. It adds **swaps on Solana** (Jupiter and Titan: `getSolanaSwapConfig`, `getSolanaSwapQuote`, `swapSolana`,
> and a Network selector in the web `<SwapModal>`), every modal in **English, Spanish and Portuguese**, conditional
> KYC form fields, ramp texts that name a route's minimum or maximum, and card funding from Solana and from co-signed
> wallets. One existing call changes behavior: `signAuthEntry` asks for the signature confirmation like every other
> signature; see [UPGRADE.md](./UPGRADE.md). The Stellar Wallets Kit and Solana Wallet Standard adapters stay at
> `0.12.0`; their `^0.12.0` core range accepts 0.12.1.
>
> **0.12** runs on the sdk-api **`/v3`** API and has breaking changes. **Ramps are orders** (`getRampRoutes`,
> `quoteRamp`, `createRampOrder`, `pollRampOrder`, `signRampLeg`), and Pollar runs each leg (the provider, a swap, a
> bridge) server-side. A Turnkey wallet is self-custody or co-signed, is recovered with a passkey, an email code or
> another device (`<RecoveryModal>`), and a custodial wallet moves to Turnkey from the device
> (`<CustodyMigrationModal>`). Every signature asks the user by default, and the app's dashboard sets a window of
> minutes and USD.
>
> Before upgrading from an earlier release, read [UPGRADE.md](./UPGRADE.md) for the migration steps (or run
> `npx @pollar/migrate`) and the [CHANGELOG](./CHANGELOG.md) for the full version history.

### [`@pollar/core`](./packages/core)

**Version:** `0.12.1` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/core)

Framework-agnostic TypeScript SDK. Provides the `PollarClient` class and all lower-level utilities needed to integrate
Pollar authentication and multichain (Stellar + Solana) transactions into any JavaScript environment.

**Key features:**

- Authentication via Google, GitHub, Email OTP, Stellar wallets (Freighter, Albedo), and Solana wallets
  (Phantom, Solflare, Backpack)
- **DPoP-bound access + refresh tokens** (RFC 9449): stolen tokens are useless without the per-session keypair. Web
  keypair is non-extractable; React Native keypair lives in Keychain / EncryptedSharedPreferences
- **Pluggable `Storage` adapter**: autodetects `localStorage` on web with in-memory fallback; first-class adapters for
  Expo SecureStore and `react-native-keychain` shipped as sub-path exports
- **Pluggable `KeyManager`**: `WebCryptoKeyManager` (browsers) or `NobleKeyManager` (RN) with autodetection
- **Race-safe `client.refresh()`**: concurrent 401 retries coalesce into one refresh; auto-retry on 401 with
  `DPoP-Nonce` rotation
- Stellar transaction building and submission through the Pollar API; balances via `refreshBalance()` /
  `getWalletBalance()` on `PollarClient`
- **Multichain (Stellar + Solana)** - wallet balances are tagged by `chain`, and every chain reports its native coin
  plus each token the app enabled. A balance is `null` when the chain could not be read, which must render as
  unavailable rather than as zero. Login supports **Sign In With Solana (SIWS)** and the SDK signs Solana transactions
  for sponsored external transfers. Solana external-wallet connect ships via `@pollar/solana-wallet-standard-adapter`
- Real-time state management with a typed event system (`onAuthStateChange`)
- **Multi-venue swaps** - `getSwapQuote()` ranks routes across SDEX / Soroswap / Aquarius; `swap()` sets the trustline
  and executes through the standard tx pipeline with on-chain `minReceived` slippage. All three venues execute; which
  ones an app offers is driven by its per-app `GET /swap/config`
- **Swaps on Solana** - `getSolanaSwapConfig()` lists the app's Solana venues (Jupiter and Titan, mainnet),
  `getSolanaSwapQuote()` quotes from the user's Solana wallet and `swapSolana(quote)` executes the quoted route
- **Earn (yield + lending)** - `getEarnProviders()` / `getEarnOpportunities()` / `getEarnPosition()` /
  `earnDeposit()` / `earnWithdraw()` unify DeFindex vaults and Blend pools behind one provider-selected API, each
  opportunity carrying its live APY
- **Ramp orders (v3)** - `getRampRoutes()`, `quoteRamp()`, `createRampOrder()`, `pollRampOrder()` and `signRampLeg()`;
  Pollar runs each leg (the provider, a swap, a bridge) server-side
- **Account creation** - `createAccount()` puts an external wallet's classic account on-chain via a sponsored
  `createAccount`; the wallet surfaces `existsOnStellar` + `fundingMode`
- **Wallets on demand** - for an app that creates wallets on demand or never, a session without a wallet is signed in;
  `hasWallet()` says whether there is one on any chain and `createWallet()` creates it
- **Cards** - `getCardProviders()`, `issueCard()`, `fundCard()` (from Stellar, or `chain: 'SOLANA'`),
  `getCardBalance()` and the rest of the card methods; `revealCardSecrets()` decrypts the card number on the device, on
  WebCrypto or in plain JavaScript on React Native
- **Sponsored trustlines** - `setTrustline` lets the app config decide who pays (server-side): embedded wallets hit
  the sponsored/self-pay trustline endpoint, external wallets co-sign whichever XDR the server returns. Pass
  `skipSponsorship` to force the user's own wallet to pay via `change_trust`
- **Stellar ownership proofs (SEP-53 / SEP-10)** - `client.stellar.sep53.signMessage()` and
  `client.stellar.sep10.sign()` prove wallet ownership to a verifier. External wallets sign client-side via their
  adapter, embedded wallets sign server-side, and both return the same `sep53` scheme
- **x402 and Soroban auth entries** - `client.stellar.authEntrySigner()` is a SEP-43 signer over the user's wallet for
  stellar-sdk's contract client and x402's `ExactStellarScheme`; `signAuthEntry` asks for the signature confirmation
- **Languages** - user-facing texts in English, Spanish and Portuguese (`resolveLanguage`, `client.getLocale()`, the
  `locale` client option)
- **Network resilience** - per-request timeout (default 10s) and idempotent-request retry; typed `PollarNetworkError`
- KYC verification flow - provider selection, session start, and status polling
- Transaction history - paginated fetch with status tracking
- Built-in wallet adapters (`FreighterAdapter`, `AlbedoAdapter`) plus a `walletAdapters: WalletAdapter[]` array for
  external wallet stacks (each adapter auto-renders as a login entry and overrides a built-in by its `type`)
- `AdapterFn`, `PollarAdapter`, and `PollarAdapters` types: generic adapter contract for custom signing flows (e.g.
  Trustless Work SDK)
- Active-session management: `listSessions()` / `revokeSession(familyId)` / `logoutEverywhere()` against the
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

> HTTPS is required: DPoP needs `SubtleCrypto` and `crypto.randomUUID`, both secure-context only.

---

### [`@pollar/react`](./packages/react)

**Version:** `0.12.1` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/react)

React bindings built on top of `@pollar/core`. Provides a context provider, hook, and pre-built UI components for
drop-in authentication in React applications.

**Key features:**

- `<PollarProvider>` - wraps your app and initialises the Pollar client; accepts `adapters` for custom signing flows
- `usePollar()` - hook exposing session state, `login`, `logout`, balances, transaction/history state, the swap
  methods (Stellar and Solana), and modal entry points
- `<WalletButton>` - ready-made button that opens the authentication modal; dropdown includes Send, Receive, balance,
  and tx history; shows an inline spinner during in-progress transactions
- `<SendModal>` - full send flow in a single modal: network picker (multichain apps), asset picker, amount with Max, destination
  with Paste, a Stellar memo (Text, ID or Hash), and inline transaction status (build -> sign -> success/error)
- `<ReceiveModal>` - displays the connected wallet address as a QR code with copy-to-clipboard; no external QR
  dependency required
- `<SwapModal>` - multi-venue swap UI over the core swap API, with a route selector across venues and paste-a-custom-token;
  with venues on Stellar and Solana a Network selector picks the chain
- `<EarnModal>` - deposit/withdraw across DeFindex vaults and Blend pools, with live APY, wallet balance, over-spend
  guards, and auto-trustline on deposit; `usePollar()` mirrors the earn methods
- `<RampWidget>` - buy/sell flow over the v3 ramp orders: lists the routes, quotes them, creates the order and follows
  it, signing a leg only on a user press; a route with a pending requirement step is listed locked and the widget opens
  that step
- `<RequirementFormModal>`, `<RegistryCheckModal>`, `<ProviderRegistrationModal>` - the FORM, REGISTRY_CHECK (SEGIP) and
  PROVIDER_REGISTRATION steps a ramp route can require, as standalone modals for consumers who build their own route list
- `<KycModal>` - identity verification: hosted (iframe or redirect) flow per option, corridor-scoped when a ramp route
  asks for it, with review, expiry and retry states; `openKycModal()` without a corridor walks the app's own KYC steps
- Transaction history modal (`openTxHistoryModal()`, `TxHistoryModalTemplate`) - paginated multichain viewer with auto-fetch on open, a network picker that
  filters server-side, per-chain explorer links (stellar.expert for Stellar, explorer.solana.com for Solana), and the
  unified `{ amount, unit }` fee per row
- `<WalletBalanceModal>` - multichain wallet balances (Stellar, Polygon, Solana): a `<ChainSelect>` picks the network and the rows are scoped to it; an unreadable chain shows a dash, never `0`
- `<EnabledAssetsModal>` - the app's dashboard-enabled assets for the network picked in the header, with per-asset
  trustline state; establish/remove trustlines (Stellar only; other chains are informational)
- `<DistributionRulesModal>` - manage the wallet's distribution rules
- `<CardModal>` - cards from the app's card providers: the provider's steps, sign-up, issuing, the card with its balance
  and movements, funding from the wallet on Stellar or Solana, revealing and copying the details; `openCardModal()`
  from `usePollar()`
- `<CosignModal>`, `<RecoveryModal>`, `<CustodyMigrationModal>` - the co-signed wallet approval, the recovery methods
  of a Turnkey wallet and the move of a custodial wallet to Turnkey
- `<ChainSelect>` - the shared network picker, exported alongside `chainsOf()` / `addressForChain()` / `resolveChain()`
  so you can drive the templates that take `chains` / `selectedChain` / `onSelectChain` yourself
- `useChains()` - the recommended hook for the app's configured chain order and primary address (returns
  `{ chains, primaryChain, primaryAddress, ready }`); what the built-in wallet button and pickers read from
- `<SessionsModal>` - drop-in active-sessions UI: lists every refresh-token family for the current user, per-row
  revoke, and a "Sign out everywhere" button
- `createPollarAdapterHook(key)` - factory for fully-typed hooks that wrap custom adapters with automatic XDR signing;
  an adapter that answers with a Soroban auth entry gets it signed without submitting anything
- Every modal in English, Spanish and Portuguese: the dashboard's language, else the `language` prop, else the
  client's `locale`, else the browser
- Template components for every modal - pure presentational layer for fully custom UIs
- Bundled stylesheet (`@pollar/react/styles.css`) with `pollar-` namespaced class names
- Peer dependencies on `@pollar/core ^0.12.1` and React >= 18

```bash
npm install @pollar/react @pollar/core
```

---

### [`@pollar/react-native`](./packages/react-native)

**Version:** `0.12.1` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/react-native)

React Native bindings built on top of `@pollar/core`: the same provider-and-hook model as `@pollar/react`, with
components styled through `StyleSheet`.

**Key features:**

- `<PollarProvider>` - creates the client and mounts the login, transaction, KYC, ramp, tx history and wallet balance
  modals; accepts `adapters` for custom signing flows
- `usePollar()` - session state, `login`, `logout`, `buildTx` / `signAndSubmitTx`, balances, tx history, network,
  the swap methods (Stellar and Solana) and modal entry points
- `<WalletButton>` - opens the login modal, or shows the address with balance, history and logout
- `<RampWidget>` with the same requirement-step gate as the web widget, "Change amount" and "Get a new quote", and
  the step modals (`<RequirementFormModal>`, `<RegistryCheckModal>`, `<ProviderRegistrationModal>`)
- Every modal, `AppShell` and `AccountOnboarding` in English, Spanish and Portuguese; `AppShell`'s language toggle
  cycles through the three
- Template components for every modal, for fully custom UIs
- Storage (Keychain / SecureStore), OAuth opener and polyfills are configured through `@pollar/core`; see the package
  README
- `<CardModal>` - the same card flow as the web one; the card number is decrypted on the device without WebCrypto
- Peer dependencies on `@pollar/core ^0.12.1`, React 18 or 19, React Native >= 0.72,
  `react-native-safe-area-context >= 4` and `react-native-svg >= 13`; versioned with `@pollar/core` and `@pollar/react`

```bash
npm install @pollar/react-native @pollar/core react-native-safe-area-context react-native-svg
```

---

### [`@pollar/privy-adapter`](./packages/privy-adapter)

**Version:** `0.11.1` (core `^0.11.1`; no 0.12 release) &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/privy-adapter)

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
- For server-side signing instead, use `@pollar/privy-server-adapter` below

```bash
npm install @pollar/privy-adapter @pollar/core @stellar/stellar-sdk @privy-io/react-auth react react-dom
```

---

### [`@pollar/privy-server-adapter`](./packages/privy-server-adapter)

**Version:** `0.10.0-rc.10` (published on npm as `latest`) &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/privy-server-adapter)

Server-side Privy adapter. A stateless HTTP proxy that lets Pollar sign Stellar or Solana transactions through your **Privy**
server-wallet account without your `PRIVY_APP_SECRET` ever leaving your infrastructure. You run it in your own backend
and point Pollar at its URL.

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

**Version:** `0.10.1` (core `^0.10.1`; no 0.12 release) &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/accesly-adapter)

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

**Version:** `0.12.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/stellar-wallets-kit-adapter)

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
- Peer deps: `@creit.tech/stellar-wallets-kit@^2.0.0` and `@pollar/core@^0.11.2 || ^0.12.0` (the kit is **not** bundled)

```bash
npm install @pollar/stellar-wallets-kit-adapter @pollar/core @creit.tech/stellar-wallets-kit
```

---

### [`@pollar/solana-wallet-standard-adapter`](./packages/solana-wallet-standard-adapter)

**Version:** `0.12.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/solana-wallet-standard-adapter)

The Solana counterpart to `@pollar/stellar-wallets-kit-adapter`. Connects user-controlled Solana wallets (Phantom,
Solflare, Backpack, ...) to `@pollar/core` through the [Wallet Standard](https://github.com/wallet-standard/wallet-standard),
without bundling any wallet SDK into `@pollar/core`. Login uses **SIWS (Sign In With Solana)** via each wallet's native
`solana:signIn` feature - the Solana analogue of Stellar's SEP-10 challenge.

**Key features:**

- `solanaWalletStandardAdapters(options?)` - discovers every installed Solana wallet and returns one `WalletAdapter`
  each to pass to `PollarClientConfig.walletAdapters`; SSR-safe (returns `[]` when there is no `window`)
- `SolanaWalletStandardAdapter` - direct `WalletAdapter` implementation for use outside `PollarClient`
- Peer dep: `@pollar/core@^0.11.2 || ^0.12.0` only. The `@wallet-standard/*` packages and `@solana/wallet-standard-features` are
  bundled as regular dependencies, so consumers don't install them; no wallet SDK is bundled

```bash
npm install @pollar/solana-wallet-standard-adapter @pollar/core
```

---

### [`@pollar/migrate`](./packages/migrate)

**Version:** `0.12.0` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/migrate)

Upgrade tool for apps on any `@pollar` release from 0.5 onwards. It reads the app's code, reports every change the
upgrade to 0.12 needs file by file, and applies the mechanical ones with `--fix`.

```bash
npx @pollar/migrate            # report only, nothing is written
npx @pollar/migrate --fix      # apply the mechanical changes
```

---

## Repository Structure

```
@pollar/
  packages/
    core/                            # @pollar/core - framework-agnostic SDK
    react/                           # @pollar/react - React bindings and UI components
    react-native/                    # @pollar/react-native - React Native bindings and native modals
    privy-adapter/                   # @pollar/privy-adapter - client-side Privy wallet adapter (web + RN)
    privy-server-adapter/            # @pollar/privy-server-adapter - server-side Privy signing proxy
    accesly-adapter/                 # @pollar/accesly-adapter - client-side Accesly smart-wallet adapter
    stellar-wallets-kit-adapter/     # @pollar/stellar-wallets-kit-adapter - Stellar Wallets Kit bridge
    solana-wallet-standard-adapter/  # @pollar/solana-wallet-standard-adapter - Solana Wallet Standard bridge
    migrate/                         # @pollar/migrate - upgrade codemod (npx @pollar/migrate)
  examples/                          # Example apps (custom-ramp, privy-web, solana-web)
  docs/                              # Index of the package READMEs, ADRs, design and development notes
  scripts/                           # release-rc.sh and release-tag.sh
  tests/                             # Smoke tests for the built SDK
  turbo.json                         # Turborepo pipeline configuration
  tsconfig.base.json                 # Shared TypeScript base configuration
```

---

## Development

This monorepo uses [Turborepo](https://turbo.build/repo) for task orchestration and [npm](https://docs.npmjs.com/cli/v10)
workspaces as the package manager (pinned via `packageManager` in the root `package.json`).

### Prerequisites

- Node.js >= 20 (matches the `engines` floor declared by every published package); `.nvmrc` pins 24.17.0 for local
  development and CI
- npm 10 (`packageManager` pins `npm@10.9.4`)

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

### Run the tests

```bash
npm run test:unit    # @pollar/core unit tests
npm run test:smoke   # builds every package, then runs the smoke tests in tests/ against the build
```

`npm test --workspace=@pollar/react-native` runs the React Native behavior tests.

### Try a local build in an app

```bash
npm run dev:push
```

Builds every package and publishes the SDK packages and adapters to the local [yalc](https://github.com/wclr/yalc)
store; run `yalc add @pollar/core @pollar/react` (or the packages the app uses) in the app.

### Release a candidate

```bash
npm run release:rc -- 0.12.1-rc.3
```

Tags the current commit as `v0.12.1-rc.3` and pushes the tag, which runs
`.github/workflows/release-rc.yml` (build, unit + smoke tests, publish `@pollar/core`, `@pollar/react`,
`@pollar/react-native`, `@pollar/stellar-wallets-kit-adapter` and `@pollar/solana-wallet-standard-adapter` to npm on
the `next` dist-tag) and `.github/workflows/e2e-rc.yml`. Nothing is published from your machine.

The script refuses to tag unless:

- the version is `X.Y.Z-rc.N` and `X.Y.Z` matches `packages/core/package.json` on this commit
- the working tree is clean
- `HEAD` is already on a remote branch (push it first)
- the tag does not exist locally or on `origin`

The workflow can also be started by hand from the Actions tab (`workflow_dispatch` with a
`version` input).

### Tag a stable release

Publish the stable packages first with their `*:publish` scripts, `core` before the packages that depend on it. Then:

```bash
npm run release:tag
```

Tags the current commit as `v<version>`, the version in `packages/core/package.json`, and pushes the tag. It publishes
nothing and starts no workflow. The script refuses to tag unless:

- the version is a stable `X.Y.Z`, with no `-rc`
- `@pollar/core` at that version is already on npm
- the working tree is clean
- `HEAD` is already on a remote branch (push it first)
- the tag does not exist locally or on `origin`

---

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE). Versions published before 0.11.4 were released under MIT.
