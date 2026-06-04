# Upgrade guide

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
