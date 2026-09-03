import { base64urlEncode } from '../lib/base64url';
import { hashApiKey } from '../lib/api-key-hash';
import { canonicalEcJwk, computeJwkThumbprint } from './thumbprint';
import type { KeyManager, PublicEcJwk } from './types';

/**
 * `KeyManager` backed by Web Crypto + IndexedDB. The ECDSA P-256 keypair is
 * generated with `extractable: false` for the private key - its bytes never
 * leave the browser's crypto subsystem. The `CryptoKeyPair` is persisted in
 * IndexedDB via structured clone (browsers serialize non-extractable keys
 * without exposing material).
 *
 * Per the W3C WebCrypto ECDSA spec, the public key is always extractable
 * regardless of the `extractable` argument, so `exportKey('jwk', publicKey)`
 * works for building the DPoP proof header.
 *
 * Residual XSS risk: an in-page script can still call `crypto.subtle.sign()`
 * on the same key handle to mint proofs. Non-extractable storage prevents
 * key exfiltration, not signing-oracle attacks. See SECURITY.md.
 */

const DB_NAME = 'pollar-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('[PollarClient:keys] IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = (): void => reject(req.error ?? new Error('[PollarClient:keys] IDB open failed'));
    req.onsuccess = (): void => resolve(req.result);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function awaitTx<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error('[PollarClient:keys] IDB request failed'));
  });
}

/**
 * Await a WRITE durably: a put/delete request's `onsuccess` fires before the
 * transaction actually commits, and a commit-time failure (quota, private-mode
 * eviction, serialization) aborts the transaction silently after that. Waiting
 * for the transaction's own `complete` event turns those silent losses into
 * caught errors - critical here, because a DPoP keypair that only *appeared*
 * to persist guarantees a thumbprint-mismatch logout on the next page load.
 */
function awaitWriteTx(tx: IDBTransaction, req: IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    req.onerror = (): void => reject(req.error ?? new Error('[PollarClient:keys] IDB write request failed'));
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error ?? new Error('[PollarClient:keys] IDB write transaction failed'));
    tx.onabort = (): void => reject(tx.error ?? new Error('[PollarClient:keys] IDB write transaction aborted'));
  });
}

async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const result = (await awaitTx(tx.objectStore(STORE_NAME).get(key))) as T | undefined;
    return result;
  } finally {
    db.close();
  }
}

async function dbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await awaitWriteTx(tx, tx.objectStore(STORE_NAME).put(value, key));
  } finally {
    db.close();
  }
}

async function dbDelete(key: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await awaitWriteTx(tx, tx.objectStore(STORE_NAME).delete(key));
  } finally {
    db.close();
  }
}

function isCryptoKeyPair(v: unknown): v is CryptoKeyPair {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as { privateKey?: unknown; publicKey?: unknown };
  return obj.privateKey !== undefined && obj.publicKey !== undefined;
}

export class WebCryptoKeyManager implements KeyManager {
  private readonly apiKey: string;
  private apiKeyHash: string | null = null;
  private keyPair: CryptoKeyPair | null = null;
  private publicJwk: PublicEcJwk | null = null;
  private thumbprint: string | null = null;
  /**
   * Cached in-flight init. Lets `init()` be called concurrently (or implicitly
   * from `getPublicJwk` / `sign`) without doing the work twice. Cleared on
   * failure so callers can retry, and cleared on `reset()`.
   */
  private _initPromise: Promise<void> | null = null;

