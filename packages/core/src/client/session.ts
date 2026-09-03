import type { PollarLogger } from '../lib/logger';
import type { Storage } from '../storage/types';
import type { PollarPersistedSession } from '../types';

/**
 * Persisted session shape (stored via the injected `Storage` adapter).
 *
 * Compared to the full `/auth/login` response:
 *   - `data.{mail,first_name,last_name,avatar,providers}` is dropped - that
 *     PII is held in memory only on `PollarClient`, fetched from
 *     `/applications/config` after auth.
 *   - All string fields are length-bounded as defense-in-depth: even though
 *     JWT/UUID/Stellar-pubkey shapes are bounded by their own grammars,
 *     bounding here catches hostile or buggy inputs before they hit downstream.
 *
 * Storage keys are namespaced per-`apiKeyHash` so swapping API keys can't
 * cross-contaminate sessions.
 */

const SESSION_SUFFIX = ':session';
const WALLET_TYPE_SUFFIX = ':walletType';
const DPOP_NONCE_SUFFIX = ':dpopNonce';

export function sessionStorageKey(apiKeyHash: string): string {
  return `pollar:${apiKeyHash}${SESSION_SUFFIX}`;
}

/**
 * Key for the last server-issued `DPoP-Nonce`.
 *
 * Deliberately NOT removed by `removeStorage`: the nonce is origin-scoped
 * server state, not session state. It is a stateless HMAC that sdk-api accepts
 * for days (24h active + a 3-day rotation overlap, see its lib/dpop-nonce.ts),
 * carries no user identity and grants nothing on its own, so keeping it across
 * page loads and logouts is safe - and it spares every cold start the
 * guaranteed 401 `use_dpop_nonce` challenge it otherwise pays before its first
 * authenticated request. A stale one costs exactly what having none costs: the
 * server answers with a fresh nonce and the middleware retries once.
 */
export function dpopNonceStorageKey(apiKeyHash: string): string {
  return `pollar:${apiKeyHash}${DPOP_NONCE_SUFFIX}`;
}

export function walletTypeStorageKey(apiKeyHash: string): string {
  return `pollar:${apiKeyHash}${WALLET_TYPE_SUFFIX}`;
}

// Bounds are defense-in-depth against a hostile/buggy blob, not a spec limit:
// exceeding one makes the whole session unreadable, so leave real headroom over
// the ~1-2 KB a DPoP-bound JWT actually costs.
const MAX_ACCESS_TOKEN = 8192;
const MAX_REFRESH_TOKEN = 8192;
const MAX_USER_ID = 64;
const MAX_CLIENT_SESSION_ID = 64;
const MAX_STATUS = 64;
const MAX_WALLET_PUBLIC_KEY = 128;
const MAX_WALLET_TYPE = 32;
// base64url(SHA-256) is exactly 43 chars; bound with headroom.
const MAX_DPOP_JKT = 64;
/** Bounds what we accept back from storage as a nonce (sdk-api mints ~60 chars). */
export const MAX_DPOP_NONCE = 512;
// One wallet per supported chain, with headroom. Bounds the persisted blob so a
// hostile or buggy `wallets[]` can't blow up storage or the validation loop.
const MAX_WALLETS = 16;

const KNOWN_WALLET_TYPES = new Set(['internal', 'smart', 'external']);
const KNOWN_CHAINS = new Set(['STELLAR', 'POLYGON', 'SOLANA']);

/**
 * "Does this build understand the entry at all?" Deliberately NOT the full
 * shape guard - it looks only at the two closed vocabularies a newer server can
 * extend (`type`, `chain`), so `readStorage` can prune entries from the future
 * instead of failing validation on the whole session.
 */
function isKnownWalletShape(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  if (typeof w['type'] === 'string' && !KNOWN_WALLET_TYPES.has(w['type'])) return false;
  if (typeof w['chain'] === 'string' && !KNOWN_CHAINS.has(w['chain'])) return false;
  return true;
}

function isBoundedString(v: unknown, max: number, allowEmpty = false): v is string {
  if (typeof v !== 'string') return false;
  if (!allowEmpty && v.length === 0) return false;
  return v.length <= max;
}

