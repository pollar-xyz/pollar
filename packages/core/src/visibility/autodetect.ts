import { createNoopVisibilityProvider } from './noop';
import type { VisibilityProvider } from './types';
import { createWebVisibilityProvider } from './web';

/**
 * Picks a `VisibilityProvider` based on the runtime: browser → web provider,
 * anything else → noop. React Native consumers should pass an `AppState`-
 * backed provider explicitly via `PollarClientConfig.visibilityProvider`
 * (see the TODO in `./types.ts`).
 */
export function defaultVisibilityProvider(): VisibilityProvider {
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    return createWebVisibilityProvider();
  }
  return createNoopVisibilityProvider();
}
