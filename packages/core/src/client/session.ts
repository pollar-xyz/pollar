import { PollarApplicationConfigContent } from '../types';

export const STORAGE_KEY = 'pollar:session';

export function isValidSession(value: unknown): value is PollarApplicationConfigContent {
  if (typeof value !== 'object' || value === null) {
    console.warn('[PollarClient:session] Invalid session — value is not an object');
    return false;
  }

  const s = value as Record<string, unknown>;

  // clientSessionId: string
  if (typeof s['clientSessionId'] !== 'string' || s['clientSessionId'] === '') {
    console.warn('[PollarClient:session] Invalid session — clientSessionId missing or empty');
    return false;
  }

  // userId: string | null  (required, explicitly null or string)
  if (s['userId'] !== null && typeof s['userId'] !== 'string') {
    console.warn('[PollarClient:session] Invalid session — userId must be string or null, got:', typeof s['userId']);
    return false;
  }

  // status: string
  if (typeof s['status'] !== 'string') {
    console.warn('[PollarClient:session] Invalid session — status must be string, got:', typeof s['status']);
    return false;
  }

  // token: { accessToken: string, refreshToken: string, expiresAt: number }
  const token = s['token'];
  if (typeof token !== 'object' || token === null) {
    console.warn('[PollarClient:session] Invalid session — token missing or not an object');
    return false;
  }
  const t = token as Record<string, unknown>;
  if (typeof t['accessToken'] !== 'string' || t['accessToken'] === '') {
    console.warn('[PollarClient:session] Invalid session — token.accessToken missing or empty');
    return false;
  }
  if (typeof t['refreshToken'] !== 'string' || t['refreshToken'] === '') {
    console.warn('[PollarClient:session] Invalid session — token.refreshToken missing or empty');
    return false;
  }
  if (typeof t['expiresAt'] !== 'number' || !Number.isFinite(t['expiresAt'])) {
    console.warn('[PollarClient:session] Invalid session — token.expiresAt must be a finite number');
    return false;
  }

  // user: { id?: string, ready: boolean }
  const user = s['user'];
  if (typeof user !== 'object' || user === null) {
    console.warn('[PollarClient:session] Invalid session — user missing or not an object');
    return false;
  }
  const u = user as Record<string, unknown>;
  if (u['id'] !== undefined && typeof u['id'] !== 'string') {
    console.warn('[PollarClient:session] Invalid session — user.id must be string if present, got:', typeof u['id']);
    return false;
  }
  if (typeof u['ready'] !== 'boolean') {
    console.warn('[PollarClient:session] Invalid session — user.ready must be boolean, got:', typeof u['ready']);
    return false;
  }

  // wallet: { publicKey: string | null, existsOnStellar?: boolean, createdAt?: number }
  const wallet = s['wallet'];
  if (typeof wallet !== 'object' || wallet === null) {
    console.warn('[PollarClient:session] Invalid session — wallet missing or not an object');
    return false;
  }
  const w = wallet as Record<string, unknown>;
  if (w['publicKey'] !== null && typeof w['publicKey'] !== 'string') {
    console.warn(
      '[PollarClient:session] Invalid session — wallet.publicKey must be string or null, got:',
      typeof w['publicKey'],
    );
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

  // data: { mail, first_name, last_name, avatar: string, providers: {...} }
  const data = s['data'];
  if (typeof data !== 'object' || data === null) {
    console.warn('[PollarClient:session] Invalid session — data missing or not an object');
    return false;
  }
  const d = data as Record<string, unknown>;

  for (const field of ['mail', 'first_name', 'last_name', 'avatar'] as const) {
    if (typeof d[field] !== 'string') {
      console.warn(`[PollarClient:session] Invalid session — data.${field} must be string, got:`, typeof d[field]);
      return false;
    }
  }

  // providers: { email: {address:string}|null, google: {id:string}|null, github: {id:string}|null, wallet: {address:string}|null }
  const providers = d['providers'];
  if (typeof providers !== 'object' || providers === null) {
    console.warn('[PollarClient:session] Invalid session — data.providers missing or not an object');
    return false;
  }
  const p = providers as Record<string, unknown>;

  const providerInnerField = { email: 'address', google: 'id', github: 'id', wallet: 'address' } as const;

  for (const [field, innerField] of Object.entries(providerInnerField) as [keyof typeof providerInnerField, string][]) {
    const v = p[field];
    if (v === null) continue;
    if (typeof v !== 'object') {
      console.warn(`[PollarClient:session] Invalid session — data.providers.${field} must be object or null, got:`, typeof v);
      return false;
    }
    const vObj = v as Record<string, unknown>;
    if (typeof vObj[innerField] !== 'string' || vObj[innerField] === '') {
      console.warn(`[PollarClient:session] Invalid session — data.providers.${field}.${innerField} must be a non-empty string`);
      return false;
    }
  }

  return true;
}

export function readStorage(): PollarApplicationConfigContent | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as unknown;

    if (!isValidSession(session)) {
      localStorage.removeItem(STORAGE_KEY);
      console.warn('[PollarClient:session] Stored session is invalid — clearing storage');
      return null;
    }

    if (session.token.expiresAt * 1000 < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      console.warn('[PollarClient:session] Session token has expired — clearing storage');
      return null;
    }

    return session;
  } catch (error) {
    console.error('[PollarClient:session] Failed to parse session from storage', error);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function writeStorage(session: PollarApplicationConfigContent): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  console.info('[PollarClient:session] Session written to storage');
}

export function removeStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
  console.info('[PollarClient:session] Session removed from storage');
}
