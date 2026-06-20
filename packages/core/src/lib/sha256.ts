import { sha256 as nobleSha256 } from '@noble/hashes/sha2';

/**
 * SHA-256 via `@noble/hashes` (pure JS). Returns the raw 32-byte digest as a
 * `Uint8Array`.
 *
 * We deliberately do NOT use `crypto.subtle.digest`: it is absent on React
 * Native / Hermes unless a native polyfill (`react-native-quick-crypto`, which
 * forces an Expo dev build) is installed. `@noble/hashes` runs everywhere with
 * no native module, and is already in the dependency tree via `@noble/curves`
 * (the `NobleKeyManager`). The inputs hashed here are tiny (API keys, access
 * tokens, JWK thumbprints), so the JS implementation is more than fast enough.
 *
 * Kept `async` (the digest itself is synchronous) so existing `await sha256(…)`
 * call sites — DPoP `ath`, API-key hashing, JWK thumbprints, `NobleKeyManager`
 * — need no change.
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return nobleSha256(data);
}
