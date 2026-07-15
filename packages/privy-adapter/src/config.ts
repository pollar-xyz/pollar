import type { WalletAdapterMeta } from '@pollar/core';

/**
 * Login methods this adapter drives through Privy and renders in the Pollar
 * login sub-modal. Intentionally a narrow subset of Privy's `loginMethods`
 * (email + the two social providers Pollar surfaces today); widen as needed.
 */
export type PrivyLoginMethod = 'email' | 'google' | 'github';

/**
 * Appearance hints forwarded to Privy. Same shape/intent as the relevant slice
 * of Privy's `PrivyClientConfig.appearance`, kept slim so this package never
 * needs to import a type from `@privy-io/react-auth`.
 */
export interface PollarPrivyAppearance {
  theme?: 'light' | 'dark';
  /** Accent color (hex) for Privy-owned surfaces (the embedded-wallet iframe UI). */
  accentColor?: string;
  /** Logo URL shown in Privy-owned surfaces. */
  logo?: string;
}

/**
 * Config for {@link createPrivyAdapter}. Shaped to feel familiar to anyone who
 * knows Privy's `PrivyClientConfig`, but defined locally so consumers never
 * install `@privy-io/react-auth` just for the types.
 */
export interface PollarPrivyConfig {
  /** Your Privy app id (Privy dashboard → app settings). */
  appId: string;
  /** Optional Privy app client id, for apps scoped to a specific client key. */
  clientId?: string;
  /**
   * Login methods to surface, in render order. Mirrors the intent of Privy's
   * `PrivyClientConfig.loginMethods`, narrowed to what this adapter drives.
   */
  loginMethods: PrivyLoginMethod[];
  /**
   * Optional appearance hints. Mirrors `PrivyClientConfig.appearance`. Applied on
   * web only; the React Native (Expo) entry does not forward it.
   */
  appearance?: PollarPrivyAppearance;
  /**
   * Reserved. Not currently applied to the OAuth flow (the web bridge uses
   * Privy's default redirect handling). Kept for forward compatibility.
   */
  redirectUri?: string;
  /**
   * Button label/icon shown in the Pollar login UI. Defaults to
   * `{ label: 'Privy' }`. Leave `meta.group` unset so Privy renders as its own
   * root button (not collapsed behind a wallet gateway).
   */
  meta?: WalletAdapterMeta;
  /**
   * Verbose `[privy-adapter]` console logging of the login/sign flow. Off by
   * default; turn on to trace why a login isn't reaching Pollar.
   */
  debug?: boolean;
  /**
   * After a web OAuth redirect returns, strip Privy's `privy_oauth_*` query
   * params from the URL (via `history.replaceState`, no reload) so the host
   * app's URL stays clean. On by default; set `false` to keep them.
   */
  cleanupOAuthRedirect?: boolean;
}
