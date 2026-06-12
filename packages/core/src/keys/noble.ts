import { p256 } from '@noble/curves/nist';
import { hashApiKey } from '../lib/api-key-hash';
import { base64urlDecode, base64urlEncode } from '../lib/base64url';
import { sha256 } from '../lib/sha256';
import type { Storage } from '../storage/types';
import { computeJwkThumbprint } from './thumbprint';
import type { KeyManager, PublicEcJwk } from './types';

/**
 * `KeyManager` backed by `@noble/curves` (pure-JS ECDSA P-256) + an injected
 * `Storage` adapter. Used in React Native, where `WebCryptoKeyManager` can't
 * be: its non-extractable keys can't be serialized to the `Storage` adapter
 * (and RN has no IndexedDB), so the keypair would be regenerated every launch
 * — see the rationale in `index.rn.ts`. The 32-byte private scalar is
 * base64url-encoded and stored through the `Storage` adapter (Keychain /
 * SecureStore in production).
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
  private readonly apiKey: string;
  private apiKeyHash: string | null = null;
  private privateKey: Uint8Array | null = null;
  private publicJwk: PublicEcJwk | null = null;
  private thumbprint: string | null = null;
  /** Cached in-flight init — see `WebCryptoKeyManager` for the rationale. */
  private _initPromise: Promise<void> | null = null;

  constructor(storage: Storage, apiKey: string) {
    this.storage = storage;
    this.apiKey = apiKey;
  }

  private get storageKey(): string {
    if (!this.apiKeyHash) {
      throw new Error('[PollarClient:keys] init() must be called before storage access');
    }
    return `${STORAGE_KEY_PREFIX}${this.apiKeyHash}`;
  }

  /**
   * Idempotent and safe under concurrency. Other methods auto-await this so
   * the manager is self-healing if `init()` was never explicitly invoked.
   */
  async init(): Promise<void> {
    if (this.privateKey) return;
    if (!this._initPromise) {
      this._initPromise = this._doInit().catch((err) => {
        // Loud log so init failures don't masquerade as cryptic "privateKey is
        // null" downstream errors. Clear the promise so the next call retries.
        console.error('[PollarClient:keys] NobleKeyManager init failed', err);
        this._initPromise = null;
        throw err;
      });
    }
    return this._initPromise;
  }

  private async _doInit(): Promise<void> {
    if (!this.apiKeyHash) {
      this.apiKeyHash = await hashApiKey(this.apiKey);
    }

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
    this.thumbprint = await computeJwkThumbprint(this.publicJwk);
  }

  async reset(): Promise<void> {
    try {
      if (this.apiKeyHash) await this.storage.remove(this.storageKey);
    } catch {
      // Best-effort.
    }
    this.privateKey = null;
    this.publicJwk = null;
    this.thumbprint = null;
    this._initPromise = null;
  }

  async getPublicJwk(): Promise<PublicEcJwk> {
    if (!this.publicJwk) await this.init();
    if (!this.publicJwk) {
      throw new Error('[PollarClient:keys] Keypair initialization failed; getPublicJwk unavailable');
    }
    return { kty: this.publicJwk.kty, crv: this.publicJwk.crv, x: this.publicJwk.x, y: this.publicJwk.y };
  }

  async getThumbprint(): Promise<string> {
    if (!this.thumbprint) await this.init();
    if (!this.thumbprint) {
      throw new Error('[PollarClient:keys] Keypair initialization failed; getThumbprint unavailable');
    }
    return this.thumbprint;
  }

  async sign(payload: Uint8Array): Promise<Uint8Array> {
    if (!this.privateKey) await this.init();
    if (!this.privateKey) {
      throw new Error('[PollarClient:keys] Keypair initialization failed; sign unavailable');
    }
    // Two-step: hash with `@noble/hashes` SHA-256, then sign the digest with
    // `prehash: false`. `p256.sign(msg)` with default prehash uses noble's
    // own internal preprocessing whose output is not bit-equivalent to a
    // simple SHA-256, so we explicitly compute the digest ourselves to
    // match standard JOSE ES256 verification.
    const digest = await sha256(payload);
    const signature = p256.sign(digest, this.privateKey, { prehash: false });
    // 64-byte r||s, exactly the JOSE/IEEE P1363 format JWS ES256 expects.
    return signature.toCompactRawBytes();
  }
}
