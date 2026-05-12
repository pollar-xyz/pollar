// React Native entry point. Registers a factory that prefers WebCrypto
// when available (RN ≥0.74 with a polyfill, Hermes with `crypto.subtle`)
// and falls back to `NobleKeyManager` (pure-JS ECDSA via `@noble/curves`)
// for environments without ECDSA support in `crypto.subtle`.
//
// Resolved automatically by Metro and other RN-aware bundlers via the
// `"react-native"` condition in `package.json#exports`.

import { _setDefaultKeyManagerFactory } from './keys/factory';
import { NobleKeyManager } from './keys/noble';
import { WebCryptoKeyManager } from './keys/web-crypto';

_setDefaultKeyManagerFactory((storage, apiKey) => {
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.generateKey === 'function' && typeof subtle.sign === 'function') {
    return new WebCryptoKeyManager(apiKey);
  }
  return new NobleKeyManager(storage, apiKey);
});

export * from './public';
export { NobleKeyManager } from './keys/noble';
