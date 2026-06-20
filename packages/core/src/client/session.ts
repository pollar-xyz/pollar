import type { PollarLogger } from '../lib/logger';
import type { Storage } from '../storage/types';
import type { PollarPersistedSession } from '../types';

/**
 * Persisted session shape (stored via the injected `Storage` adapter).
 *
 * Compared to the full `/auth/login` response:
 *   - `data.{mail,first_name,last_name,avatar,providers}` is dropped — that
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

export function sessionStorageKey(apiKeyHash: string): string {
  return `pollar:${apiKeyHash}${SESSION_SUFFIX}`;
}

export function walletTypeStorageKey(apiKeyHash: string): string {
  return `pollar:${apiKeyHash}${WALLET_TYPE_SUFFIX}`;
}

const MAX_ACCESS_TOKEN = 4096;
const MAX_REFRESH_TOKEN = 4096;
const MAX_USER_ID = 64;
const MAX_CLIENT_SESSION_ID = 64;
const MAX_STATUS = 64;
const MAX_WALLET_PUBLIC_KEY = 128;
const MAX_WALLET_TYPE = 32;

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
  // This guard runs against BOTH the persisted shape (vocabulary `internal`)
  // and the raw `/auth/login` wire response (vocabulary `custodial`) — the login
  // flow validates the wire body here *before* `_storeSession` remaps
  // `custodial → internal`. So we tolerate `'custodial'` as the transitional
  // wire alias for `'internal'`; callers remap it (`_storeSession` on fresh
  // login, `readStorage` for legacy persisted sessions) before it reaches app
  // code. (Sessions persisted by older SDKs also carry a legacy `publicKey`
  // alias — `readStorage` backfills `address` from it before validation, so the
  // field is tolerated but no longer required.)
  const wallet = s['wallet'];
  if (typeof wallet !== 'object' || wallet === null) {
    logger.debug('[PollarClient:session] Invalid session — wallet missing or not an object');
    return false;
  }
  const w = wallet as Record<string, unknown>;
  if (w['type'] !== 'internal' && w['type'] !== 'smart' && w['type'] !== 'external' && w['type'] !== 'custodial') {
    logger.debug('[PollarClient:session] Invalid session — wallet.type must be internal|smart|external');
    return false;
  }
  if (w['provider'] !== undefined && typeof w['provider'] !== 'string') {
    logger.debug('[PollarClient:session] Invalid session — wallet.provider must be a string if present');
    return false;
  }
  if (w['address'] !== null && !isBoundedString(w['address'], MAX_WALLET_PUBLIC_KEY)) {
    logger.debug('[PollarClient:session] Invalid session — wallet.address must be string|null');
    return false;
  }
  if (w['existsOnStellar'] !== undefined && typeof w['existsOnStellar'] !== 'boolean') {
    logger.debug('[PollarClient:session] Invalid session — wallet.existsOnStellar must be boolean if present');
    return false;
  }
  if (w['createdAt'] !== undefined && (typeof w['createdAt'] !== 'number' || !Number.isFinite(w['createdAt']))) {
    logger.debug('[PollarClient:session] Invalid session — wallet.createdAt must be a finite number if present');
    return false;
  }
  if (w['linkedAt'] !== undefined && (typeof w['linkedAt'] !== 'number' || !Number.isFinite(w['linkedAt']))) {
    logger.debug('[PollarClient:session] Invalid session — wallet.linkedAt must be a finite number if present');
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
    // Migrate sessions persisted by older SDKs (≤0.8.x): they stored the wallet
    // address under the legacy `publicKey` key, and persisted the wire type
    // `'custodial'` (now remapped to `'internal'` at the client boundary).
    // Backfill `address` and remap the type so they pass validation and survive
    // the upgrade instead of forcing a re-login.
    if (typeof session === 'object' && session !== null) {
      const w = (session as { wallet?: Record<string, unknown> }).wallet;
      if (w && w['address'] == null && typeof w['publicKey'] === 'string') {
        w['address'] = w['publicKey'];
      }
      if (w && w['type'] === 'custodial') {
        w['type'] = 'internal';
      }
    }
    if (!isValidSession(session, logger)) {
      await storage.remove(sessionStorageKey(apiKeyHash));
      logger.warn('[PollarClient:session] Stored session is invalid — clearing storage');
      return null;
    }
    if (session.token.expiresAt * 1000 < Date.now()) {
      // AT expired — keep the session row so we can attempt /refresh; the
      // caller's refresh path will clear if refresh itself fails.
      return session;
    }
    return session;
  } catch (error) {
    logger.error('[PollarClient:session] Failed to parse session from storage', error);
    await storage.remove(sessionStorageKey(apiKeyHash));
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

/**
 * One-time migration: move a session (and its wallet-type) written under the
 * pre-0.10 8-hex namespace to the current wider namespace, so widening the
 * storage hash doesn't orphan stored state and look like a logout on upgrade.
 *
 * No-op once migrated (the new key already exists) or on a fresh install (no
 * legacy key). Never throws — a storage hiccup just means restore won't find a
 * session and the user logs in again. The matching DPoP key is migrated
 * separately inside the key manager so the session's `cnf.jkt` binding survives.
 */
export async function migrateLegacyStorage(
  storage: Storage,
  apiKeyHash: string,
  legacyApiKeyHash: string,
): Promise<void> {
  if (apiKeyHash === legacyApiKeyHash) return;
  for (const keyOf of [sessionStorageKey, walletTypeStorageKey]) {
    try {
      const nextKey = keyOf(apiKeyHash);
      if ((await storage.get(nextKey)) != null) continue; // already migrated / fresh session present
      const legacyKey = keyOf(legacyApiKeyHash);
      const legacyVal = await storage.get(legacyKey);
      if (legacyVal != null) {
        await storage.set(nextKey, legacyVal);
        await storage.remove(legacyKey);
      }
    } catch {
      // Leave both keys as-is; restore will simply miss and the user re-logs in.
    }
  }
}
