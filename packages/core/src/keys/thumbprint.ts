import { sha256 } from '@noble/hashes/sha256';
import { base64urlEncode } from '../lib/base64url';
import type { PublicEcJwk } from './types';

/**
 * Compute the RFC 7638 JWK thumbprint for an EC P-256 public JWK.
 *
 * Algorithm (RFC 7638 §3):
 *  1. Build a JSON object containing ONLY the required members of the JWK,
 *     ordered lexicographically by member name (Unicode code point).
 *     For EC keys, that's exactly {crv, kty, x, y}.
 *  2. Serialize to UTF-8 with no whitespace and no line breaks.
 *  3. Hash with SHA-256.
 *  4. Base64url-encode the hash (no padding).
 *
 * Common bugs guarded against:
 * - Including extra fields (`alg`, `use`, `kid`, `ext`, `key_ops`).
 * - Wrong member ordering (must be lex by Unicode code point).
 * - Padded base64 instead of base64url unpadded.
 * - Using `JSON.stringify(jwk)` of an arbitrary-key-order object — we build
 *   a fresh literal in canonical order to make the order explicit and not
 *   rely on V8's insertion-order semantics.
 */
export function computeJwkThumbprint(jwk: PublicEcJwk): string {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('[PollarClient:thumbprint] Expected EC P-256 JWK with x and y');
  }
  // Build the canonical string by hand so member order is unambiguous.
  // Lex order of EC required members: 'crv' < 'kty' < 'x' < 'y'.
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`;
  const digest = sha256(new TextEncoder().encode(canonical));
  return base64urlEncode(digest);
}

/**
 * Strip a JWK to only the four required EC public members. Useful when the
 * input came from `crypto.subtle.exportKey('jwk', publicKey)` which adds
 * `ext` / `key_ops`. Returns a fresh object — never mutates input.
 */
export function canonicalEcJwk(jwk: { kty?: string; crv?: string; x?: string; y?: string }): PublicEcJwk {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error('[PollarClient:thumbprint] Source JWK is not an EC P-256 public key');
  }
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}
