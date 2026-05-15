import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import type {
  ConnectWalletResponse,
  SignAuthEntryOptions,
  SignAuthEntryResponse,
  SignTransactionOptions,
  SignTransactionResponse,
  WalletAdapter,
  WalletId,
} from '@pollar/core';

/**
 * Wraps Stellar Wallets Kit so it satisfies the `@pollar/core` `WalletAdapter`
 * contract. The kit is a global singleton — `setWallet` is called before every
 * operation so the correct module handles the request, which lets a single
 * `StellarWalletsKit.init(...)` cover many wallet modules.
 */
export class StellarWalletsKitAdapter implements WalletAdapter {
  readonly type: WalletId;
  private _address: string | null = null;

  constructor(walletId: WalletId) {
    this.type = walletId;
  }

  async isAvailable(): Promise<boolean> {
    try {
      StellarWalletsKit.setWallet(String(this.type));
      // The kit doesn't expose a top-level `isAvailable`; once the module is
      // selected, attempting an address fetch is the cheapest probe — but it
      // can pop UI on some wallets. Return true and let `connect()` surface
      // the real availability error if any.
      return true;
    } catch {
      return false;
    }
  }

  async connect(): Promise<ConnectWalletResponse> {
    StellarWalletsKit.setWallet(String(this.type));
    const { address } = await StellarWalletsKit.fetchAddress();
    if (!address) {
      throw new Error(`[StellarWalletsKit] Empty address returned for wallet "${this.type}"`);
    }
    this._address = address;
    return { address, publicKey: address };
  }

  async disconnect(): Promise<void> {
    try {
      await StellarWalletsKit.disconnect();
    } finally {
      this._address = null;
    }
  }

  async getPublicKey(): Promise<string | null> {
    if (this._address) return this._address;
    try {
      const { address } = await StellarWalletsKit.getAddress();
      this._address = address ?? null;
      return this._address;
    } catch {
      return null;
    }
  }

  async signTransaction(xdr: string, options?: SignTransactionOptions): Promise<SignTransactionResponse> {
    StellarWalletsKit.setWallet(String(this.type));
    const result = await StellarWalletsKit.signTransaction(xdr, {
      ...(options?.networkPassphrase !== undefined && { networkPassphrase: options.networkPassphrase }),
      ...(options?.accountToSign !== undefined && { address: options.accountToSign }),
    });
    return { signedTxXdr: result.signedTxXdr };
  }

  async signAuthEntry(entryXdr: string, options?: SignAuthEntryOptions): Promise<SignAuthEntryResponse> {
    StellarWalletsKit.setWallet(String(this.type));
    const result = await StellarWalletsKit.signAuthEntry(entryXdr, {
      ...(options?.accountToSign !== undefined && { address: options.accountToSign }),
    });
    return { signedAuthEntry: result.signedAuthEntry };
  }
}
