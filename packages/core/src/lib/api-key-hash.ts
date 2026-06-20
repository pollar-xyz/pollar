import { sha256 } from './sha256';

/**
 * Storage-namespace width. 16 bytes = 32 hex = 128 bits, so two distinct API
 * keys collide with probability ≈ 1/2^64 (negligible). The pre-0.10 width was
 * 4 bytes / 8 hex (≈1/2^32), where colliding keys would have shared a session
 * AND a DPoP keypair.
 */
const HASH_BYTES = 16;
/** Pre-0.10 width — kept only so {@link legacyHashApiKey} can find and migrate
 *  sessions/keys written by older SDKs into the wider namespace. */
const LEGACY_HASH_BYTES = 4;

async function hashToHex(apiKey: string, bytes: number): Promise<string> {
  const digest = await sha256(new TextEncoder().encode(apiKey));
  let hex = '';
  for (let i = 0; i < bytes; i++) hex += digest[i]!.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Stable per-API-key namespace tag used to scope persisted storage keys and
 * keypairs. First 32 hex chars of SHA-256(apiKey) — long enough that distinct
 * keys don't collide in practice (not a security primitive).
 *
 * Async only to match the `sha256` wrapper's signature — the underlying
 * `@noble/hashes` digest is synchronous. Compute once during client
 * initialization and cache.
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  return hashToHex(apiKey, HASH_BYTES);
}

/**
 * The pre-0.10 (8-hex) namespace tag. Used ONLY for a one-time migration of an
 * existing session / DPoP key into the wider {@link hashApiKey} namespace, so
 * widening the hash doesn't orphan stored state and silently log users out.
 */
export async function legacyHashApiKey(apiKey: string): Promise<string> {
  return hashToHex(apiKey, LEGACY_HASH_BYTES);
}
