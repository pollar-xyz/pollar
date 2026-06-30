// Derived from stellar-wallet-kit by Tushar Pamnani (MIT)
// https://github.com/tusharpamnani/stellar-wallet-kit

// The `-native` suffix keeps these core built-in adapters from colliding with
// the Stellar Wallets Kit adapter ids, which use the canonical Stellar product
// ids `'freighter'` / `'albedo'`. Adapters register into a single registry keyed
// by `type`; without the suffix the kit's freighter/albedo would overwrite these
// built-ins (or vice versa), so both can't coexist. With distinct ids the native
// "Wallet" group and the kit group can each list their own Freighter/Albedo.
export enum WalletType {
  FREIGHTER = 'freighter-native',
  ALBEDO = 'albedo-native',
}

/**
 * A wallet identifier. Accepts the internal `WalletType` enum values
 * (`'freighter-native'`, `'albedo-native'`) plus any opaque string id used by
 * external adapter packages (e.g. Stellar Wallets Kit ids like `'xbull'`,
 * `'lobstr'`, or its own `'freighter'` / `'albedo'`). The `(string & {})` keeps
 * autocomplete on the enum values without rejecting arbitrary strings.
 */
export type WalletId = WalletType | (string & {});

export interface ConnectWalletResponse {
  address: string;
}

export interface SignTransactionOptions {
  network?: string;
  networkPassphrase?: string;
  accountToSign?: string;
}

export interface SignAuthEntryOptions {
  /** Stellar network the entry is signed against. Mirrors
   *  {@link SignTransactionOptions} so an adapter (e.g. Albedo) signs on the
   *  network currently configured on `PollarClient`, not a stale one captured at
   *  construction. Adapters that read the network from their own extension (e.g.
   *  Freighter) ignore these. */
  network?: string;
  networkPassphrase?: string;
  accountToSign?: string;
}

export interface SignTransactionResponse {
  signedTxXdr: string;
}

export interface SignAuthEntryResponse {
  signedAuthEntry: string;
}

/** UI metadata for the login button auto-rendered per registered adapter. */
export interface WalletAdapterMeta {
  /** Button label shown in the login UI (e.g. "Freighter", "Privy"). */
  label: string;
  /** Optional icon URL / data-URI for the button. */
  iconUrl?: string;
  /**
   * Optional gateway grouping for the login UI. Adapters that share the same
   * `group` string collapse behind a single gateway button (labeled with the
   * `group` value) that opens a sub-picker listing them — this is how the
   * Stellar Wallets Kit wallets (Freighter, Albedo, xBull, …) stay behind one
   * "Wallet" button. Adapters with no `group` render as their own button in the
   * root login view (e.g. Privy). Distinct group strings produce distinct
   * gateway buttons.
   */
  group?: string;
}

/**
 * A client-side wallet integration: it does its own auth/connect (Freighter
 * approve, Privy modal, SWK picker…) and signs. `@pollar/core` treats it as a
 * black box — it wraps the generic SEP-10 login + tx signing around `connect()`
 * and `signTransaction()`. Register instances via `PollarClientConfig.walletAdapters`.
 */
export interface WalletAdapter {
  /** Stable id — matches `login({ provider: id })` and the server-side wallet provider. */
  type: WalletId;
  /** UI metadata for the auto-rendered login button. */
  meta: WalletAdapterMeta;
  /** Where the signing key lives. Defaults to 'external' (client-signed). */
  custody?: 'external' | 'smart';
  isAvailable(): Promise<boolean>;
  connect(): Promise<ConnectWalletResponse>;
  disconnect(): Promise<void>;
  getPublicKey(): Promise<string | null>;
  signTransaction(xdr: string, options?: SignTransactionOptions): Promise<SignTransactionResponse>;
  signAuthEntry(entryXdr: string, options?: SignAuthEntryOptions): Promise<SignAuthEntryResponse>;
}

/** A single login option an {@link InteractiveAuthAdapter} can render. */
export type AuthOption = 'email' | 'google' | 'github';

/**
 * Optional capability layered on {@link WalletAdapter}: an adapter that drives a
 * multi-step login of its own (email OTP / OAuth) which the login UI renders as a
 * sub-modal, instead of the adapter being an opaque `connect()` black box.
 *
 * The UI calls these methods to run the provider login; once they resolve, it
 * triggers the normal `login({ provider })` so `connect()` runs and core does the
 * SEP-10 flow against the now-authenticated wallet. An adapter that implements
 * this (e.g. `@pollar/privy-adapter`) is detected via {@link isInteractiveAuthAdapter}.
 */
export interface InteractiveAuthAdapter extends WalletAdapter {
  /** Login options to render, in order. */
  getAuthOptions(): AuthOption[];
  /** Email login step 1: send the OTP. */
  sendEmailCode(email: string): Promise<void>;
  /** Email login step 2: verify the OTP; resolves once the provider authenticates. */
  verifyEmailCode(code: string): Promise<void>;
  /** OAuth login; resolves once the provider authenticates. */
  loginWithOAuth(provider: 'google' | 'github'): Promise<void>;
  /**
   * Optional: subscribe to the underlying provider's auth state. The host uses
   * this to auto-trigger `login({ provider })` when the provider authenticates
   * outside the sub-modal flow — e.g. after an OAuth redirect (the page reloaded,
   * so the sub-modal promise is gone) or a persisted provider session on load.
   * Fires on subscribe with the current state, then on changes. Returns an
   * unsubscribe function.
   */
  onProviderAuthChange?(callback: (state: ProviderAuthState) => void): () => void;
}

/** Auth state of an {@link InteractiveAuthAdapter}'s underlying provider. */
export interface ProviderAuthState {
  /** Whether the provider (e.g. Privy) reports an authenticated user. */
  authenticated: boolean;
  /** The provider's Stellar address once a wallet exists, else null. */
  address: string | null;
}

/** Runtime guard: does this adapter implement the interactive-login capability? */
export function isInteractiveAuthAdapter(adapter: WalletAdapter | null | undefined): adapter is InteractiveAuthAdapter {
  return (
    !!adapter &&
    typeof (adapter as InteractiveAuthAdapter).getAuthOptions === 'function' &&
    typeof (adapter as InteractiveAuthAdapter).sendEmailCode === 'function' &&
    typeof (adapter as InteractiveAuthAdapter).verifyEmailCode === 'function' &&
    typeof (adapter as InteractiveAuthAdapter).loginWithOAuth === 'function'
  );
}