  constructor(apiKey: string) {
    if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
      throw new Error('[PollarClient:keys] SubtleCrypto is unavailable. DPoP requires a secure context (HTTPS or localhost).');
    }
    this.apiKey = apiKey;
  }

  /**
   * Idempotent and safe under concurrency. The first call kicks off the real
   * init; subsequent (and concurrent) calls return the same in-flight promise.
   * Other methods (`getPublicJwk`, `getThumbprint`, `sign`) auto-await this so
   * the manager is self-healing if `init()` was never explicitly invoked.
   */
  async init(): Promise<void> {
    // All three fields, not just the pair: `_doInit` assigns `keyPair` and only
    // THEN awaits the JWK export + thumbprint. A caller landing in that window
    // would early-return on `keyPair` alone and find `publicJwk`/`thumbprint`
    // still null - `getThumbprint()` then threw "initialization failed" while
    // init was, in fact, mid-flight. Requiring all three makes such a caller
    // fall through and join the in-flight `_initPromise` instead.
    if (this.keyPair && this.publicJwk && this.thumbprint) return;
    if (!this._initPromise) {
      this._initPromise = this._doInit().catch((err) => {
        // Clear the promise so the next call retries instead of permanently
        // returning a rejected promise. The error propagates to the caller -
        // `PollarClient` logs it through its configured logger, so we don't
        // double-log (raw, ungated) here.
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

    let pair: CryptoKeyPair | undefined;
    try {
      pair = await dbGet<CryptoKeyPair>(this.apiKeyHash);
      if (pair && !isCryptoKeyPair(pair)) pair = undefined;
    } catch {
      // IDB unavailable (Safari private mode, sandboxed iframe, partitioned
      // storage in a 3rd-party iframe). Fall through to fresh keygen - we
      // lose persistence across reloads but the current session can sign.
      pair = undefined;
    }

    if (!pair) {
      pair = (await globalThis.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        // false -> private key non-extractable; per W3C ECDSA spec the public
        // key is always extractable regardless of this flag.
        false,
        ['sign', 'verify'],
      )) as CryptoKeyPair;
      try {
        await dbPut(this.apiKeyHash, pair);
      } catch {
        // Persistence failed but the in-memory pair still works for this session.
      }
    }

    this.keyPair = pair;
    this.publicJwk = await this._exportPublicJwk(pair.publicKey);
    this.thumbprint = await computeJwkThumbprint(this.publicJwk);
  }

  /**
   * Derive the public JWK from a `CryptoKey`. Prefers the `'raw'` export (the
   * 65-byte uncompressed point `0x04 || X(32) || Y(32)`) and base64url-encodes
   * the coordinates ourselves - that sidesteps polyfills whose `exportKey('jwk')`
   * emits non-base64url `x`/`y` (standard base64, `=` padding, or - as seen with
   * `react-native-quick-crypto` - a stray `.`). Real browsers and most polyfills
   * support `'raw'` for public EC keys.
   *
   * Falls back to the `'jwk'` export (normalized via `canonicalEcJwk`) if `'raw'`
   * is unsupported or returns an unexpected shape, so this can't regress on a
   * runtime that only implements the JWK path. Both routes yield identical
   * coordinate bytes, so the `cnf.jkt` thumbprint is unchanged either way.
   */
  private async _exportPublicJwk(publicKey: CryptoKey): Promise<PublicEcJwk> {
    try {
      const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', publicKey));
      // Uncompressed P-256 point: 65 bytes, leading 0x04 tag.
      if (raw.length !== 65 || raw[0] !== 0x04) {
        throw new Error(`[PollarClient:keys] Unexpected raw EC point (len=${raw.length}, tag=${raw[0]})`);
      }
      return {
        kty: 'EC',
        crv: 'P-256',
        x: base64urlEncode(raw.slice(1, 33)),
        y: base64urlEncode(raw.slice(33, 65)),
      };
    } catch {
      // 'raw' unsupported (or odd) on this runtime - fall back to the JWK export
      // and normalize its coordinates to unpadded base64url.
      const jwk = (await globalThis.crypto.subtle.exportKey('jwk', publicKey)) as JsonWebKey;
      return canonicalEcJwk(jwk);
    }
  }

  async reset(): Promise<void> {
    try {
      if (this.apiKeyHash) await dbDelete(this.apiKeyHash);
    } catch {
      // Best-effort cleanup; if IDB is unavailable there's nothing persisted to clear.
    }
    this.keyPair = null;
    this.publicJwk = null;
    this.thumbprint = null;
    this._initPromise = null;
  }

  /**
   * Re-persist the in-memory pair and verify that the pair IndexedDB holds is
   * that same key, by thumbprint. Idempotent and cheap (one put + one get).
   * Returns `false` when persistence is unavailable - or when the stored key is
   * someone else's - so the caller (the login flow) can warn that the session
   * will not survive a reload rather than letting a silent `dbPut` failure
   * surface later as an unexplained thumbprint-mismatch logout on the next
   * page load. Re-putting (rather than only probing) also heals
   * the case where another tab's `reset()` deleted the row this instance still
   * signs with - the key a new login binds is guaranteed to be the stored one.
   */
  async ensurePersisted(): Promise<boolean> {
    // The thumbprint too, not just the pair: it is what the read-back is checked
    // against, and `_doInit` publishes it one await after `keyPair`.
    if (!this.keyPair || !this.thumbprint) await this.init();
    if (!this.keyPair || !this.thumbprint || !this.apiKeyHash) return false;
    try {
      await dbPut(this.apiKeyHash, this.keyPair);
      const readBack = await dbGet<CryptoKeyPair>(this.apiKeyHash);
      if (!isCryptoKeyPair(readBack)) return false;
      // Compare thumbprints, not shapes: another tab can write its own pair
      // between the put and the get, and a shape check would accept it. The
      // login would then bind a key IndexedDB no longer holds, which is exactly
      // the thumbprint-mismatch logout this call exists to rule out.
      const storedThumbprint = await computeJwkThumbprint(await this._exportPublicJwk(readBack.publicKey));
      return storedThumbprint === this.thumbprint;
    } catch {
      return false;
    }
  }

  /**
   * Drop the in-memory cache; the next operation re-runs `init()` and adopts
   * whatever IndexedDB holds (another tab may have rotated the shared key).
   * Never touches persistent storage - that's `reset()`.
   */
  resync(): void {
    this.keyPair = null;
    this.publicJwk = null;
    this.thumbprint = null;
    this._initPromise = null;
  }

  async getPublicJwk(): Promise<PublicEcJwk> {
    if (!this.publicJwk) await this.init();
    if (!this.publicJwk) {
      throw new Error('[PollarClient:keys] Keypair initialization failed; getPublicJwk unavailable');
    }
    // Return a fresh copy so callers cannot mutate our cached state.
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
    if (!this.keyPair) await this.init();
    if (!this.keyPair) {
      throw new Error('[PollarClient:keys] Keypair initialization failed; sign unavailable');
    }
    // Cast through BufferSource: TypeScript 5.7's strict typing distinguishes
    // Uint8Array<ArrayBuffer> from Uint8Array<SharedArrayBuffer>, but every
    // payload we pass here is regular-ArrayBuffer-backed.
    const sig = await globalThis.crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      this.keyPair.privateKey,
      payload as unknown as BufferSource,
    );
    // For ECDSA P-256 with SHA-256, WebCrypto returns 64-byte raw r||s
    // (IEEE P1363 / JOSE format). No DER conversion needed.
    return new Uint8Array(sig);
  }
}
