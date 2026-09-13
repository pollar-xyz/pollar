import type { VisibilityProvider } from './types';

/**
 * Always-visible provider with no event subscriptions. Used for SSR / Node
 * contexts where the silent-refresh scheduler should not be gated by a
 * non-existent foreground signal. Also useful in tests.
 */
export function createNoopVisibilityProvider(): VisibilityProvider {
  return {
    isVisible: () => true,
    onChange: () => () => {},
  };
}
