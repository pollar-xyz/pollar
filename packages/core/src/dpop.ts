import { sha256 } from '@noble/hashes/sha256';
import { base64urlEncode, base64urlEncodeString } from './lib/base64url';
import type { KeyManager, PublicEcJwk } from './keys/types';

/**
 * RFC 9449 DPoP proof builder.
 *
 * Produces a compact JWS that the consumer attaches as the `DPoP` HTTP
 * header. The header `jwk` is the public part of the SDK's per-session
 * keypair; the server verifies the signature, validates the `htm` / `htu` /
 * `iat` / `jti` / optional `nonce` / optional `ath` claims, and matches the
 * proof's JWK thumbprint against the access token's `cnf.jkt` claim.
 *
 * Server-issued nonce flow (RFC 9449 §8/§9): the server may respond with
 * `WWW-Authenticate: DPoP ... error="use_dpop_nonce"` plus a `DPoP-Nonce`
 * header. The client should re-build the proof with the new nonce and retry.
 * `buildProof` accepts an optional nonce; the SDK client tracks it across
 * requests and feeds it back here.
 */

export interface BuildProofArgs {
  /** HTTP method, e.g. `"GET"`. Will be uppercased before signing. */
  htm: string;
  /**
   * HTTP target URI. Will be normalized per RFC 3986 §6.2 (lowercase scheme
   * + host, default port elided, query+fragment+userinfo stripped, path
   * dot-segments resolved, trailing slash preserved exactly as provided).
   */
  htu: string;
  /**
   * Access token to bind the proof to (its base64url(SHA-256) goes in the
   * `ath` claim). Omit for proofs sent to the token endpoint per RFC 9449
   * §5 / §6.1 (those proofs MUST NOT include `ath`).
   */
  accessToken?: string;
  /**
   * Server-issued DPoP nonce, if the server has previously challenged this
   * client with `WWW-Authenticate: DPoP ... error="use_dpop_nonce"`. RFC
   * 9449 §8.
   */
  nonce?: string;
}

interface ProofHeader {
  typ: 'dpop+jwt';
  alg: 'ES256';
  jwk: PublicEcJwk;
}

interface ProofPayload {
  jti: string;
  htm: string;
  htu: string;
  iat: number;
  ath?: string;
  nonce?: string;
}

/**
 * Build a DPoP proof JWS for the given request. Returns the compact-form
 * JWS string (`<header>.<payload>.<signature>`).
 */
export async function buildProof(args: BuildProofArgs, keyManager: KeyManager): Promise<string> {
  const jwk = await keyManager.getPublicJwk();

  const header: ProofHeader = {
    typ: 'dpop+jwt',
    alg: 'ES256',
    jwk,
  };

  const payload: ProofPayload = {
    jti: generateJti(),
    htm: args.htm.toUpperCase(),
    htu: normalizeHtu(args.htu),
    iat: Math.floor(Date.now() / 1000),
  };

  if (args.accessToken !== undefined && args.accessToken !== '') {
    payload.ath = base64urlEncode(sha256(new TextEncoder().encode(args.accessToken)));
  }
  if (args.nonce !== undefined && args.nonce !== '') {
    payload.nonce = args.nonce;
  }

  const encodedHeader = base64urlEncodeString(JSON.stringify(header));
  const encodedPayload = base64urlEncodeString(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await keyManager.sign(new TextEncoder().encode(signingInput));
  const encodedSignature = base64urlEncode(signature);

  return `${signingInput}.${encodedSignature}`;
}

/**
 * Normalize an HTTP URI for use as the `htu` claim.
 *
 * RFC 9449 §4.3 + RFC 3986 §6.2:
 *  - lowercase scheme + host
 *  - elide default port (`:443` for https, `:80` for http)
 *  - strip userinfo (never appears in `htu`)
 *  - strip query + fragment
 *  - apply path dot-segment removal (handled by the URL constructor)
 *  - **preserve trailing slash exactly** — `/foo` and `/foo/` are distinct
 *    paths per RFC 3986 §6 and must round-trip identically.
 *  - preserve IPv6 brackets in host
 *
 * Both client and server must apply the same normalization so the `htu`
 * claim matches deterministically.
 */
export function normalizeHtu(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // Defensive fallback: strip query + fragment but otherwise return
    // unchanged. A poorly-formed URL is the caller's bug.
    return rawUrl.split('#')[0]!.split('?')[0]!;
  }
  const scheme = url.protocol.toLowerCase(); // includes trailing ':'
  const host = url.hostname.toLowerCase(); // already includes brackets for IPv6
  let port = url.port;
  if ((scheme === 'https:' && port === '443') || (scheme === 'http:' && port === '80')) {
    port = '';
  }
  const portPart = port ? `:${port}` : '';
  return `${scheme}//${host}${portPart}${url.pathname}`;
}

/**
 * Generate a UUIDv4 for use as the `jti` claim. Prefers the secure-context
 * `crypto.randomUUID` when available; falls back to a manual v4 build via
 * `crypto.getRandomValues` for environments where `randomUUID` is missing
 * (older RN, insecure HTTP origins).
 */
function generateJti(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40; // version 4
    bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80; // RFC 4122 variant
    const hex: string[] = [];
    for (let i = 0; i < 16; i++) hex.push((bytes[i] as number).toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
  throw new Error(
    '[PollarClient:dpop] No secure random source available (crypto.randomUUID / crypto.getRandomValues). ' +
      'DPoP requires a secure context (HTTPS) or, in React Native, the `react-native-get-random-values` polyfill.',
  );
}
