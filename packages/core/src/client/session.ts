import { PollarLoginState } from '../types';

export const STORAGE_KEY = 'pollar:session';

export function isValidSession(value: unknown): value is PollarLoginState {
  if (typeof value !== 'object' || value === null) {
    console.warn('[PollarClient][isValidSession] value is not an object:', value);
    return false;
  }

  const s = value as Record<string, unknown>;

  if (s['code'] !== 'SDK_LOGIN_SUCCESS') {
    console.warn('[PollarClient][isValidSession] code is not SDK_LOGIN_SUCCESS:', s['code']);
    return false;
  }

  if (typeof s['clientSessionId'] !== 'string' || s['clientSessionId'] === '') {
    console.warn('[PollarClient][isValidSession] clientSessionId is missing or empty:', s['clientSessionId']);
    return false;
  }

  if (s['userId'] !== null && typeof s['userId'] !== 'string') {
    console.warn('[PollarClient][isValidSession] userId is not a string or null:', s['userId']);
    return false;
  }

  if (typeof s['status'] !== 'string') {
    console.warn('[PollarClient][isValidSession] status is not a string:', s['status']);
    return false;
  }

  const token = s['token'];
  if (typeof token !== 'object' || token === null) {
    console.warn('[PollarClient][isValidSession] token is missing or not an object:', token);
    return false;
  }
  const t = token as Record<string, unknown>;
  if (typeof t['accessToken'] !== 'string' || t['accessToken'] === '') {
    console.warn('[PollarClient][isValidSession] token.accessToken is missing or empty:', t['accessToken']);
    return false;
  }
  if (typeof t['refreshToken'] !== 'string' || t['refreshToken'] === '') {
    console.warn('[PollarClient][isValidSession] token.refreshToken is missing or empty:', t['refreshToken']);
    return false;
  }
  if (typeof t['expiresAt'] !== 'number' || !Number.isFinite(t['expiresAt'])) {
    console.warn('[PollarClient][isValidSession] token.expiresAt is missing or not a finite number:', t['expiresAt']);
    return false;
  }

  const user = s['user'];
  if (typeof user !== 'object' || user === null) {
    console.warn('[PollarClient][isValidSession] user is missing or not an object:', user);
    return false;
  }
  const u = user as Record<string, unknown>;
  if (u['id'] !== undefined && typeof u['id'] !== 'string') {
    console.warn('[PollarClient][isValidSession] user.id is not a string:', u['id']);
    return false;
  }
  if (typeof u['ready'] !== 'boolean') {
    console.warn('[PollarClient][isValidSession] user.ready is not a boolean:', u['ready']);
    return false;
  }

  const wallet = s['wallet'];
  if (typeof wallet !== 'object' || wallet === null) {
    console.warn('[PollarClient][isValidSession] wallet is missing or not an object:', wallet);
    return false;
  }
  const w = wallet as Record<string, unknown>;
  if (w['publicKey'] !== null && typeof w['publicKey'] !== 'string') {
    console.warn('[PollarClient][isValidSession] wallet.publicKey is not a string or null:', w['publicKey']);
    return false;
  }

  const data = s['data'];
  if (typeof data !== 'object' || data === null) {
    console.warn('[PollarClient][isValidSession] data is missing or not an object:', data);
    return false;
  }
  const d = data as Record<string, unknown>;

  for (const field of ['mail', 'first_name', 'last_name', 'avatar'] as const) {
    if (typeof d[field] !== 'string') {
      console.warn(`[PollarClient][isValidSession] data.${field} is not a string:`, d[field]);
      return false;
    }
  }

  const providers = d['providers'];
  if (typeof providers !== 'object' || providers === null) {
    console.warn('[PollarClient][isValidSession] data.providers is missing or not an object:', providers);
    return false;
  }
  const p = providers as Record<string, unknown>;

  const providerInnerField = { email: 'address', google: 'id', github: 'id', wallet: 'address' } as const;

  for (const [field, innerField] of Object.entries(providerInnerField) as [keyof typeof providerInnerField, string][]) {
    const v = p[field];
    if (v === null) continue;
    if (typeof v !== 'object') {
      console.warn(`[PollarClient][isValidSession] data.providers.${field} is not an object or null:`, v);
      return false;
    }
    const vObj = v as Record<string, unknown>;
    if (typeof vObj[innerField] !== 'string' || vObj[innerField] === '') {
      console.warn(`[PollarClient][isValidSession] data.providers.${field}.${innerField} is not a string:`, vObj[innerField]);
      return false;
    }
  }

  return true;
}

export function readStorage(): PollarLoginState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as unknown;

    if (!isValidSession(session)) {
      localStorage.removeItem(STORAGE_KEY);
      console.warn('[PollarClient] Token not valid');
      return null;
    }

    if (session.token.expiresAt * 1000 < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      console.warn(`[PollarClient] Token expired: ${session.token.expiresAt}`);
      return null;
    }

    return session;
  } catch (error) {
    console.error('[PollarClient]', error);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function writeStorage(session: PollarLoginState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function removeStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}