export function isValidSession(value: unknown, logger: PollarLogger = console): value is PollarPersistedSession {
  if (typeof value !== 'object' || value === null) {
    logger.debug('[PollarClient:session] Invalid session — value is not an object');
    return false;
  }
  const s = value as Record<string, unknown>;

  if (!isBoundedString(s['clientSessionId'], MAX_CLIENT_SESSION_ID)) {
    logger.debug('[PollarClient:session] Invalid session — clientSessionId missing/empty/too long');
    return false;
  }
  if (s['userId'] !== null && !isBoundedString(s['userId'], MAX_USER_ID)) {
    logger.debug('[PollarClient:session] Invalid session — userId must be string|null');
    return false;
  }
  if (!isBoundedString(s['status'], MAX_STATUS)) {
    logger.debug('[PollarClient:session] Invalid session — status must be string');
    return false;
  }

  const token = s['token'];
  if (typeof token !== 'object' || token === null) {
    logger.debug('[PollarClient:session] Invalid session — token missing or not an object');
    return false;
  }
  const t = token as Record<string, unknown>;
  if (!isBoundedString(t['accessToken'], MAX_ACCESS_TOKEN)) {
    logger.debug('[PollarClient:session] Invalid session — token.accessToken missing/empty/too long');
    return false;
  }
  if (!isBoundedString(t['refreshToken'], MAX_REFRESH_TOKEN)) {
    logger.debug('[PollarClient:session] Invalid session — token.refreshToken missing/empty/too long');
    return false;
  }
  if (typeof t['expiresAt'] !== 'number' || !Number.isFinite(t['expiresAt'])) {
    logger.debug('[PollarClient:session] Invalid session — token.expiresAt must be a finite number');
    return false;
  }

  // Optional DPoP key binding (see PollarPersistedSession.dpopJkt). Absent on
  // sessions persisted by older SDKs - never required.
  if (s['dpopJkt'] !== undefined && !isBoundedString(s['dpopJkt'], MAX_DPOP_JKT)) {
    logger.debug('[PollarClient:session] Invalid session — dpopJkt must be a non-empty string if present');
    return false;
  }

  const user = s['user'];
  if (typeof user !== 'object' || user === null) {
    logger.debug('[PollarClient:session] Invalid session — user missing or not an object');
    return false;
  }
  const u = user as Record<string, unknown>;
  if (u['id'] !== undefined && !isBoundedString(u['id'], MAX_USER_ID)) {
    logger.debug('[PollarClient:session] Invalid session — user.id must be string if present');
    return false;
  }
  if (typeof u['ready'] !== 'boolean') {
    logger.debug('[PollarClient:session] Invalid session — user.ready must be boolean');
    return false;
  }

  // The wallet object is always present; `type` discriminates internal (G,
  // platform-custodied), smart/passkey (C), and external wallets. `address` is
  // the on-chain address for all types.
  //
  // This guard runs against BOTH the persisted shape and the raw `/auth/login`
  // wire response; both speak the same vocabulary (`internal`), so no alias is
  // accepted here. Sessions persisted by older SDKs carry the legacy
  // `'custodial'` type and a legacy `publicKey` alias - `readStorage` remaps
  // the type and backfills `address` before validation, so those upgrade
  // instead of being rejected.
  if (!isValidWallet(s['wallet'], 'wallet', logger)) return false;

  // `wallets` is optional - sessions persisted before the field existed, and
  // logins against an sdk-api that predates it, simply have none. When present
  // it must be a bounded array whose entries satisfy the same shape as
  // `wallet`, so a caller reading either field gets the same guarantees.
  const wallets = s['wallets'];
  if (wallets !== undefined) {
    if (!Array.isArray(wallets)) {
      logger.debug('[PollarClient:session] Invalid session — wallets must be an array if present');
      return false;
    }
    if (wallets.length > MAX_WALLETS) {
      logger.debug('[PollarClient:session] Invalid session — wallets exceeds the maximum entry count');
      return false;
    }
    for (let i = 0; i < wallets.length; i++) {
      if (!isValidWallet(wallets[i], `wallets[${i}]`, logger)) return false;
    }
  }

  return true;
}

/**
 * Shape guard for a single persisted wallet, used for both the back-compat
 * `wallet` field and every entry of `wallets[]`. `label` only names the field
 * in the debug log.
 */
