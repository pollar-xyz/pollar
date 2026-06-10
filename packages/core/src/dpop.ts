import { base64urlEncode, base64urlEncodeString } from './lib/base64url';
import { randomUUID } from './lib/random-uuid';
import { sha256 } from './lib/sha256';
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
 *
 * The last seen `DPoP-Nonce` is stored verbatim and embedded in the next
 * proof. The server validates it as an HMAC token, so an attacker who
 * injects an arbitrary nonce cannot escalate — verification fails and the
 * server replies with a fresh nonce on the next request.
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
    jti: randomUUID(),
    htm: args.htm.toUpperCase(),
    htu: normalizeHtu(args.htu),
    iat: Math.floor(Date.now() / 1000),
  };

  if (args.accessToken !== undefined && args.accessToken !== '') {
    payload.ath = base64urlEncode(await sha256(new TextEncoder().encode(args.accessToken)));
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
