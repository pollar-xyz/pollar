# @pollar/stellar-wallets-kit-adapter

Plug [Stellar Wallets Kit](https://stellarwalletskit.dev) into [`@pollar/core`](../core) as a set of wallet adapters, without `@pollar/core` having to depend on the kit. One install gives Pollar access to **every wallet module the kit supports** — Freighter, Albedo, xBull, Lobstr, Rabet, Hana, Bitget, OneKey, Klever, Fordefi, CactusLink, HotWallet, plus Ledger / Trezor / WalletConnect via opt-in.

The adapters are registered through the `walletAdapters` slot on `PollarClientConfig`. `stellarWalletsKitAdapters()` returns a `WalletAdapter[]` (one adapter per kit module) that you spread into that array alongside any other adapters you register.

## Installation

```bash
npm install @pollar/stellar-wallets-kit-adapter @creit.tech/stellar-wallets-kit
```

`@pollar/core` and `@creit.tech/stellar-wallets-kit` are peer dependencies — install whichever versions match the rest of your app. Requires Node 20+ when running in toolchains.

## Quick start

```ts
import { PollarClient } from '@pollar/core';
import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

const client = new PollarClient({
  apiKey: 'your-api-key',
  walletAdapters: stellarWalletsKitAdapters({ network: Networks.PUBLIC }),
});

// Log in with one of the registered kit wallets
client.login({ provider: 'xbull' });
```

With React:

```tsx
import { PollarProvider } from '@pollar/react';
import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';

<PollarProvider
  client={{
    apiKey: 'your-api-key',
    walletAdapters: stellarWalletsKitAdapters({ network: Networks.TESTNET }),
  }}
>
  {/* your app */}
</PollarProvider>;
```

Every wallet you register this way renders as its own button inside Pollar's
`LoginModal` (collapsed behind a shared "Wallet" gateway) - see
[Login UI](#login-ui) below.

The kit is a global singleton. `stellarWalletsKitAdapters(...)` returns a
`WalletAdapter[]` and runs `StellarWalletsKit.init(...)` synchronously at call
time (via `ensureInit()`), building one `StellarWalletsKitAdapter` per module up
front. It is not lazy - a later `login({ provider })` just routes to the
matching adapter that was already built.

> **0.10.0** - switched to the `walletAdapters[]` array model: the factory is now
> `stellarWalletsKitAdapters()` (was `stellarWalletsKit()`) and returns a
> `WalletAdapter[]` for the plural `walletAdapters` config slot instead of a
> single resolver for `walletAdapter`. SSR-safe: returns `[]` when there is no
> `window`. Requires `@pollar/core@^0.10.0` / `@pollar/react@^0.10.0`.
>
> **0.9.0** - `connect()` resolves to `{ address }` only (the duplicate
> `publicKey` field is gone, matching the new `ConnectWalletResponse`). Adds
> `logLevel` / `logger` options (set once at init - the kit is a global singleton).
>
> **0.8.0** — `network` is **required**. The previous `Networks.TESTNET`
> default was removed because the kit is a global singleton, and silently
> picking testnet for the consumer risked signing real-looking transactions
> on the wrong chain. Pass `Networks.TESTNET` or `Networks.PUBLIC` explicitly.

## Default wallets

Calling `stellarWalletsKitAdapters({ network })` with no `modules` argument enables every module that loads without extra configuration (12 in total):

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
import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { WalletConnectModule } from '@creit.tech/stellar-wallets-kit/modules/wallet-connect';

const client = new PollarClient({
  apiKey: 'your-api-key',
  walletAdapters: stellarWalletsKitAdapters({
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
   * Picker-specific options: which kit wallets to include, label overrides, and
   * the gateway group label. `wallets`, `labels`, and `groupLabel` are honored by
   * `stellarWalletsKitAdapters()`; the remaining fields are consumed by the
   * `/picker` subpath.
   */
  picker?: KitPickerOptions;

  /**
   * Minimum log severity. `'silent'` disables logging; otherwise
   * `error` < `warn` < `info` < `debug`. Defaults to `'info'`. Set once at init
   * since the kit is a global singleton.
   */
  logLevel?: LogLevel;

  /** Sink for logs. Defaults to the global `console`. */
  logger?: PollarLogger;
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
  /**
   * Label of the gateway button the kit wallets collapse behind in the login UI
   * (applied as each adapter's `meta.group`). Default `'Wallet'` - the same group
   * as the built-in Freighter/Albedo, so they share one gateway. Set a distinct
   * value (e.g. `'More wallets'`) to render the kit wallets as a separate gateway.
   */
  groupLabel?: string;
  /** Visual layout. Default `'grid'`. */
  layout?: 'grid' | 'list';
  /** Theme passthrough - applied as CSS custom properties on the picker root. */
  theme?: { accent?: string; mode?: 'light' | 'dark' };
}
```

`stellarWalletsKitAdapters()` returns `WalletAdapter[]` from `@pollar/core` - one
adapter per included kit module - which you assign to
`PollarClientConfig.walletAdapters`. Each adapter's `type` is the kit `WalletId`
(`WalletType | (string & {})`, so `WalletType.FREIGHTER` keeps autocomplete while
`'xbull'`, `'lobstr'`, ... are accepted as plain strings) and its `meta` carries
the module's label/icon for the auto-rendered login button.

### SSR safety

`stellarWalletsKitAdapters()` returns `[]` when `typeof window === 'undefined'`.
The kit talks to browser wallet extensions and touches `window` both at
`StellarWalletsKit.init()` and inside its module constructors, so there are no
wallets to build server-side. Under Next.js/Remix, construct your `PollarClient`
and render the wallet UI on the client (e.g. behind a mounted flag or
`dynamic(..., { ssr: false })`); the real adapters are built when the factory
re-runs in the browser.

## How it fits the Pollar wallet contract

The adapter implements `WalletAdapter` from `@pollar/core`:

| `WalletAdapter` method       | Kit call                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `isAvailable()`              | `refreshSupportedWallets()` then check the wallet's `isAvailable` flag |
| `connect()`                  | `setWallet(id)` > `fetchAddress()`                          |
| `disconnect()`               | `StellarWalletsKit.disconnect()`                            |
| `getPublicKey()`             | `StellarWalletsKit.getAddress()`                            |
| `signTransaction(xdr, opts)` | `setWallet(id)` > `signTransaction(xdr, opts)`             |
| `signAuthEntry(xdr, opts)`   | `setWallet(id)` > `signAuthEntry(xdr, opts)`               |

`setWallet` is called before every signing/connect operation so a single
`StellarWalletsKit.init({ modules })` covers many wallets. `stellarWalletsKitAdapters()`
builds one `StellarWalletsKitAdapter` per module up front and returns the array;
each adapter is bound to its own `WalletId` and the kit routes to the correct
module under the hood.

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

// The constructor requires a meta arg whose `label` is required.
const adapter = new StellarWalletsKitAdapter('freighter', { label: 'Freighter' });
const { address } = await adapter.connect();
```

## Composing with other adapters

`walletAdapters` is a plain `WalletAdapter[]`, so you can spread the kit adapters
alongside adapters from other packages (`@pollar/privy-adapter`, ...) or your own.
Entries later in the array override an earlier one that reuses the same `type`, and
each entry also overrides a built-in Freighter/Albedo with a matching `type`:

```ts
import { PollarClient } from '@pollar/core';
import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';
import { Networks } from '@creit.tech/stellar-wallets-kit';
import { MyCustomAdapter } from './my-custom-adapter';

new PollarClient({
  apiKey: 'your-api-key',
  walletAdapters: [
    ...stellarWalletsKitAdapters({ network: Networks.PUBLIC }),
    new MyCustomAdapter(),
  ],
});
```

## Fallback behaviour

If `walletAdapters` is omitted from `PollarClientConfig`, `@pollar/core` falls back to its built-in `FreighterAdapter` / `AlbedoAdapter`. Installing this package is opt-in - existing apps keep working without changes until they add adapters to the slot.

## License

MIT
