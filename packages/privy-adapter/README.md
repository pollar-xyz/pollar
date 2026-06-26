# @pollar/privy-adapter

Client-side [Privy](https://privy.io) wallet adapter for [`@pollar/core`](../core).
Lets a user sign Stellar transactions with their **Privy embedded Stellar wallet**
through Privy's raw-hash signing — Pollar wraps the signature into a Stellar
`DecoratedSignature` and runs the standard SEP-10 login + tx flow.

> Server-side custody (signing through your Privy app secret on your backend) is
> a different package: [`@pollar/privy-server-adapter`](../privy-server-adapter).

## Install

```bash
npm i @pollar/privy-adapter @pollar/core @stellar/stellar-sdk @privy-io/react-auth
```

## How it works

Privy exposes Stellar signing on the client via the `useSignRawHash` hook
(`@privy-io/react-auth/extended-chains`, `chainType: 'stellar'`). Because that's
a React hook, you extract `signRawHash` (and the user's Stellar wallet address)
in your component and hand both to `createPrivyAdapter`. The adapter is otherwise
framework-agnostic.

```tsx
import { useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { createPrivyAdapter } from '@pollar/privy-adapter';
import { PollarClient } from '@pollar/core';

function makeClient(stellarAddress: string) {
  const { signRawHash } = useSignRawHash();
  const privy = createPrivyAdapter({ address: stellarAddress, signRawHash });

  return new PollarClient({
    apiKey: '…',
    walletAdapters: [privy], // shows a "Privy" button; login({ provider: 'privy' })
  });
}
```

The user's Privy Stellar wallet is created/owned on Privy's side (e.g. via your
backend with `@pollar/privy-server-adapter`, or Privy's wallet provisioning). This
adapter only needs its **address** and the **`signRawHash`** function.

## API

### `createPrivyAdapter(options): WalletAdapter`

| option | type | notes |
|---|---|---|
| `address` | `string` | the user's Privy Stellar G-address |
| `signRawHash` | `PrivySignRawHash` | from Privy's `useSignRawHash()` |
| `networkPassphrase?` | `string` | fallback; the SDK passes the app's passphrase per call |
| `meta?` | `{ label; iconUrl? }` | login button; defaults to `{ label: 'Privy' }` |

`signTransaction` parses the XDR, signs `tx.hash()` via Privy (`chainType:
'stellar'`), and appends the decorated signature. `signAuthEntry` throws — Privy
external wallets are classic G-addresses, not Soroban smart accounts.
