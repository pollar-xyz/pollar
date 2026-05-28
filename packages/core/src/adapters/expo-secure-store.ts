import type { Storage } from '../storage/types';

/**
 * Adapter that persists session and key material in the iOS Keychain / Android
 * Keystore via [`expo-secure-store`](https://docs.expo.dev/versions/latest/sdk/securestore/).
 *
 * `expo-secure-store` is an optional peer dependency; install it in your Expo
 * project with `npx expo install expo-secure-store`.
 *
 * The module is loaded lazily via dynamic `import('expo-secure-store')` so web
 * bundlers strip the dependency from web builds entirely.
 */

/**
 * Minimal structural type for the parts of `expo-secure-store` we use. We
 * type the surface here instead of importing the package's types because the
 * package is an optional peer dependency and may not be installed when this
 * SDK is type-checked (e.g. web-only consumers).
 */
type SecureStoreApi = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: { keychainAccessible?: number }) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
  /**
   * Default we use: requires the device to be unlocked and disables iCloud
   * Keychain backup of the value (so a stolen iCloud backup cannot exfiltrate
   * the SDK's private key material to another device).
   */
  WHEN_UNLOCKED_THIS_DEVICE_ONLY?: number;
};

/**
 * Hard cap per stored value. Generously above what the SDK actually writes
 * (sessions ≈ 600–800 bytes, private scalars ≈ 43 chars), and well within
 * iOS Keychain's practical limit. Refuses oversized writes loudly rather
 * than letting the platform truncate or silently fail.
 */
export const SECURE_STORE_MAX_VALUE_BYTES = 4096;

export interface SecureStoreAdapterOptions {
  /**
   * Override the iOS Keychain accessibility class. Defaults to
   * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` when available on the loaded module.
   * On Android this is a no-op (the platform manages access via Keystore).
   */
  keychainAccessible?: number;
}

async function loadSecureStore(): Promise<SecureStoreApi> {
  try {
    // @ts-expect-error -- optional peer dep; not present when the SDK is built or
    // when the SDK runs on web. Resolved at runtime in Expo / RN apps.
    const mod = await import('expo-secure-store');
    return mod as unknown as SecureStoreApi;
  } catch (error) {
    const message =
      `[PollarClient:storage] Failed to load 'expo-secure-store'. ` +
      `Install it in your Expo app: \`npx expo install expo-secure-store\`. ` +
      `Original error: ${error instanceof Error ? error.message : String(error)}`;
    throw new Error(message);
  }
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  // Fallback: count UTF-8 bytes manually for environments without TextEncoder.
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair → 4 bytes; advance the index.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Create a `Storage` adapter backed by Expo SecureStore.
 *
 * Throws synchronously (via the returned Promise) at construction time if
 * `expo-secure-store` cannot be loaded.
 */
export async function createSecureStoreAdapter(options: SecureStoreAdapterOptions = {}): Promise<Storage> {
  const SecureStore = await loadSecureStore();

  const accessible =
    options.keychainAccessible !== undefined ? options.keychainAccessible : SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

  return {
    async get(key) {
      return SecureStore.getItemAsync(key);
    },
    async set(key, value) {
      const size = utf8ByteLength(value);
      if (size > SECURE_STORE_MAX_VALUE_BYTES) {
        throw new Error(
          `[PollarClient:storage] Value for "${key}" is ${size} bytes, exceeds SecureStore limit ${SECURE_STORE_MAX_VALUE_BYTES}`,
        );
      }
      await SecureStore.setItemAsync(key, value, accessible !== undefined ? { keychainAccessible: accessible } : undefined);
    },
    async remove(key) {
      await SecureStore.deleteItemAsync(key);
    },
  };
}
