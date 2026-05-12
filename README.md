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
- KYC verification flow — provider selection, session start, and status polling *(not yet implemented on backend)*
- On/off-ramp support — quote fetching and on-ramp initiation *(not yet implemented on backend)*
- Transaction history — paginated fetch with status tracking
- Direct wallet adapters (`FreighterAdapter`, `AlbedoAdapter`)
- `EscrowFn`, `EscrowAdapter`, and `PollarAdapters` types — generic adapter contract for custom signing flows (e.g.
  Trustless Work SDK)
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
- `<KycModal>` — identity verification flow with provider selection and status polling *(UI preview — backend coming
  soon)*
- `<RampWidget>` — buy/sell crypto with route comparison and payment instructions *(UI preview — backend coming soon)*
- `<TxHistoryModal>` — paginated transaction history viewer with auto-fetch on open and stellar.expert explorer links
- `<WalletBalanceModal>` — Stellar account balance display
- `createPollarAdapterHook(key)` — factory for fully-typed hooks that wrap custom adapters with automatic XDR signing
- Template components for every modal — pure presentational layer for fully custom UIs
- Bundled stylesheet (`@pollar/react/styles.css`) with `pollar-` namespaced class names
- Peer dependency on React >= 18

```bash
npm install @pollar/react @pollar/core
```

---

## Repository Structure

```
@pollar/
├── packages/
│   ├── core/          # @pollar/core — framework-agnostic SDK
│   └── react/         # @pollar/react — React bindings and UI components
├── docs/              # API reference documentation
├── turbo.json         # Turborepo pipeline configuration
└── tsconfig.base.json # Shared TypeScript base configuration
```

---

## Development

This monorepo uses [Turborepo](https://turbo.build/repo) for task orchestration and [pnpm](https://pnpm.io) as the
package manager.

### Prerequisites

- Node.js >= 18
- pnpm >= 9

### Install dependencies

```bash
pnpm install
```

### Build all packages

```bash
pnpm build
```

### Build in watch mode

```bash
pnpm dev
```

### Type-check all packages

```bash
pnpm lint
```

### Clean build artifacts

```bash
pnpm clean
```

---

## License

MIT
