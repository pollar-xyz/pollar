// Web/Node/Workers entry point. Registers a `WebCryptoKeyManager`-only
// factory at module load so `PollarClient` resolves the WebCrypto-backed
// manager without importing `NobleKeyManager` (and transitively
// `@noble/curves`). Bundlers targeting browsers pick this entry via the
// default `"import"` / `"require"` conditions in `package.json#exports` and
// produce a noble-free bundle.
//
// React Native applications resolve `index.rn.ts` instead via the
// `"react-native"` condition.

import { _setDefaultKeyManagerFactory } from './keys/factory';
import { WebCryptoKeyManager } from './keys/web-crypto';

_setDefaultKeyManagerFactory((_storage, apiKey) => new WebCryptoKeyManager(apiKey));

export * from './public';
