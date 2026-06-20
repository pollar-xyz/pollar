import type { Storage } from '../storage/types';

/**
 * Adapter that persists session and key material in the iOS Keychain / Android
 * Keystore via [`react-native-keychain`](https://github.com/oblador/react-native-keychain).
 *
 * `react-native-keychain` is an optional peer dependency; install it in your
 * React Native project with `npm i react-native-keychain` (and follow its
 * iOS pod-install / Android linking instructions).
 *
 * The module is loaded lazily via dynamic `import('react-native-keychain')`
 * so web bundlers strip the dependency from web builds entirely.
 *
 * Storage model: one Keychain `service` per logical key. Each `Storage.set(k, v)`
 * call writes a separate Keychain entry under `service = k`; this keeps the
 * adapter simple but means the number of distinct keys you write should stay
 * bounded (the SDK uses 2–3 keys per `apiKeyHash`).
 */

type KeychainOptions = {
  service?: string;
  accessible?: string;
};

type KeychainCredentials = {
  username: string;
  password: string;
  service: string;
  storage?: string;
};

type KeychainApi = {
  setGenericPassword: (
    username: string,
    password: string,
    options?: KeychainOptions,
  ) => Promise<false | { service: string; storage?: string }>;
  getGenericPassword: (options?: KeychainOptions) => Promise<false | KeychainCredentials>;
  resetGenericPassword: (options?: KeychainOptions) => Promise<boolean>;
  ACCESSIBLE?: Record<string, string | undefined>;
};

/**
 * Hard cap per stored value. iOS Keychain has no formal byte limit but
 * practical limits sit a few KB; we refuse oversized writes loudly.
 */
export const KEYCHAIN_MAX_VALUE_BYTES = 4096;

export interface KeychainAdapterOptions {
  /**
   * Override the iOS Keychain accessibility class. Defaults to
   * `ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY` when available on the loaded
   * module — that prevents iCloud Keychain backup from carrying the SDK's
   * private key material to another device.
   */
  accessible?: string;
}

async function loadKeychain(): Promise<KeychainApi> {
  try {
    // @ts-expect-error -- optional peer dep; not present when the SDK is built or
    // when the SDK runs on web. Resolved at runtime in React Native apps.
    const mod = await import('react-native-keychain');
    return mod as unknown as KeychainApi;
  } catch (error) {
    const message =
      `[PollarClient:storage] Failed to load 'react-native-keychain'. ` +
      `Install it in your React Native app: \`npm i react-native-keychain\` ` +
      `(plus iOS pod install). Original error: ${error instanceof Error ? error.message : String(error)}`;
    throw new Error(message, { cause: error });
  }
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Create a `Storage` adapter backed by `react-native-keychain`.
 *
 * Throws (via the returned Promise) at construction time if the package
 * cannot be loaded.
 */
export async function createKeychainAdapter(options: KeychainAdapterOptions = {}): Promise<Storage> {
  const Keychain = await loadKeychain();

  const accessible: string | undefined =
    options.accessible !== undefined ? options.accessible : Keychain.ACCESSIBLE?.['WHEN_UNLOCKED_THIS_DEVICE_ONLY'];

  function buildOptions(key: string): KeychainOptions {
    const opts: KeychainOptions = { service: key };
    if (accessible !== undefined) opts.accessible = accessible;
    return opts;
  }

  return {
    async get(key) {
      const result = await Keychain.getGenericPassword({ service: key });
      if (result === false) return null;
      return result.password;
    },
    async set(key, value) {
      const size = utf8ByteLength(value);
      if (size > KEYCHAIN_MAX_VALUE_BYTES) {
        throw new Error(
          `[PollarClient:storage] Value for "${key}" is ${size} bytes, exceeds Keychain limit ${KEYCHAIN_MAX_VALUE_BYTES}`,
        );
      }
      // Use the storage key as both the username and the service so a
      // (service, account) lookup is unambiguous on both platforms.
      await Keychain.setGenericPassword(key, value, buildOptions(key));
    },
    async remove(key) {
      await Keychain.resetGenericPassword({ service: key });
    },
  };
}
