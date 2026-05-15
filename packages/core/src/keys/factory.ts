import type { Storage } from '../storage/types';
import type { KeyManager } from './types';

/**
 * Module-level registry for the platform-default `KeyManager` factory. Each
 * entry point (web `index.ts`, RN `index.rn.ts`) registers its own factory
 * at module-load time, so that `PollarClient` can resolve a default manager
 * without statically importing both implementations into every bundle.
 *
 * The split exists because `NobleKeyManager` pulls in `@noble/curves`, which
 * we don't want to ship to browser bundles when WebCrypto's ECDSA is
 * already available natively. Bundlers tree-shake the unused entry's noble
 * import; the RN entry keeps the pure-JS fallback.
 */

type KeyManagerFactory = (storage: Storage, apiKey: string) => KeyManager;

let _factory: KeyManagerFactory | null = null;

/**
 * Register the platform-default factory. Called as a top-level side effect
 * from the entry-point module (`src/index.ts` or `src/index.rn.ts`).
 * Intentionally underscore-prefixed: not part of the public API.
 */
export function _setDefaultKeyManagerFactory(factory: KeyManagerFactory): void {
  _factory = factory;
}

/**
 * Construct the default `KeyManager` for the current runtime. Throws if no
 * factory has been registered — that only happens if `@pollar/core` was
 * imported in a way that bypassed the entry-point module (a bundler or
 * test setup bug).
 */
export function defaultKeyManager(storage: Storage, apiKey: string): KeyManager {
  if (!_factory) {
    throw new Error(
      '[PollarClient] No default KeyManager factory registered. ' +
        'Did you import from "@pollar/core" via a non-standard path?',
    );
  }
  return _factory(storage, apiKey);
}
