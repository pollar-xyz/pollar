/**
 * Environment support guard.
 *
 * Privy ships official client SDKs only for React (`@privy-io/react-auth`),
 * React Native / Expo (`@privy-io/expo`), and the native mobile / game engines.
 * There is **no** Privy SDK for Angular, Vue, Svelte or vanilla JS. So this
 * adapter supports exactly two hosts: React (web) and Expo / React Native.
 *
 * We can't reliably fingerprint the host framework at build time — Angular, Vue
 * and React web all resolve the same "web" bundle (only the `react-native`
 * export condition is distinguishable). The support boundary is therefore
 * enforced at runtime: the adapter only works once a platform bridge
 * (`<PrivyAdapterProvider>` on web, the Expo provider on RN) mounts and attaches
 * its runtime. If none ever does — the typical Angular/Vue case — the first use
 * fails with {@link PrivyAdapterUnsupportedError} instead of hanging or throwing
 * a cryptic "react-auth not found".
 */
export class PrivyAdapterUnsupportedError extends Error {
  constructor(message: string = UNSUPPORTED_MESSAGE) {
    super(message);
    this.name = 'PrivyAdapterUnsupportedError';
  }
}

export const UNSUPPORTED_MESSAGE =
  '[privy-adapter] Unsupported environment: no Privy runtime was attached. This ' +
  'adapter currently supports only React (web, via @privy-io/react-auth) and ' +
  'Expo / React Native (via @privy-io/expo). Privy has no Angular or Vue SDK, so ' +
  'Privy login is not available there yet. On web/RN, make sure you mount ' +
  '<PrivyAdapterProvider> (web) or the Expo provider around your app. For non-React ' +
  'frameworks, use server-side signing via @pollar/privy-server-adapter instead.';

/** How long a method waits for a platform bridge to attach before giving up. */
export const RUNTIME_ATTACH_TIMEOUT_MS = 5_000;
