import type { VisibilityProvider } from '../visibility/types';

/**
 * `AppState`-backed {@link VisibilityProvider} for React Native.
 *
 * Wire it into the silent-refresh scheduler so proactive token renewals are
 * skipped while the app is backgrounded and run the moment it returns to the
 * foreground — matching the web `visibilitychange` behavior and sidestepping
 * RN's aggressive background timer throttling.
 *
 * `react-native` is the consumer's framework (not a dependency of this SDK),
 * so the module is loaded lazily via dynamic `import('react-native')`. That
 * keeps web/Node bundles from ever resolving it. Because loading is async, the
 * factory is async too — mirror the `createSecureStoreAdapter` usage:
 *
 *   import { createAppStateVisibilityProvider } from '@pollar/core/adapters/react-native-appstate';
 *   const visibilityProvider = await createAppStateVisibilityProvider();
 *   new PollarClient({ apiKey, storage, visibilityProvider });
 */

/**
 * Minimal structural type for the slice of `react-native`'s `AppState` we use.
 * Typed here instead of importing the package's types because `react-native`
 * is an optional peer the SDK is not type-checked against.
 */
type AppStateApi = {
  currentState: string;
  addEventListener: (type: 'change', handler: (state: string) => void) => { remove: () => void };
};

async function loadAppState(): Promise<AppStateApi> {
  try {
    // @ts-expect-error -- optional peer dep; resolved at runtime in RN apps,
    // absent when the SDK is built or run on web/Node.
    const mod = await import('react-native');
    const AppState =
      (mod as { AppState?: AppStateApi }).AppState ?? (mod as { default?: { AppState?: AppStateApi } }).default?.AppState;
    if (!AppState) {
      throw new Error("'react-native' loaded but exposes no AppState export");
    }
    return AppState;
  } catch (error) {
    const message =
      `[PollarClient:visibility] Failed to load 'react-native' AppState. ` +
      `This adapter only runs inside a React Native app. ` +
      `Original error: ${error instanceof Error ? error.message : String(error)}`;
    throw new Error(message);
  }
}

/**
 * Create a `VisibilityProvider` backed by React Native's `AppState`.
 *
 * Throws (via the returned Promise) if `react-native` cannot be loaded.
 */
export async function createAppStateVisibilityProvider(): Promise<VisibilityProvider> {
  const AppState = await loadAppState();

  const isActive = (state: string): boolean => state === 'active';

  return {
    isVisible: () => isActive(AppState.currentState),
    onChange: (cb) => {
      // Filter duplicate notifications — listeners only see real transitions,
      // matching the web provider's contract. RN also emits 'inactive'
      // (iOS transition state) which we collapse into "not visible".
      let last = isActive(AppState.currentState);
      const subscription = AppState.addEventListener('change', (state) => {
        const next = isActive(state);
        if (next !== last) {
          last = next;
          cb(next);
        }
      });
      return () => subscription.remove();
    },
  };
}
