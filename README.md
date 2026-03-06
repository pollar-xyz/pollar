# @pollar

Official SDK monorepo for [Pollar](https://pollar.xyz) — authentication and transaction infrastructure for Stellar-based applications.

This repository is managed with [Turborepo](https://turbo.build/repo) and contains the following published packages.

---

## Packages

### [`@pollar/core`](./packages/core)

**Version:** `0.4.3` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/core)

Framework-agnostic TypeScript SDK. Provides the `PollarClient` class and all lower-level utilities needed to integrate Pollar authentication and Stellar transactions into any JavaScript environment.

**Key features:**

- Authentication via Google, GitHub, Email OTP, and Stellar wallets (Freighter, Albedo)
- Stellar transaction building and submission through the Pollar API
- Real-time state management with a typed event system (`onStateChange`)
- `StellarClient` for querying account balances via Horizon
- Direct wallet adapters (`FreighterAdapter`, `AlbedoAdapter`)
- Full TypeScript typings, ships with ESM and CJS builds

```bash
npm install @pollar/core
```

---

### [`@pollar/react`](./packages/react)

**Version:** `0.4.3` &nbsp;|&nbsp; **Registry:** [npm](https://www.npmjs.com/package/@pollar/react)

React bindings built on top of `@pollar/core`. Provides a context provider, hook, and pre-built UI components for drop-in authentication in React applications.

**Key features:**

- `<PollarProvider>` — wraps your app and initialises the Pollar client
- `usePollar()` — hook exposing session state, `login`, and `logout`
- `<WalletButton>` — ready-made button that opens the authentication modal
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
├── turbo.json         # Turborepo pipeline configuration
└── tsconfig.base.json # Shared TypeScript base configuration
```

---

## Development

This monorepo uses [Turborepo](https://turbo.build/repo) for task orchestration and [pnpm](https://pnpm.io) as the package manager.

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