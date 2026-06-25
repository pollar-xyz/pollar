// Derived from stellar-wallet-kit by Tushar Pamnani (MIT)
// https://github.com/tusharpamnani/stellar-wallet-kit

export enum WalletType {
  FREIGHTER = 'freighter',
  ALBEDO = 'albedo',
}

/**
 * A wallet identifier. Accepts the internal `WalletType` enum values
 * (`'freighter'`, `'albedo'`) plus any opaque string id used by external
 * adapter packages (e.g. Stellar Wallets Kit ids like `'xbull'`, `'lobstr'`).
 * The `(string & {})` keeps autocomplete on the enum values without rejecting
 * arbitrary strings.
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
