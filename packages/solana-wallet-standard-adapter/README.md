# @pollar/solana-wallet-standard-adapter

Connect user-controlled Solana wallets (Phantom, Solflare, Backpack, ...) to
`@pollar/core` through the [Wallet Standard](https://github.com/wallet-standard/wallet-standard),
the headless substrate that `@solana/wallet-adapter` is built on. No wallet SDK is
bundled into `@pollar/core`.

This is the Solana counterpart to `@pollar/stellar-wallets-kit-adapter`. Login uses
**SIWS (Sign In With Solana)** via the wallet's native `solana:signIn` feature -
the Solana analogue of Stellar's SEP-10 challenge.

> **0.11.1** is the first published release. The adapter declares
> `chain: 'SOLANA'`, which is what routes `login({ provider })` through the SIWS
> flow instead of Stellar's SEP-10 challenge - end to end, discovery through
> login. Requires `@pollar/core@^0.11.1`.

## Installation

```bash
npm install @pollar/solana-wallet-standard-adapter @pollar/core
```

`@pollar/core` is the only peer dependency. The `@wallet-standard/*` packages and
`@solana/wallet-standard-features` are real dependencies of this adapter, so you
do not install them yourself.

## Usage

```ts
import { PollarClient } from '@pollar/core';
import { solanaWalletStandardAdapters } from '@pollar/solana-wallet-standard-adapter';
import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

const client = new PollarClient({
  apiKey: '...',
  walletAdapters: [...stellarWalletsKitAdapters({ network: Networks.PUBLIC }), ...solanaWalletStandardAdapters()],
});
```

`solanaWalletStandardAdapters()` discovers every installed Solana wallet and returns one
adapter each. It is SSR-safe (returns `[]` when `window` is undefined), so build
the `PollarClient` on the client.

### Options

- `wallets?: string[]` - include only these wallet names (default: all found).
- `labels?: Record<string, string>` - per-wallet button-label overrides.
- `groupLabel?: string` - the login-UI gateway label these wallets share
  (default `'Solana Wallet'`).

### `SolanaWalletStandardAdapter`

The class behind the factory, exported for direct use outside `PollarClient`.
Beyond the shared `WalletAdapter` contract it carries the Solana-specific
surface:

| Member                      | Purpose                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `chain`                     | Always `'SOLANA'` - what routes login through SIWS                                                            |
| `supportsSignIn`            | Whether the wallet exposes the native `solana:signIn` feature                                                 |
| `signIn(input)`             | SIWS login; throws if the wallet lacks `solana:signIn` (check `supportsSignIn` first, then use `signMessage`) |
| `signMessage(message)`      | Raw message signing                                                                                           |
| `signSolanaTransaction(tx)` | Signs a Solana transaction (sponsored external transfers)                                                     |
