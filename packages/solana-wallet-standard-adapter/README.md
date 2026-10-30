# @pollar/solana-wallet-standard-adapter

Connect user-controlled Solana wallets (Phantom, Solflare, Backpack, ...) to
`@pollar/core` through the [Wallet Standard](https://github.com/wallet-standard/wallet-standard),
the headless substrate that `@solana/wallet-adapter` is built on. No wallet SDK is
bundled into `@pollar/core`.

This is the Solana counterpart to `@pollar/stellar-wallets-kit-adapter`. Login uses
**SIWS (Sign In With Solana)** via the wallet's native `solana:signIn` feature -
the Solana analogue of Stellar's SEP-10 challenge.

## Solana

Pollar runs on Solana end to end for wallets and payments:

- **Sign in** with Phantom, Solflare or Backpack (Sign In With Solana, via `@pollar/solana-wallet-standard-adapter`), or
  with email / Google / GitHub to get a **Pollar-managed Solana wallet**, with no seed phrase.
- **Turnkey co-signed wallets** (mainnet): every signature is a 2-of-2 vote between the user's device and Pollar, and the
  device verifies the transaction, including Solana CCTP burns, before it votes.
- **Hold, send and receive SOL and SPL tokens** with `sendPayment()` and the drop-in React modals, with **app-sponsored
  fees** and token accounts created for the recipient.
- **Fiat on/off-ramps to Solana**: Bolivia (BOB, via Stereum + CCTP) and Brazil (BRL via Pix, PagFinance).

> **0.12.0** accepts `@pollar/core@^0.11.2 || ^0.12.0`. A session restored after a
> reload signs without reconnecting, and a wallet without `solana:signIn` logs in
> through `signMessage`.
>
> **0.11.5** is the adapter's first release on npm, on the SDK's version line. It
> requires `@pollar/core@^0.11.2`; no adapter changes since 0.11.2.
>
> **0.11.2** requires `@pollar/core@^0.11.2` (peer range bump only; no adapter
> changes).
>
> **0.11.1** introduced the adapter. It declares
> `chain: 'SOLANA'`, which is what routes `login({ provider })` through the SIWS
> flow instead of Stellar's SEP-10 challenge - end to end, discovery through
> login.

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

const client = new PollarClient({
  apiKey: '...',
  walletAdapters: [...solanaWalletStandardAdapters()],
});
```

`solanaWalletStandardAdapters()` discovers every installed Solana wallet and returns one
adapter each. It is SSR-safe (returns `[]` when `window` is undefined), so build
the `PollarClient` on the client.

### Alongside Stellar wallets

`walletAdapters` is one flat list, so Stellar and Solana wallets coexist in it.
That needs two packages the install command above does not cover -
`@pollar/stellar-wallets-kit-adapter` and its own peer
`@creit.tech/stellar-wallets-kit`:

```bash
npm install @pollar/stellar-wallets-kit-adapter @creit.tech/stellar-wallets-kit
```

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
