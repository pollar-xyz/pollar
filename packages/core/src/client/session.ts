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

export function isValidSession(value: unknown): value is PollarPersistedSession {
  if (typeof value !== 'object' || value === null) {
    console.warn('[PollarClient:session] Invalid session — value is not an object');
    return false;
  }
  const s = value as Record<string, unknown>;

  if (!isBoundedString(s['clientSessionId'], MAX_CLIENT_SESSION_ID)) {
    console.warn('[PollarClient:session] Invalid session — clientSessionId missing/empty/too long');
    return false;
  }
  if (s['userId'] !== null && !isBoundedString(s['userId'], MAX_USER_ID)) {
    console.warn('[PollarClient:session] Invalid session — userId must be string|null');
    return false;
  }
  if (!isBoundedString(s['status'], MAX_STATUS)) {
    console.warn('[PollarClient:session] Invalid session — status must be string');
    return false;
  }

  const token = s['token'];
  if (typeof token !== 'object' || token === null) {
    console.warn('[PollarClient:session] Invalid session — token missing or not an object');
    return false;
  }
  const t = token as Record<string, unknown>;
  if (!isBoundedString(t['accessToken'], MAX_ACCESS_TOKEN)) {
    console.warn('[PollarClient:session] Invalid session — token.accessToken missing/empty/too long');
    return false;
  }
  if (!isBoundedString(t['refreshToken'], MAX_REFRESH_TOKEN)) {
    console.warn('[PollarClient:session] Invalid session — token.refreshToken missing/empty/too long');
    return false;
  }
  if (typeof t['expiresAt'] !== 'number' || !Number.isFinite(t['expiresAt'])) {
    console.warn('[PollarClient:session] Invalid session — token.expiresAt must be a finite number');
    return false;
  }

  const user = s['user'];
  if (typeof user !== 'object' || user === null) {
    console.warn('[PollarClient:session] Invalid session — user missing or not an object');
    return false;
  }
  const u = user as Record<string, unknown>;
  if (u['id'] !== undefined && !isBoundedString(u['id'], MAX_USER_ID)) {
    console.warn('[PollarClient:session] Invalid session — user.id must be string if present');
    return false;
  }
  if (typeof u['ready'] !== 'boolean') {
    console.warn('[PollarClient:session] Invalid session — user.ready must be boolean');
    return false;
  }

  const wallet = s['wallet'];
  if (typeof wallet !== 'object' || wallet === null) {
    console.warn('[PollarClient:session] Invalid session — wallet missing or not an object');
    return false;
  }
  const w = wallet as Record<string, unknown>;
  if (w['publicKey'] !== null && !isBoundedString(w['publicKey'], MAX_WALLET_PUBLIC_KEY)) {
    console.warn('[PollarClient:session] Invalid session — wallet.publicKey must be string|null');
    return false;
  }
  if (w['existsOnStellar'] !== undefined && typeof w['existsOnStellar'] !== 'boolean') {
    console.warn('[PollarClient:session] Invalid session — wallet.existsOnStellar must be boolean if present');
    return false;
  }
  if (w['createdAt'] !== undefined && (typeof w['createdAt'] !== 'number' || !Number.isFinite(w['createdAt']))) {
    console.warn('[PollarClient:session] Invalid session — wallet.createdAt must be a finite number if present');
    return false;
  }

  return true;
}

export async function readStorage(storage: Storage, apiKeyHash: string): Promise<PollarPersistedSession | null> {
  const raw = await storage.get(sessionStorageKey(apiKeyHash));
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as unknown;
    if (!isValidSession(session)) {
      await storage.remove(sessionStorageKey(apiKeyHash));
      console.warn('[PollarClient:session] Stored session is invalid — clearing storage');
      return null;
    }
    if (session.token.expiresAt * 1000 < Date.now()) {
      // AT expired — keep the session row so we can attempt /refresh; the
      // caller's refresh path will clear if refresh itself fails.
      return session;
    }
    return session;
  } catch (error) {
    console.error('[PollarClient:session] Failed to parse session from storage', error);
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
