import { canonicalEcJwk, computeJwkThumbprint } from './thumbprint';
import type { KeyManager, PublicEcJwk } from './types';

/**
 * `KeyManager` backed by Web Crypto + IndexedDB. The ECDSA P-256 keypair is
 * generated with `extractable: false` for the private key — its bytes never
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
    req.onerror = (): void => reject(req.error ?? new Error('IDB open failed'));
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
    req.onerror = (): void => reject(req.error ?? new Error('IDB request failed'));
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
    await awaitTx(tx.objectStore(STORE_NAME).put(value, key));
  } finally {
    db.close();
  }
}

async function dbDelete(key: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await awaitTx(tx.objectStore(STORE_NAME).delete(key));
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
  private readonly apiKeyHash: string;
  private keyPair: CryptoKeyPair | null = null;
  private publicJwk: PublicEcJwk | null = null;
  private thumbprint: string | null = null;

  constructor(apiKeyHash: string) {
    if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
      throw new Error(
        '[PollarClient:keys] SubtleCrypto is unavailable. DPoP requires a secure context (HTTPS or localhost).',
      );
    }
    this.apiKeyHash = apiKeyHash;
  }

  async init(): Promise<void> {
    if (this.keyPair) return;

    let pair: CryptoKeyPair | undefined;
    try {
      pair = await dbGet<CryptoKeyPair>(this.apiKeyHash);
      if (pair && !isCryptoKeyPair(pair)) pair = undefined;
    } catch {
      // IDB unavailable (Safari private mode, sandboxed iframe, partitioned
      // storage in a 3rd-party iframe). Fall through to fresh keygen — we
      // lose persistence across reloads but the current session can sign.
      pair = undefined;
    }

    if (!pair) {
      pair = (await globalThis.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        // false → private key non-extractable; per W3C ECDSA spec the public
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
    const exported = (await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
    this.publicJwk = canonicalEcJwk(exported);
    this.thumbprint = computeJwkThumbprint(this.publicJwk);
  }

  async reset(): Promise<void> {
    try {
      await dbDelete(this.apiKeyHash);
    } catch {
      // Best-effort cleanup; if IDB is unavailable there's nothing persisted to clear.
    }
    this.keyPair = null;
    this.publicJwk = null;
    this.thumbprint = null;
  }

  async getPublicJwk(): Promise<PublicEcJwk> {
    if (!this.publicJwk) {
      throw new Error('[PollarClient:keys] init() must be called before getPublicJwk()');
    }
    // Return a fresh copy so callers cannot mutate our cached state.
    return { kty: this.publicJwk.kty, crv: this.publicJwk.crv, x: this.publicJwk.x, y: this.publicJwk.y };
  }

  async getThumbprint(): Promise<string> {
    if (!this.thumbprint) {
      throw new Error('[PollarClient:keys] init() must be called before getThumbprint()');
    }
    return this.thumbprint;
  }

  async sign(payload: Uint8Array): Promise<Uint8Array> {
    if (!this.keyPair) {
      throw new Error('[PollarClient:keys] init() must be called before sign()');
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
