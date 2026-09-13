import { sha256 } from './sha256';

/**
 * Stable per-API-key namespace tag used to scope persisted storage keys and
 * keypairs. First 32 hex chars (16 bytes / 128 bits) of SHA-256(apiKey) - two
 * distinct keys collide with probability ~1/2^64 (negligible).
 *
 * NOTE: the tag width is baked into every storage key, so changing it orphans
 * every persisted session (the row is simply never found) and logs every user
 * out once on upgrade. There is deliberately NO migration between widths - do
 * not change it without weighing that one-time logout. (Sessions written by
 * SDKs older than 0.10 use an 8-hex tag and are intentionally left orphaned.)
 *
 * Async only to match the `sha256` wrapper's signature - the underlying
 * `@noble/hashes` digest is synchronous. Compute once during client
 * initialization and cache.
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const digest = await sha256(new TextEncoder().encode(apiKey));
  let hex = '';
  for (let i = 0; i < 16; i++) hex += digest[i]!.toString(16).padStart(2, '0');
  return hex;
}
