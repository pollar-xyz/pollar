# @pollar/solana-wallet-standard-adapter

Connect user-controlled Solana wallets (Phantom, Solflare, Backpack, ...) to
`@pollar/core` through the [Wallet Standard](https://github.com/wallet-standard/wallet-standard),
the headless substrate that `@solana/wallet-adapter` is built on. No wallet SDK is
bundled into `@pollar/core`.

This is the Solana counterpart to `@pollar/stellar-wallets-kit-adapter`. Login uses
**SIWS (Sign In With Solana)** via the wallet's native `solana:signIn` feature -
the Solana analogue of Stellar's SEP-10 challenge.

> Status: phase-0 scaffold. The client-side adapter (discovery, connect, SIWS,
> message/transaction signing) is implemented against the Wallet Standard. Wiring
> into `PollarClient` waits on the chain-aware adapter contract in `@pollar/core`
> and the SIWS endpoints in sdk-api. See
> `system/docs/2026-07-15-solana-external-wallet-adapter-siws-plan.md`.

## Usage (target API)

```ts
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
