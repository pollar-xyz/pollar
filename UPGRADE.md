# Upgrade guide

## 0.9.x -> 0.10.0

0.10.0 unifies external wallets into a single `walletAdapters: WalletAdapter[]`
array and removes the old singular `walletAdapter` resolver, the `loginWallet()`
method, and the 0.8-era `ui.renderWallets` slot / `/picker` bundle. The login
modal now renders one login entry per registered adapter automatically.

### 1. `walletAdapter` (singular resolver) -> `walletAdapters` (array)

`PollarClientConfig.walletAdapter` is replaced by `walletAdapters?: WalletAdapter[]`.
Built-in `FreighterAdapter` / `AlbedoAdapter` still auto-register; pass any extra
adapters as array entries (an entry overrides a built-in with the same `type`).

```ts
// BEFORE (0.9.x)
new PollarClient({ apiKey, walletAdapter: stellarWalletsKit({ network }) });

// AFTER (0.10.0)
new PollarClient({ apiKey, walletAdapters: stellarWalletsKitAdapters({ network }) });
```

### 2. `stellarWalletsKit(...)` -> `stellarWalletsKitAdapters(...)`

`@pollar/stellar-wallets-kit-adapter` now exports `stellarWalletsKitAdapters()`,
which returns a `WalletAdapter[]` (one per module) instead of a resolver. It is
also SSR-safe: it returns `[]` when there is no `window` and builds the real list
when it re-runs on the client. Requires `@pollar/core@^0.10.0` /
`@pollar/react@^0.10.0`.

### 3. `loginWallet(id)` -> `login({ provider: id })`

The dedicated wallet-login method is gone. Enter any wallet through the unified
login entry point, using the adapter's `type` as the provider id.

```ts
// BEFORE
client.loginWallet('xbull');
// AFTER
client.login({ provider: 'xbull' });
```

### 4. `ui.renderWallets` / `/picker` bundle removed

The 0.8 `ui.renderWallets` slot and the `@pollar/stellar-wallets-kit-adapter/picker`
bundle (`createStellarWalletsKitBundle`) no longer exist. The login modal builds
the wallet list from the registered `walletAdapters`, so you just pass them:

```tsx
// BEFORE (0.8/0.9)
<PollarProvider
  client={{ apiKey: '…', walletAdapter: bundle.walletAdapter }}
  ui={{ renderWallets: bundle.renderWallets }}
>

// AFTER (0.10.0)
<PollarProvider client={{ apiKey: '…', walletAdapters: stellarWalletsKitAdapters({ network }) }}>
```

### 5. Custom `WalletAdapter` authors

Adapters now carry display metadata: the constructor / factory takes a
`meta: WalletAdapterMeta` (at least `{ label }`) so the adapter can render its own
login entry. For example `new StellarWalletsKitAdapter('freighter', { label: 'Freighter' })`.

### 6. `@pollar/react`: `usePollar().walletAddress` / `walletType` -> `wallet`

The context no longer exposes `walletAddress` or `walletType`. Read the wallet
through `wallet: WalletInfo | null` instead.

```tsx
// BEFORE
const { walletAddress, walletType } = usePollar();
// AFTER
const { wallet } = usePollar();
const address = wallet?.address;
const custody = wallet?.custody; // 'internal' | 'smart' | 'external'
```

### 7. One-time re-login (SDK only)

The local storage namespace was widened (the apiKey hash went from 8 to 32 hex
chars), which orphans sessions persisted by older builds. Every user
re-authenticates once after the host app ships 0.10.0. No backend change, no
migration, no action required.

## 0.8.x → 0.9.0

The SDK surface drops the legacy wallet `publicKey` alias in favor of `address`,
and surfaces the internal wallet type as `'internal'` instead of `'custodial'`.
**The `sdk-api` wire is unchanged** — it still emits `'custodial'` and
`publicKey`, and `@pollar/core` ≥0.9.0 remaps both at the client boundary. So
SDKs ≤0.8.x keep working, sessions persisted by older SDKs are migrated
transparently on read, and no coordinated backend deploy is required.

### Most consumers — no change

If you read the wallet address through `usePollar().walletAddress`
(`@pollar/react`), nothing changes — it's resolved internally from
`session.wallet.address`.

### Required changes

#### 1. Reading the wallet address (headless `@pollar/core`)

`session.wallet.publicKey` is removed; read `session.wallet.address` (it always
held the same value).

```ts
client.onAuthStateChange((s) => {
  if (s.step !== 'authenticated') return;
  // BEFORE (≤0.8.x): s.session.wallet.publicKey
  // AFTER  (0.9.0):  s.session.wallet.address
  const addr = s.session.wallet.address;
});
```

#### 2. `wallet.type` `'custodial'` → `'internal'`

The developer-facing union is now `'internal' | 'smart' | 'external'`. Code
branching on `wallet.type === 'custodial'` must switch to `'internal'`.

#### 3. Custom `WalletAdapter` authors

`ConnectWalletResponse` is now `{ address }` only — drop the duplicate
`publicKey`.

```ts
// BEFORE
async connect(): Promise<ConnectWalletResponse> {
  return { address: pubkey, publicKey: pubkey };
}
// AFTER
async connect(): Promise<ConnectWalletResponse> {
  return { address: pubkey };
}
```

### Deploy ordering

`@pollar/core` 0.9.0 sends `address` (preferred) on `/tx/*` request bodies. The
`sdk-api` accepts **either `address` or `publicKey`** (`address` wins), so ship
the matching `sdk-api` change before/with `@pollar/core` 0.9.0.

