/**
 * Pluggable storage interface used by `PollarClient` to persist session and
 * key material. All operations are async to accommodate native backends like
 * Expo SecureStore and react-native-keychain whose underlying APIs are async.
 */
export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Reasons emitted via `onStorageDegrade` when a primary storage backend
 * silently degrades to in-memory mode (e.g. Safari private mode quota errors,
 * sandboxed iframes without `allow-same-origin`, disabled storage).
 */
export type StorageDegradeReason =
  | 'unavailable'
  | 'probe-failed'
  | 'read-failed'
  | 'write-failed'
  | 'remove-failed'
  | 'quota-exceeded';

export type OnStorageDegrade = (reason: StorageDegradeReason, error?: unknown) => void;
