# React Native and Expo

React Native is the environment where a Pollar integration most often fails for reasons that are not
the SDK's fault. Three things have to be right: runtime polyfills, a storage adapter, and an API key
that accepts origin-less requests.

## 1. Entry-file polyfills (do this first)

The SDK builds a DPoP proof (RFC 9449) for **every** authenticated request. That path uses three Web
primitives Hermes does not all ship. Register them at the very top of the entry file, **before any
`@pollar/core` import**. If one is missing, proof construction fails and no authenticated request
works at all.

```ts
// index.js / App entry, before importing @pollar/core
import 'react-native-get-random-values'; // crypto.getRandomValues
import 'react-native-polyfill-globals/auto'; // TextEncoder / TextDecoder + URL
```

| Primitive                     | Used by                                  | Polyfill                         |
| ----------------------------- | ---------------------------------------- | -------------------------------- |
| `crypto.getRandomValues`      | keypair generation, DPoP `jti`           | `react-native-get-random-values` |
| `TextEncoder` / `TextDecoder` | DPoP encoding, base64url, JWK thumbprint | `react-native-polyfill-globals`  |
| `URL` (spec compliant)        | DPoP `htu` normalisation on every proof  | `react-native-polyfill-globals`  |

SHA-256 runs on `@noble/hashes`, so `react-native-quick-crypto` is **not** required and the SDK works
in Expo Go. Installing it is a security upgrade only: with `crypto.subtle` present the SDK uses
`WebCryptoKeyManager`, whose private key is non-extractable. Without it, `NobleKeyManager` holds the
private scalar in JS and persists it through the storage adapter. Both produce valid proofs, but the
native module means an Expo dev build rather than Expo Go.

Auth does not need a fetch-streaming polyfill: on React Native the SDK polls the non-streaming session
status endpoint instead.

## 2. Storage adapter

Web autodetects `localStorage`. React Native must inject one, and both adapters are async because the
underlying module is loaded through a dynamic import.

**Expo (works in Expo Go):**

```bash
npx expo install expo-secure-store react-native-get-random-values
npm i react-native-polyfill-globals
```

```ts
import { PollarClient } from '@pollar/core';
import { createSecureStoreAdapter } from '@pollar/core/adapters/expo';

const storage = await createSecureStoreAdapter();
// default keychain accessibility: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
// which keeps iCloud Keychain from carrying the key to another device
const client = new PollarClient({ apiKey: 'pub_testnet_...', storage });
```

**Bare React Native:**

```bash
npm i react-native-keychain react-native-get-random-values react-native-polyfill-globals
```

```ts
import { createKeychainAdapter } from '@pollar/core/adapters/react-native-keychain';

const storage = await createKeychainAdapter();
const client = new PollarClient({ apiKey: 'pub_testnet_...', storage });
```

The key manager autodetects: `NobleKeyManager` on RN, `WebCryptoKeyManager` when `crypto.subtle` exists.

## 3. Native clients on the API key

Publishable keys are validated against an origin allowlist. React Native and Expo send no `Origin`
header, so those requests fail the check no matter which domains are registered. The key used by a
mobile app has to have native clients enabled on it from the dashboard. Symptom when it is not: every
request is rejected before any login UI can appear, on a build that works fine in a browser.

## 4. Injected browser-only strategies

The built-in popup and extension paths are web only. On RN, OAuth and external-wallet logins need
these injected:

| Config               | Why                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `openAuthUrl`        | Web defaults to a popup. RN must open the hosted OAuth URL itself, typically via `expo-web-browser`                                   |
| `oauthRedirectUri`   | Web defaults to `window.location.origin`. RN must pass its deep link                                                                  |
| `visibilityProvider` | Drives the silent-refresh scheduler. Ships as `createAppStateVisibilityProvider()` from `@pollar/core/adapters/react-native-appstate` |
| `walletAdapters`     | Freighter and Albedo are browser extensions and do not apply                                                                          |

```ts
import * as WebBrowser from 'expo-web-browser';
import { createAppStateVisibilityProvider } from '@pollar/core/adapters/react-native-appstate';

const client = new PollarClient({
  apiKey: 'pub_testnet_...',
  storage,
  visibilityProvider: await createAppStateVisibilityProvider(),
  oauthRedirectUri: 'myapp://auth',
  openAuthUrl: async (url) => {
    await WebBrowser.openAuthSessionAsync(url, 'myapp://auth');
  },
});
```

Email OTP needs none of this, which makes it the simplest first flow to get working on mobile.

## 5. React binding

Identical to web: `useSyncExternalStore` over `onAuthStateChange` plus `getAuthState`, or `usePollar()`
from `@pollar/react`. See [react.md](react.md). Keep the client a singleton, and note that the storage
adapter is created with `await`, so build the client in an async bootstrap and render a splash until
`client.ready()` resolves.

## Checklist when nothing authenticates

Work down this list in order, because each step masks the ones after it:

1. Are the polyfills imported before `@pollar/core`, in the entry file, not in a screen?
2. Is a storage adapter passed to the constructor?
3. Does the API key have native clients enabled?
4. For OAuth: are `openAuthUrl` and `oauthRedirectUri` both set, and does the deep link scheme match
   the one registered in the app config?
