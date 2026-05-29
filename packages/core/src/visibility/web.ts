import type { VisibilityProvider } from './types';

/**
 * Browser-backed visibility signal.
 *
 * Listens to three event sources because no single one is reliable on every
 * browser:
 *   - `visibilitychange` is the canonical signal but lags on Safari macOS
 *     when switching between windows of the same app.
 *   - `pageshow` / `pagehide` fire when the page enters/leaves BFCache on
 *     iOS Safari — `visibilitychange` does not.
 *   - `focus` / `blur` on window catch the macOS Safari multi-window case
 *     and are also the most-likely-to-fire signal on older browsers.
 *
 * Duplicate notifications are filtered by comparing against the last
 * dispatched state — listeners only see real transitions.
 */
export function createWebVisibilityProvider(): VisibilityProvider {
  const isVisibleNow = (): boolean =>
    typeof document === 'undefined' || document.visibilityState === 'visible';

  return {
    isVisible: isVisibleNow,
    onChange: (cb) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return () => {};
      }
      let last = isVisibleNow();
      const handler = (): void => {
        const next = isVisibleNow();
        if (next !== last) {
          last = next;
          cb(next);
        }
      };
      document.addEventListener('visibilitychange', handler);
      window.addEventListener('pageshow', handler);
      window.addEventListener('pagehide', handler);
      window.addEventListener('focus', handler);
      window.addEventListener('blur', handler);
      return () => {
        document.removeEventListener('visibilitychange', handler);
        window.removeEventListener('pageshow', handler);
        window.removeEventListener('pagehide', handler);
        window.removeEventListener('focus', handler);
        window.removeEventListener('blur', handler);
      };
    },
  };
}
