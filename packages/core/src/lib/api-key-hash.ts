import { sha256 } from './sha256';

/**
 * Stable per-API-key namespace tag used to scope persisted storage keys and
 * keypairs. First 32 hex chars (16 bytes / 128 bits) of SHA-256(apiKey) — two
 * distinct keys collide with probability ≈ 1/2^64 (negligible). The pre-0.10
 * width was 8 hex (≈1/2^32), where colliding keys would have shared a session
 * AND a DPoP keypair.
 *
 * NOTE: widening this from the old 8-hex value intentionally changes every
 * storage key, so an existing session written by an older SDK is NOT found and
 * the user is asked to re-authenticate ONCE on upgrade. That is by design here —
 * it flushes any stale session state left by earlier buggy versions onto a clean
 * session. There is deliberately NO migration. Do not re-widen without weighing
 * that one-time logout.
 *
 * Async only to match the `sha256` wrapper's signature — the underlying
 * `@noble/hashes` digest is synchronous. Compute once during client
 * initialization and cache.
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const digest = await sha256(new TextEncoder().encode(apiKey));
  let hex = '';
  for (let i = 0; i < 16; i++) hex += digest[i]!.toString(16).padStart(2, '0');
  return hex;
}
