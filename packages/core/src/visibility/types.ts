/**
 * Pluggable "is the user looking at this app right now?" signal.
 *
 * Used by the silent-refresh scheduler so token renewals are skipped while
 * the tab is hidden / the app is backgrounded — both saves network and
 * works around aggressive `setTimeout` throttling that web browsers and RN
 * apply to non-foreground contexts.
 *
 * Default web implementation listens to `visibilitychange` plus
 * `pageshow`/`pagehide` (covers BFCache on iOS) and `focus`/`blur` (covers
 * the cases where `visibilitychange` lags). Default for non-browser
 * environments is a noop that always reports "visible".
 *
 * TODO(@pollar/react-native): when the dedicated RN package ships, it will
 * export an `AppState`-backed provider. Until then, RN consumers can wire
 * one inline:
 *
 *   import { AppState } from 'react-native';
 *   const rnVisibility = {
 *     isVisible: () => AppState.currentState === 'active',
 *     onChange: (cb) => {
 *       const sub = AppState.addEventListener('change', (s) => cb(s === 'active'));
 *       return () => sub.remove();
 *     },
 *   };
 *   new PollarClient({ apiKey, visibilityProvider: rnVisibility });
 */
export interface VisibilityProvider {
  isVisible(): boolean;
  /**
   * Subscribe to visibility transitions. The callback receives the new
   * visibility state (`true` = visible). Returns an unsubscribe function
   * that must detach every listener registered by this call.
   */
  onChange(cb: (visible: boolean) => void): () => void;
}
