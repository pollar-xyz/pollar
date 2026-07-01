# @pollar/stellar-wallets-kit-adapter

Plug [Stellar Wallets Kit](https://stellarwalletskit.dev) into [`@pollar/core`](../core) as a single wallet adapter, without `@pollar/core` having to depend on the kit. One install gives Pollar access to **every wallet module the kit supports** — Freighter, Albedo, xBull, Lobstr, Rabet, Hana, Bitget, OneKey, Klever, Fordefi, CactusLink, HotWallet, plus Ledger / Trezor / WalletConnect via opt-in.

The adapter is consumed through the `walletAdapter` slot on `PollarClientConfig`, so swapping wallet stacks (built-in adapters → kit, kit → custom resolver) is a one-line change.

## Installation

```bash
npm install @pollar/stellar-wallets-kit-adapter @creit.tech/stellar-wallets-kit
```

`@pollar/core` and `@creit.tech/stellar-wallets-kit` are peer dependencies — install whichever versions match the rest of your app. Requires Node 20+ when running in toolchains.

## Quick start

```ts
import { PollarClient } from '@pollar/core';
import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

const client = new PollarClient({
  apiKey: 'your-api-key',
  walletAdapter: stellarWalletsKit({ network: Networks.PUBLIC }),
});

// Triggers the kit's flow for the picked wallet id
client.loginWallet('xbull');
```

With React:

```tsx
import { PollarProvider } from '@pollar/react';
import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

<PollarProvider
  client={{
    apiKey: 'your-api-key',
    walletAdapter: stellarWalletsKit({ network: Networks.TESTNET }),
  }}
>
  {/* your app */}
</PollarProvider>;
```

This wires the **signing path** but the built-in `LoginModal` still shows
only Freighter / Albedo. To render the kit's full wallet list (xBull, Lobstr,
Rabet, …) inside `LoginModal`, also pass the picker — see
[Wallet picker UI (`/picker`)](#wallet-picker-ui-picker) below.

The kit is a global singleton. `stellarWalletsKit(...)` returns a resolver and `StellarWalletsKit.init(...)` is called once on the first `loginWallet` call.

> **0.9.0** — `connect()` resolves to `{ address }` only (the duplicate
> `publicKey` field is gone, matching the new `ConnectWalletResponse`). Requires
> `@pollar/core@^0.9.0` / `@pollar/react@^0.9.0`. Adds `logLevel` / `logger`
> options (set once at init — the kit is a global singleton).
>
> **0.8.0** — `network` is **required**. The previous `Networks.TESTNET`
> default was removed because the kit is a global singleton, and silently
> picking testnet for the consumer risked signing real-looking transactions
> on the wrong chain. Pass `Networks.TESTNET` or `Networks.PUBLIC` explicitly.

## Default wallets

Calling `stellarWalletsKit({ network })` with no `modules` argument enables every module that loads without extra configuration:

| Module             | Wallet id (`WalletId`) | Type               |
| ------------------ | ---------------------- | ------------------ |
| `AlbedoModule`     | `albedo`               | Web                |
| `BitgetModule`     | `bitget`               | Browser extension  |
| `CactusLinkModule` | `cactuslink`           | Browser extension  |
| `FordefiModule`    | `fordefi`              | Browser extension  |
| `FreighterModule`  | `freighter`            | Browser extension  |
| `HanaModule`       | `hana`                 | Browser extension  |
| `HotWalletModule`  | `hotwallet`            | Mobile / deep link |
| `KleverModule`     | `klever`               | Browser extension  |
| `LobstrModule`     | `lobstr`               | Mobile / deep link |
| `OneKeyModule`     | `onekey`               | Browser extension  |
| `RabetModule`      | `rabet`                | Browser extension  |
| `xBullModule`      | `xbull`                | Browser extension  |

> **Why not Ledger / Trezor / WalletConnect by default?** Ledger needs a `Buffer` polyfill in the host app (loading it unconditionally would crash bundles that don't ship one). Trezor and WalletConnect require constructor parameters (Trezor manifest, WalletConnect project id). All three stay opt-in.

## Adding extra wallets

Pass your own `modules` list. Import from the kit's per-wallet subpaths so unused modules tree-shake out:

```ts
import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { WalletConnectModule } from '@creit.tech/stellar-wallets-kit/modules/wallet-connect';

const client = new PollarClient({
  apiKey: 'your-api-key',
  walletAdapter: stellarWalletsKit({
    network: Networks.PUBLIC,
    modules: [
      new FreighterModule(),
      new xBullModule(),
      new WalletConnectModule({
        url: 'https://example.com',
        projectId: 'your-walletconnect-project-id',
        method: WalletConnectAllowedMethods.SIGN,
        description: 'Sign in to Example with Stellar',
        name: 'Example',
        icons: ['https://example.com/icon.png'],
        network: WalletNetwork.PUBLIC,
      }),
    ],
  }),
});
```

Trimming the default list (e.g. only Freighter + Albedo for a SEP-43 dapp) works the same way — `modules` fully replaces the default when supplied.

## Configuration

```ts
interface StellarWalletsKitAdapterOptions {
  /**
   * Stellar network used for signing. **Required** as of 0.8.0 — the kit is a
   * global singleton, so the network must be chosen explicitly to avoid
   * cross-chain signing accidents.
   */
  network: Networks;

  /**
   * Wallet modules the kit can drive. Defaults to every module that works
   * with no extra setup (see "Default wallets"). Passing this option fully
   * replaces the default — include modules you want explicitly.
   */
  modules?: ModuleInterface[];

  /**
   * Picker-specific options. Only consumed by `<KitWalletPicker>` /
   * `createStellarWalletsKitBundle` (the `/picker` subpath). The resolver
   * itself ignores them.
   */
  picker?: KitPickerOptions;
}

interface KitPickerOptions {
  /** Subset of wallet ids to show. Defaults to every wallet the kit reports. */
  wallets?: string[];
  /** Render order. Default `'as-given'` (the kit's own order). */
  order?: 'as-given' | 'installed-first' | 'alphabetical';
  /** Hide wallets whose `isAvailable` is false. Default `false`. */
  showInstalledOnly?: boolean;
  /** Per-wallet label overrides. Key = wallet id. */
  labels?: Record<string, string>;
  /** Visual layout. Default `'grid'`. */
  layout?: 'grid' | 'list';
  /** Theme passthrough — applied as CSS custom properties on the picker root. */
  theme?: { accent?: string; mode?: 'light' | 'dark' };
}
```

The factory returns a `WalletAdapterResolver` from `@pollar/core`:

```ts
type WalletAdapterResolver = (id: WalletId) => WalletAdapter | Promise<WalletAdapter>;
```

`WalletId` is `WalletType | (string & {})` — `WalletType.FREIGHTER` / `WalletType.ALBEDO` keep autocomplete, every other kit id (`'xbull'`, `'lobstr'`, …) is accepted as a plain string.

## How it fits the Pollar wallet contract

The adapter implements `WalletAdapter` from `@pollar/core`:

| `WalletAdapter` method       | Kit call                                       |
| ---------------------------- | ---------------------------------------------- |
| `isAvailable()`              | `StellarWalletsKit.setWallet(id)`              |
| `connect()`                  | `setWallet(id)` → `fetchAddress()`             |
| `disconnect()`               | `StellarWalletsKit.disconnect()`               |
| `getPublicKey()`             | `StellarWalletsKit.getAddress()`               |
| `signTransaction(xdr, opts)` | `setWallet(id)` → `signTransaction(xdr, opts)` |
| `signAuthEntry(xdr, opts)`   | `setWallet(id)` → `signAuthEntry(xdr, opts)`   |

`setWallet` is called before every operation so a single `StellarWalletsKit.init({ modules })` covers many wallets — `PollarClient` resolves a fresh adapter instance per `WalletId`, and the kit routes to the correct module under the hood.

## Login UI

The wallets you register via `stellarWalletsKitAdapters({ network })` render
automatically inside Pollar's `LoginModal` — one button per wallet, collapsed
behind a single "Wallet" gateway button (their shared `meta.group`). Pass
`picker.groupLabel` to give them a distinct gateway, or `picker.labels` to
override individual button labels.

```tsx
import { PollarProvider } from '@pollar/react';
import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

<PollarProvider
  client={{
    apiKey: 'your-api-key',
    walletAdapters: stellarWalletsKitAdapters({
      network: Networks.PUBLIC,
      picker: { wallets: ['xbull', 'lobstr', 'freighter'] },
    }),
  }}
>
  {/* your app */}
</PollarProvider>;
```

## Direct adapter access

If you need a `WalletAdapter` instance directly (custom flows outside `PollarClient`), instantiate it yourself once the kit is initialized:

```ts
import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { StellarWalletsKitAdapter } from '@pollar/stellar-wallets-kit-adapter';

StellarWalletsKit.init({ network: Networks.PUBLIC, modules: [new FreighterModule()] });

const adapter = new StellarWalletsKitAdapter('freighter');
const { address } = await adapter.connect();
```

## Writing a custom resolver

`walletAdapter` accepts any function matching `WalletAdapterResolver`. Use this to swap between the kit and your own implementation per-id, or to compose multiple adapter packages:

```ts
import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';
import { FreighterAdapter, WalletType } from '@pollar/core';

const kit = stellarWalletsKit({ network: Networks.PUBLIC });

new PollarClient({
  apiKey: 'your-api-key',
  walletAdapter: (id) => {
    // Use the in-house Freighter adapter, kit for everything else
    if (id === WalletType.FREIGHTER) return new FreighterAdapter();
    return kit(id);
  },
});
```

## Fallback behaviour

If `walletAdapter` is omitted from `PollarClientConfig`, `@pollar/core` falls back to its built-in `FreighterAdapter` / `AlbedoAdapter`. Installing this package is opt-in — existing apps keep working without changes until they switch the slot.

## License

MIT
