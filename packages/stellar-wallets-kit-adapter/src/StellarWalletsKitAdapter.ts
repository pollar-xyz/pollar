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
import { getInitNetwork } from './factory';

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
    // `refreshSupportedWallets()` probes every module's own `isAvailable()`
    // hook (modules promise <1000ms per the kit contract) and returns a
    // static snapshot. This avoids the old false-positive where we always
    // claimed availability and let `connect()` fail later — the picker / UI
    // can now short-circuit on `wallet_not_installed` immediately.
    try {
      const supported = await StellarWalletsKit.refreshSupportedWallets();
      const wallet = supported.find((w) => w.id === String(this.type));
      return wallet?.isAvailable ?? false;
    } catch (err) {
      console.warn(`[StellarWalletsKit] isAvailable probe failed for "${this.type}"`, err);
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
    return { address };
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
    if (options?.networkPassphrase !== undefined && options.networkPassphrase !== getInitNetwork()) {
      throw new Error(
        `[StellarWalletsKit] networkPassphrase override "${options.networkPassphrase}" does not match the network configured at init ("${getInitNetwork()}"). The kit is a global singleton — configure one network at \`stellarWalletsKit({ network })\` and use that for every call.`,
      );
    }
    StellarWalletsKit.setWallet(String(this.type));
    const result = await StellarWalletsKit.signTransaction(xdr, {
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
