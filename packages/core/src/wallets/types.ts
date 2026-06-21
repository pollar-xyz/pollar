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

export interface WalletAdapter {
  type: WalletId;
  isAvailable(): Promise<boolean>;
  connect(): Promise<ConnectWalletResponse>;
  disconnect(): Promise<void>;
  getPublicKey(): Promise<string | null>;
  signTransaction(xdr: string, options?: SignTransactionOptions): Promise<SignTransactionResponse>;
  signAuthEntry(entryXdr: string, options?: SignAuthEntryOptions): Promise<SignAuthEntryResponse>;
}

/**
 * Resolves a {@link WalletAdapter} for a given wallet id. Injected through
 * `PollarClientConfig.walletAdapter` so wallet implementations (Stellar
 * Wallets Kit, custom modules, etc.) can live outside `@pollar/core`.
 */
export type WalletAdapterResolver = (id: WalletId) => WalletAdapter | Promise<WalletAdapter>;