### `@pollar/stellar-wallets-kit-adapter`

`connect()` now returns `{ address }` only. Requires `@pollar/core@^0.9.0` /
`@pollar/react@^0.9.0` (peer ranges pinned).

## 0.7.x → 0.8.0

`<PollarProvider>` is reshaped to make the wallet picker pluggable and to give
the consumer explicit control over the remote `/applications/config` fetch.
All changes are mechanical renames; nothing in `@pollar/core` moves.

### Required changes

#### 1. `config` → `client`

The provider's first prop is renamed from `config` to `client`. It now accepts
**either a `PollarClientConfig` (the current shape) or a pre-built
`PollarClient` instance**. The provider constructs the client at first render
in both cases.

```tsx
// BEFORE
<PollarProvider config={{ apiKey: '…', walletAdapter }}>

// AFTER (no behavior change beyond the rename)
<PollarProvider client={{ apiKey: '…', walletAdapter }}>
```

The pre-built form is useful if you want to keep a reference to the client
outside React (tests, server actions, jobs):

```tsx
const client = new PollarClient({ apiKey: '…', walletAdapter });
<PollarProvider client={client}>
```

> **Note**: the client is locked at first render. Changing the prop afterwards
> is ignored. To swap clients, unmount and remount the provider. This already
> matched the 0.7.x behavior — it's just now explicit.

#### 2. `styles` → `appConfig.styles`

The top-level `styles` prop moves under a new `appConfig` block whose shape
mirrors what `/applications/config` returns.

```tsx
// BEFORE
<PollarProvider config={{…}} styles={{ theme: 'dark' }}>

// AFTER
<PollarProvider client={{…}} appConfig={{ styles: { theme: 'dark' } }}>
```

#### 3. The remote-config fetch is now opt-out

If you pass `appConfig` (even as `{}`), the provider **skips** the `GET
/applications/config` call entirely. Missing fields fall back to the defaults
already baked into `LoginModalTemplate` (light theme, Pollar logo, no social
providers, etc.).

If you **don't** pass `appConfig`, the SDK fetches `/applications/config` on
mount exactly like 0.7.x did. The previous 3-level styles merge
(`remote.styles + propStyles + providers merge`) is removed: you now either get
the remote config or your local one, not a hybrid.

```tsx
// Force defaults, no network call:
<PollarProvider client={{…}} appConfig={{}}>

// Keep the existing remote-config behavior:
<PollarProvider client={{…}}>

// Local override of styles, no network call:
<PollarProvider client={{…}} appConfig={{ styles: { theme: 'dark' } }}>
```

#### 4. Remote-config errors now log to `console.error`

Previously, a failed `/applications/config` fetch was silently swallowed. It
now logs via `console.error('[PollarProvider] getAppConfig failed', err)`,
matching how the rest of `@pollar/core` reports unexpected failures.

### New: `renderWallets` slot

> **Removed in 0.10.0.** The `ui.renderWallets` slot and the `/picker` bundle
> below were superseded by the `walletAdapters[]` model. See the 0.9.x -> 0.10.0
> section above. The rest of this section applies only to 0.8.x / 0.9.x.

`<PollarProvider>` accepts a new optional `ui.renderWallets` slot that
replaces the hardcoded Freighter+Albedo list inside the LoginModal wallet
picker. If you don't pass it, the default Freighter+Albedo list is shown
exactly as before.

```tsx
import type { RenderWalletsSlot } from '@pollar/react';

const renderWallets: RenderWalletsSlot = ({ onConnect, authState }) => (
  <MyCustomWalletGrid onPick={onConnect} disabled={authState.step !== 'idle'} />
);

<PollarProvider client={{…}} ui={{ renderWallets }}>
```

For the common case of "drop in the Stellar Wallets Kit picker", the new
`@pollar/stellar-wallets-kit-adapter/picker` subpath ships a ready-made
bundle:

```tsx
import { createStellarWalletsKitBundle } from '@pollar/stellar-wallets-kit-adapter/picker';
import { Networks } from '@creit.tech/stellar-wallets-kit';

const bundle = createStellarWalletsKitBundle({
  network: Networks.PUBLIC,
  picker: { wallets: ['xbull', 'lobstr', 'freighter'] },
});

<PollarProvider
  client={{ apiKey: '…', walletAdapter: bundle.walletAdapter }}
  ui={{ renderWallets: bundle.renderWallets }}
>
```

### `@pollar/stellar-wallets-kit-adapter` — no required changes

If you already consume `stellarWalletsKit({ network })` for `walletAdapter`,
nothing changes. The root export stays the same callable
`WalletAdapterResolver`. React only enters the picture if you import from
`@pollar/stellar-wallets-kit-adapter/picker`, and is declared as an optional
peer dependency — headless consumers don't pull it in.

### Why the breaking change

- The previous `config: PollarClientConfig` prop leaked SDK plumbing
  (`storage`, `keyManager`, …) into the React API. `client` is a cleaner
  contract that also lets you reuse the constructed client outside React.
- The previous 3-way style merge was implicit and hard to reason about
  (props sometimes won, sometimes the remote did). The new "presence =
  opt-out" rule is one line and predictable.
- The wallet picker was hardcoded to Freighter+Albedo, which forced
  `@pollar/react` to bundle wallet-specific logos and labels. The
  `renderWallets` slot decouples the modal from any particular wallet
  ecosystem.
