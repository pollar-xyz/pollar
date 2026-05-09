import { sha256 } from '@noble/hashes/sha256';

/**
 * Stable per-API-key namespace tag used to scope persisted storage keys and
 * keypairs. First 8 hex chars of SHA-256(apiKey) — short enough to read in
 * dev tools, long enough that two distinct keys collide with probability
 * ≈ 1/2^32 (acceptable for namespacing; not for security).
 *
 * Pure-JS hash so this works identically on web and React Native without a
 * `crypto.subtle` round-trip.
 */
export function hashApiKey(apiKey: string): string {
  const digest = sha256(new TextEncoder().encode(apiKey));
  let hex = '';
  for (let i = 0; i < 4; i++) hex += digest[i]!.toString(16).padStart(2, '0');
  return hex;
}