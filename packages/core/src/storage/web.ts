import type { OnStorageDegrade, Storage, StorageDegradeReason } from './types';

const LOG_PREFIX = '[PollarClient:storage]';

/**
 * In-memory storage backed by a `Map`. Always available, never throws.
 * Used as the default fallback for SSR, private browsing, sandboxed iframes
 * without `allow-same-origin`, or any environment where `localStorage` is
 * unusable.
 */
export function createMemoryAdapter(): Storage {
  const store = new Map<string, string>();

  return {
    async get(key) {
      const value = store.get(key);
      return value === undefined ? null : value;
    },
    async set(key, value) {
      store.set(key, value);
    },
    async remove(key) {
      store.delete(key);
    },
  };
}

export interface LocalStorageAdapterOptions {
  /**
   * Optional callback invoked the first time the adapter degrades to its
   * in-memory fallback (e.g. quota exceeded, throwing `localStorage`).
   */
  onDegrade?: OnStorageDegrade;
}

/**
 * `localStorage`-backed adapter that wraps every operation in try/catch and
 * silently degrades to an in-memory fallback for the rest of the process
 * lifetime on any throw. A single warning is logged when the degrade happens.
 *
 * Why every op (not just the probe): Safari private mode and sandboxed iframes
 * may expose `localStorage` but throw `QuotaExceededError` / `SecurityError`
 * on the first write — a successful probe at construction time isn't enough.
 */
export function createLocalStorageAdapter(options: LocalStorageAdapterOptions = {}): Storage {
  const fallback = createMemoryAdapter();
  let degraded = false;

  function degrade(reason: StorageDegradeReason, error?: unknown): void {
    if (degraded) return;
    degraded = true;
    console.warn(`${LOG_PREFIX} localStorage unavailable (${reason}); degrading to in-memory storage`);
    options.onDegrade?.(reason, error);
  }

  return {
    async get(key) {
      if (degraded) return fallback.get(key);
      try {
        return globalThis.localStorage.getItem(key);
      } catch (error) {
        degrade('read-failed', error);
        return fallback.get(key);
      }
    },
    async set(key, value) {
      if (degraded) return fallback.set(key, value);
      try {
        globalThis.localStorage.setItem(key, value);
      } catch (error) {
        const reason: StorageDegradeReason = isQuotaError(error) ? 'quota-exceeded' : 'write-failed';
        degrade(reason, error);
        await fallback.set(key, value);
      }
    },
    async remove(key) {
      if (degraded) return fallback.remove(key);
      try {
        globalThis.localStorage.removeItem(key);
      } catch (error) {
        degrade('remove-failed', error);
        await fallback.remove(key);
      }
    },
  };
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  const code = (error as { code?: unknown }).code;
  // Chrome/Edge: DOMException name 'QuotaExceededError' (code 22).
  // Firefox: 'NS_ERROR_DOM_QUOTA_REACHED' (code 1014).
  // Safari private mode: 'QuotaExceededError'.
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}
