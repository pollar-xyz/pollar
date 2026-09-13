/**
 * Public JWK shape for an EC P-256 key. Only the four required members for
 * RFC 7638 thumbprint computation; never includes private fields or extras
 * like `alg` / `use` / `kid`.
 */
export interface PublicEcJwk {
  kty: 'EC';
  crv: 'P-256';
  /** Base64url-encoded big-endian X coordinate (32 bytes). */
  x: string;
  /** Base64url-encoded big-endian Y coordinate (32 bytes). */
  y: string;
}

/**
 * Manages the per-session ECDSA P-256 keypair used to sign DPoP proofs.
 *
 * Implementations:
 * - `WebCryptoKeyManager` (web): non-extractable `CryptoKey` persisted in
 *   IndexedDB. Private key bytes never leave the browser's crypto context.
 * - `NobleKeyManager` (React Native): private scalar bytes stored through an
 *   injected `Storage` adapter (Keychain / SecureStore). Pure-JS ECDSA via
 *   `@noble/curves`.
 */
export interface KeyManager {
  /**
   * Load an existing key for this session or generate a new one. Idempotent.
   * Must be called before `getPublicJwk`, `getThumbprint`, or `sign`.
   */
  init(): Promise<void>;

  /**
   * Destroy the key. Removes it from persistent storage and clears any
   * cached state. Used on logout.
   */
  reset(): Promise<void>;

  /**
   * The public JWK that goes into the DPoP proof header. Returns a fresh
   * object every call (callers may mutate without affecting the manager).
   */
  getPublicJwk(): Promise<PublicEcJwk>;

  /**
   * RFC 7638 JWK thumbprint, base64url(SHA-256(canonical JWK)). The server
   * compares this to the access token's `cnf.jkt` claim.
   */
  getThumbprint(): Promise<string>;

  /**
   * Sign the given bytes with ECDSA-P256-SHA256. Returns 64-byte raw r||s
   * (IEEE P1363 / JOSE format), NOT DER. Suitable for direct base64url
   * encoding into the JWS signature segment.
   */
  sign(payload: Uint8Array): Promise<Uint8Array>;

  /**
   * OPTIONAL. Best-effort check that the current keypair is durably persisted
   * (re-writing it if needed) and will therefore survive a reload/relaunch.
   * Returns `false` when persistence is unavailable (e.g. IndexedDB blocked),
   * meaning any DPoP-bound token minted against this key will stop verifying
   * on the next cold start. `PollarClient` calls this right before binding a
   * login to the key so it can warn loudly instead of failing silently later.
   * Optional so custom `KeyManager` implementations remain source-compatible.
   */
  ensurePersisted?(): Promise<boolean>;

  /**
   * OPTIONAL. Drop the in-memory cached key WITHOUT touching persistent
   * storage, so the next operation re-loads whatever is persisted. The
   * persisted key is shared per origin/API key across tabs; after another tab
   * rotates it (logout -> fresh login), this instance's cached copy is stale
   * and would sign proofs the server rejects - and would trip the restore-time
   * `dpopJkt` binding check against the session the other tab just wrote.
   * `PollarClient` calls this on session teardown and before concluding that
   * a binding mismatch means the key is really lost. Optional so custom
   * `KeyManager` implementations remain source-compatible.
   */
  resync?(): void;
}
