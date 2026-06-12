// React Native entry point. Always uses `NobleKeyManager` (pure-JS ECDSA via
// `@noble/curves`) backed by the injected `Storage` adapter (Keychain /
// SecureStore).
//
// Why not WebCrypto, even when `crypto.subtle` is present? A polyfill like
// react-native-quick-crypto exposes `crypto.subtle.generateKey/sign`, which
// previously made this factory pick `WebCryptoKeyManager`. But that manager
// persists the keypair in IndexedDB and generates non-extractable keys — and
// in React Native there is no IndexedDB AND non-extractable keys can't be
// serialized to the Storage adapter. The result was a brand-new DPoP keypair
// on every app launch → the JWK thumbprint changed each start → every
// sender-constrained access/refresh token was rejected → forced logout loop.
// Noble persists the 32-byte private scalar through `Storage`, so the key
// survives restarts. On RN, Noble is the only manager that can persist.
//
// Resolved automatically by Metro and other RN-aware bundlers via the
// `"react-native"` condition in `package.json#exports`.

import { _setDefaultKeyManagerFactory } from './keys/factory';
import { NobleKeyManager } from './keys/noble';

_setDefaultKeyManagerFactory((storage, apiKey) => {
  return new NobleKeyManager(storage, apiKey);
});

export * from './public';
export { NobleKeyManager } from './keys/noble';