function isValidWallet(value: unknown, label: string, logger: PollarLogger): boolean {
  if (typeof value !== 'object' || value === null) {
    logger.debug(`[PollarClient:session] Invalid session — ${label} missing or not an object`);
    return false;
  }
  const w = value as Record<string, unknown>;
  if (w['type'] !== 'internal' && w['type'] !== 'smart' && w['type'] !== 'external') {
    logger.debug(`[PollarClient:session] Invalid session — ${label}.type must be internal|smart|external`);
    return false;
  }
  if (w['provider'] !== undefined && typeof w['provider'] !== 'string') {
    logger.debug(`[PollarClient:session] Invalid session — ${label}.provider must be a string if present`);
    return false;
  }
  if (w['address'] !== null && !isBoundedString(w['address'], MAX_WALLET_PUBLIC_KEY)) {
    logger.debug(`[PollarClient:session] Invalid session — ${label}.address must be string|null`);
    return false;
  }
  if (w['chain'] !== undefined && w['chain'] !== 'STELLAR' && w['chain'] !== 'POLYGON' && w['chain'] !== 'SOLANA') {
    logger.debug(`[PollarClient:session] Invalid session — ${label}.chain must be STELLAR|POLYGON|SOLANA if present`);
    return false;
  }
  if (w['existsOnStellar'] !== undefined && typeof w['existsOnStellar'] !== 'boolean') {
    logger.debug(`[PollarClient:session] Invalid session — ${label}.existsOnStellar must be boolean if present`);
    return false;
  }
  if (
    w['provisioning'] !== undefined &&
    w['provisioning'] !== 'READY' &&
    w['provisioning'] !== 'CREATING' &&
    w['provisioning'] !== 'FAILED'
  ) {
    logger.debug(`[PollarClient:session] Invalid session — ${label}.provisioning must be READY|CREATING|FAILED if present`);
    return false;
  }
  if (w['createdAt'] !== undefined && (typeof w['createdAt'] !== 'number' || !Number.isFinite(w['createdAt']))) {
    logger.debug(`[PollarClient:session] Invalid session — ${label}.createdAt must be a finite number if present`);
    return false;
  }
  if (w['linkedAt'] !== undefined && (typeof w['linkedAt'] !== 'number' || !Number.isFinite(w['linkedAt']))) {
    logger.debug(`[PollarClient:session] Invalid session — ${label}.linkedAt must be a finite number if present`);
    return false;
  }
  return true;
}

export async function readStorage(
  storage: Storage,
  apiKeyHash: string,
  logger: PollarLogger = console,
): Promise<PollarPersistedSession | null> {
  const raw = await storage.get(sessionStorageKey(apiKeyHash));
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as unknown;
    // Migrate sessions persisted by older SDKs (<=0.8.x): they stored the wallet
    // address under the legacy `publicKey` key, and persisted the old wire type
    // `'custodial'` (the wire now emits `'internal'` directly). Backfill
    // `address` and remap the type so they pass validation and survive the
    // upgrade instead of forcing a re-login.
    if (typeof session === 'object' && session !== null) {
      const w = (session as { wallet?: Record<string, unknown> }).wallet;
      if (w && w['address'] == null && typeof w['publicKey'] === 'string') {
        w['address'] = w['publicKey'];
      }
      if (w && w['type'] === 'custodial') {
        w['type'] = 'internal';
      }
      // Forward compatibility: a row written by a NEWER SDK - or by a login
      // against a newer sdk-api - can carry `wallets[]` entries for a chain or
      // wallet type this build does not model. Pruning the unknown entries keeps
      // the session usable; rejecting the whole row would strand the user
      // logged-out on nothing worse than a vocabulary it has never seen.
      const list = (session as { wallets?: unknown }).wallets;
      if (Array.isArray(list)) {
        const known = list.filter((entry) => isKnownWalletShape(entry));
        if (known.length !== list.length) {
          logger.warn('[PollarClient:session] Pruned wallets[] entries this SDK does not recognize', {
            dropped: list.length - known.length,
          });
          (session as { wallets?: unknown }).wallets = known;
        }
      }
    }
    if (!isValidSession(session, logger)) {
      // Deliberately NOT removed. The row is shared by every document on the
      // origin, and in a browser the removal emits a `storage` event that tears
      // the session down in all of them - so one document running an older
      // build, or hitting a bound, would log everybody out. A row this build
      // cannot read is simply ignored; the next login overwrites it.
      logger.warn('[PollarClient:session] Stored session is invalid — ignoring it (left in storage)');
      return null;
    }
    if (session.token.expiresAt * 1000 < Date.now()) {
      // AT expired - keep the session row so we can attempt /refresh; the
      // caller's refresh path will clear if refresh itself fails.
      return session;
    }
    return session;
  } catch (error) {
    // Same reasoning as the invalid-session branch: never delete a shared row we
    // merely failed to read.
    logger.error('[PollarClient:session] Failed to parse session from storage', error);
    return null;
  }
}

export async function writeStorage(storage: Storage, apiKeyHash: string, session: PollarPersistedSession): Promise<void> {
  await storage.set(sessionStorageKey(apiKeyHash), JSON.stringify(session));
}

export async function removeStorage(storage: Storage, apiKeyHash: string): Promise<void> {
  await storage.remove(sessionStorageKey(apiKeyHash));
  await storage.remove(walletTypeStorageKey(apiKeyHash));
}

export async function writeWalletType(storage: Storage, apiKeyHash: string, type: string): Promise<void> {
  if (type.length > MAX_WALLET_TYPE) {
    throw new Error(`[PollarClient:session] walletType too long: ${type.length} > ${MAX_WALLET_TYPE}`);
  }
  await storage.set(walletTypeStorageKey(apiKeyHash), type);
}

export async function readWalletType(storage: Storage, apiKeyHash: string): Promise<string | null> {
  return storage.get(walletTypeStorageKey(apiKeyHash));
}
