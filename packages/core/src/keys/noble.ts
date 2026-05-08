import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { base64urlDecode, base64urlEncode } from '../lib/base64url';
import type { Storage } from '../storage/types';
import { computeJwkThumbprint } from './thumbprint';
import type { KeyManager, PublicEcJwk } from './types';

/**
 * `KeyManager` backed by `@noble/curves` (pure-JS ECDSA P-256) + an injected
 * `Storage` adapter. Used in React Native, where Web Crypto's ECDSA support
 * is incomplete or absent. The 32-byte private scalar is base64url-encoded
 * and stored through the `Storage` adapter (Keychain / SecureStore in
 * production).
 *
 * React Native: requires `react-native-get-random-values` to be imported at
 * app entry so `crypto.getRandomValues` is available for `randomPrivateKey`.
 *
 * Threat-model note: unlike `WebCryptoKeyManager`, the private scalar lives
 * as raw bytes inside the storage adapter. A device-level compromise that
 * can read Keychain (jailbreak / root / debug bridge) can exfiltrate the
 * key. For higher assurance, ship a hardware-backed key adapter that holds
 * the key inside Secure Enclave / StrongBox (planned for a future minor).
 */

/** Base64url-encoded private scalar (32 bytes → ~43 chars). */
const STORAGE_KEY_PREFIX = 'pollar:dpop-key:';

export class NobleKeyManager implements KeyManager {
  private readonly storage: Storage;
  private readonly apiKeyHash: string;
  private privateKey: Uint8Array | null = null;
  private publicJwk: PublicEcJwk | null = null;
  private thumbprint: string | null = null;

  constructor(storage: Storage, apiKeyHash: string) {
    this.storage = storage;
    this.apiKeyHash = apiKeyHash;
  }

  private get storageKey(): string {
    return `${STORAGE_KEY_PREFIX}${this.apiKeyHash}`;
  }

  async init(): Promise<void> {
    if (this.privateKey) return;

    let priv: Uint8Array | null = null;
    try {
      const stored = await this.storage.get(this.storageKey);
      if (stored) {
        const decoded = base64urlDecode(stored);
        if (decoded.length === 32) priv = decoded;
      }
    } catch {
      priv = null;
    }

    if (!priv) {
      priv = p256.utils.randomPrivateKey();
      try {
        await this.storage.set(this.storageKey, base64urlEncode(priv));
      } catch {
        // Persistence failed; in-memory key still works for the current session.
      }
    }

    this.privateKey = priv;

    // Uncompressed public key: 65 bytes, 0x04 || X(32) || Y(32).
    const pub = p256.getPublicKey(priv, false);
    if (pub.length !== 65 || pub[0] !== 0x04) {
      throw new Error('[PollarClient:keys] Unexpected public key format from @noble/curves');
    }

    this.publicJwk = {
      kty: 'EC',
      crv: 'P-256',
      x: base64urlEncode(pub.slice(1, 33)),
      y: base64urlEncode(pub.slice(33, 65)),
    };
    this.thumbprint = computeJwkThumbprint(this.publicJwk);
  }

  async reset(): Promise<void> {
    try {
      await this.storage.remove(this.storageKey);
    } catch {
      // Best-effort.
    }
    this.privateKey = null;
    this.publicJwk = null;
    this.thumbprint = null;
  }

  async getPublicJwk(): Promise<PublicEcJwk> {
    if (!this.publicJwk) {
      throw new Error('[PollarClient:keys] init() must be called before getPublicJwk()');
    }
    return { kty: this.publicJwk.kty, crv: this.publicJwk.crv, x: this.publicJwk.x, y: this.publicJwk.y };
  }

  async getThumbprint(): Promise<string> {
    if (!this.thumbprint) {
      throw new Error('[PollarClient:keys] init() must be called before getThumbprint()');
    }
    return this.thumbprint;
  }

  async sign(payload: Uint8Array): Promise<Uint8Array> {
    if (!this.privateKey) {
      throw new Error('[PollarClient:keys] init() must be called before sign()');
    }
    // Two-step: hash with @noble/hashes' sha256, then sign the digest with
    // `prehash: false`. `p256.sign(msg)` with default prehash uses noble's
    // own internal preprocessing whose output is not bit-equivalent to a
    // simple SHA-256, so we explicitly compute the digest ourselves to
    // match standard JOSE ES256 verification.
    const digest = sha256(payload);
    const signature = p256.sign(digest, this.privateKey, { prehash: false });
    // 64-byte r||s, exactly the JOSE/IEEE P1363 format JWS ES256 expects.
    return signature.toCompactRawBytes();
  }
}
