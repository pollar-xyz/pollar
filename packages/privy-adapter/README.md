# @pollar/privy-adapter

Client-side [Privy](https://privy.io) wallet adapter for [`@pollar/core`](../core).
It drives the **whole** Privy flow itself — email / Google / GitHub login, creating
the user's **Privy embedded Stellar wallet**, and raw-hash signing — then hands the
signature to Pollar, which wraps it into a Stellar `DecoratedSignature` and runs the
standard SEP-10 login + transaction flow.

You configure it once with a slim, `PrivyClientConfig`-shaped object; you do **not**
wire up Privy's hooks yourself.

> Server-side custody (signing through your Privy app secret on your backend) is a
> different package: [`@pollar/privy-server-adapter`](../privy-server-adapter).

## Supported platforms

| Host | Status | Signing engine |
|---|---|---|
| React (web) | ✅ supported | `@privy-io/react-auth` |
| React Native / Expo | ✅ supported | `@privy-io/expo` |
| Angular, Vue, Svelte, vanilla | ❌ not supported | — (Privy ships no SDK) |

The right build is picked automatically: bundlers resolve the default (web) entry,
and Metro/Expo resolve the `react-native` entry via the package's export condition.
Your code is the same on both — `createPrivyAdapter` + `PrivyAdapterProvider`.

There is no Privy SDK for Angular or Vue, so the adapter can't run there. If you use
it in a non-React host it throws a clear `PrivyAdapterUnsupportedError` on first use.
For those frameworks, sign server-side with `@pollar/privy-server-adapter` instead.

## Install (web)

```bash
npm i @pollar/privy-adapter @pollar/core @stellar/stellar-sdk @privy-io/react-auth react react-dom
```

## Usage (web)

Create the adapter, wrap your app in `PrivyAdapterProvider`, and register it on the
`PollarClient`. The provider mounts `@privy-io/react-auth` and bridges its hooks into
the adapter for you.

```tsx
import { createPrivyAdapter, PrivyAdapterProvider } from '@pollar/privy-adapter';
import { PollarProvider } from '@pollar/react';

const privy = createPrivyAdapter({
  appId: 'your-privy-app-id',
  loginMethods: ['email', 'google', 'github'],
  // clientId?, appearance?, debug?, cleanupOAuthRedirect?, meta? are optional
});

export function App() {
  return (
    <PrivyAdapterProvider adapter={privy}>
      <PollarProvider client={{ apiKey: '…', walletAdapters: [privy] }}>
        {/* your app */}
      </PollarProvider>
    </PrivyAdapterProvider>
  );
}
```

In the Pollar login modal this renders a **Privy** button that opens a sub-modal with
the `loginMethods` you configured (email, Google, GitHub). The adapter runs the Privy
login, ensures the user has a Stellar embedded wallet, and resolves the address Pollar
needs for SEP-10.

## Install & usage (React Native / Expo)

```bash
npm i @pollar/privy-adapter @pollar/core @stellar/stellar-sdk @privy-io/expo react-native-webview
# plus @privy-io/expo's own peer deps (expo-secure-store, expo-web-browser, etc.)
```

The code is identical to web — only the import resolves to the Expo build, which uses
`@privy-io/expo` (a WebView-hosted secure signer) instead of an iframe. Note the
`appearance` option is applied on web only; the Expo entry does not forward it:

```tsx
import { createPrivyAdapter, PrivyAdapterProvider } from '@pollar/privy-adapter';

const privy = createPrivyAdapter({ appId, loginMethods: ['email', 'google'] });

// <PrivyAdapterProvider adapter={privy}>
//   <PollarProvider client={{ apiKey, walletAdapters: [privy] }}>…</PollarProvider>
// </PrivyAdapterProvider>
```

OAuth on Expo opens an in-app browser and resolves in-session (no redirect round-trip).

## Config

`createPrivyAdapter(config)`:

| field | type | notes |
|---|---|---|
| `appId` | `string` | your Privy app id |
| `loginMethods` | `('email' \| 'google' \| 'github')[]` | options shown in the sub-modal, in order |
| `clientId?` | `string` | Privy app client id, if your app uses one |
| `appearance?` | `{ theme?; accentColor?; logo? }` | forwarded to Privy's own surfaces (web only; ignored on React Native) |
| `redirectUri?` | `string` | reserved; not currently applied to the OAuth flow |
| `debug?` | `boolean` | verbose `[privy-adapter]` console logging; off by default |
| `cleanupOAuthRedirect?` | `boolean` | after a web OAuth redirect, strip `privy_oauth_*` params from the URL via `history.replaceState`; on by default |
| `meta?` | `{ label; iconUrl? }` | login button; defaults to `{ label: 'Privy' }` |

The returned object is a `@pollar/core` `WalletAdapter` plus interactive-login methods
(`getAuthOptions`, `sendEmailCode`, `verifyEmailCode`, `loginWithOAuth`) that the Pollar
login modal drives. `signTransaction` parses the XDR, signs `tx.hash()` via Privy
(`chainType: 'stellar'`), and appends the decorated signature. `signAuthEntry` throws —
Privy external wallets are classic G-addresses, not Soroban smart accounts.

## How it works

`@privy-io/react-auth` is hook-based and must run inside a React tree, so the adapter is
inert on its own. `PrivyAdapterProvider` mounts `PrivyProvider` plus a small bridge that
captures Privy's hooks (`useLoginWithEmail`, `useLoginWithOAuth`, and `useCreateWallet` /
`useSignRawHash` from `@privy-io/react-auth/extended-chains`) and attaches them to the
adapter. Until that bridge mounts the adapter has no runtime — which is exactly why a
non-React host fails fast with a clear, actionable error.

### Auto-sync (host auto-login)

The adapter emits its provider auth state through `onProviderAuthChange(cb)`, and
`@pollar/react`'s `PollarProvider` subscribes to it: when Privy reports an authenticated
session but Pollar has none, it triggers `login({ provider })` on the rising edge. This
is what recovers a web OAuth redirect (a page reload drops the sub-modal promise) and a
persisted Privy session on load, without the user clicking the login button again.
