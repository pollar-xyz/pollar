# @pollar/accesly-adapter

[Accesly](https://github.com/Accesly/SDKAccesly) Smart Account adapter for
[`@pollar/core`](../core). Lets a user sign Stellar transactions with their
**Accesly Smart Account** (a C-address Soroban contract secured by passkey +
Shamir-MPC), client-side.

## Smart, but client-signed

Accesly is a self-custodial **smart wallet**: Accesly deploys and manages the
C-address contract, and the user signs via Accesly's SDK (passkey unlock →
Shamir-reconstructed ed25519 seed). So the adapter reports `custody: 'smart'`, but
signing/submitting happens **client-side + RPC** — Pollar never holds the key and
does **not** deploy/sponsor/submit through wallet-service (that path is only for
Pollar's _own_ smart wallets).

## Install

```bash
npm i @pollar/accesly-adapter @pollar/core @accesly/react @accesly/core
```

## Usage

`signRawXdr` lives behind Accesly's React hook, so you wire it in your component
and hand the adapter a bound `signXdr`:

```tsx
import { useAccesly } from '@accesly/react';
import { createAcceslyAdapter } from '@pollar/accesly-adapter';
import { PollarClient } from '@pollar/core';

function makeClient(acceslyAddress: string, username: string) {
  const { wallet, tx } = useAccesly();

  const accesly = createAcceslyAdapter({
    address: acceslyAddress, // the Accesly C-address
    signXdr: async (transactionXdr) => {
      const { ed25519Seed, expectedPublicKey } = await wallet.unlockForSigning(username);
      const { signedXdr } = await tx.signRawXdr({ transactionXdr, ed25519Seed, expectedPublicKey });
      return signedXdr;
    },
  });

  return new PollarClient({
    apiKey: '…',
    walletAdapters: [accesly], // shows an "Accesly" button; login({ provider: 'accesly' })
  });
}
```

## API

### `createAcceslyAdapter(options): WalletAdapter`

| option    | type                       | notes                                                |
| --------- | -------------------------- | ---------------------------------------------------- |
| `address` | `string`                   | the Accesly Smart Account C-address                  |
| `signXdr` | `(xdr) => Promise<string>` | signs a full XDR via Accesly; returns the signed XDR |
| `meta?`   | `{ label; iconUrl? }`      | login button; defaults to `{ label: 'Accesly' }`     |

## ⚠️ Pending confirmation

This adapter assumes Accesly's `signRawXdr` signs an **arbitrary** Pollar-built
XDR for the account. If Accesly only signs txs built by its own SDK (`send`,
`swap`), Pollar's generic `buildTx` flow won't apply and Accesly would need to
own the transaction flow instead. End-to-end **login** also requires Pollar's
SEP-10 backend to accept contract-account (C-address) authentication.
