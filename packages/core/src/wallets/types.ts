// Derived from stellar-wallet-kit by Tushar Pamnani (MIT)
// https://github.com/tusharpamnani/stellar-wallet-kit

export enum WalletType {
  FREIGHTER = 'freighter',
  ALBEDO = 'albedo',
}

export interface ConnectWalletResponse {
  address: string;
  publicKey: string;
}

export interface SignTransactionOptions {
  network?: string;
  networkPassphrase?: string;
  accountToSign?: string;
}

export interface SignAuthEntryOptions {
  accountToSign?: string;
}

export interface SignTransactionResponse {
  signedTxXdr: string;
}

export interface SignAuthEntryResponse {
  signedAuthEntry: string;
}

export interface WalletAdapter {
  type: WalletType;
  isAvailable(): Promise<boolean>;
  connect(): Promise<ConnectWalletResponse>;
  disconnect(): Promise<void>;
  getPublicKey(): Promise<string | null>;
  signTransaction(xdr: string, options?: SignTransactionOptions): Promise<SignTransactionResponse>;
  signAuthEntry(entryXdr: string, options?: SignAuthEntryOptions): Promise<SignAuthEntryResponse>;
}