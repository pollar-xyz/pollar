import type { Storage } from '../storage/types';
import { NobleKeyManager } from './noble';
import type { KeyManager } from './types';
import { WebCryptoKeyManager } from './web-crypto';

/**
 * Pick a `KeyManager` that fits the runtime: prefers Web Crypto when
 * `subtle.generateKey` is present (browsers, secure contexts), otherwise
 * falls back to `NobleKeyManager` (React Native, older environments).
 *
 * The `apiKeyHash` namespaces stored keys per API key — switching keys at
 * runtime will look up a different keypair (generating one on first use).
 */
export function defaultKeyManager(storage: Storage, apiKeyHash: string): KeyManager {
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.generateKey === 'function' && typeof subtle.sign === 'function') {
    return new WebCryptoKeyManager(apiKeyHash);
  }
  return new NobleKeyManager(storage, apiKeyHash);
}
