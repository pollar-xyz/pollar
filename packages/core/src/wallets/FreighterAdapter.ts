// Derived from stellar-wallet-kit by Tushar Pamnani (MIT)
// https://github.com/tusharpamnani/stellar-wallet-kit

import {
  getNetwork,
  getUserInfo,
  isAllowed,
  isConnected,
  setAllowed,
  signAuthEntry,
  signTransaction,
} from '@stellar/freighter-api';

import type {
  ConnectWalletResponse,
  SignAuthEntryOptions,
  SignAuthEntryResponse,
  SignTransactionOptions,
  SignTransactionResponse,
  WalletAdapter,
} from './types';
import { WalletType } from './types';

export class FreighterAdapter implements WalletAdapter {
  readonly type = WalletType.FREIGHTER;

  async isAvailable(): Promise<boolean> {
    try {
      return await isConnected();
    } catch {
      return false;
    }
  }

  async connect(): Promise<ConnectWalletResponse> {
    const connected = await isConnected();
    if (!connected) {
      throw new Error('Freighter wallet is not installed');
    }

    const allowed = await isAllowed();
    if (!allowed) {
      await setAllowed();
    }

    const userInfo = await getUserInfo();
    if (!userInfo?.publicKey) {
      throw new Error('Failed to get user information from Freighter');
    }

    return { address: userInfo.publicKey, publicKey: userInfo.publicKey };
  }

  async disconnect(): Promise<void> {
    // Freighter does not expose a programmatic disconnect
  }

  async getPublicKey(): Promise<string | null> {
    try {
      const allowed = await isAllowed();
      if (!allowed) return null;
      const userInfo = await getUserInfo();
      return userInfo?.publicKey ?? null;
    } catch {
      return null;
    }
  }

  async getNetwork(): Promise<string> {
    return getNetwork();
  }

  async signTransaction(xdr: string, options?: SignTransactionOptions): Promise<SignTransactionResponse> {
    const result = await signTransaction(xdr, {
      network: options?.network,
      networkPassphrase: options?.networkPassphrase,
      accountToSign: options?.accountToSign,
    });
    if (!result || typeof result !== 'string') {
      throw new Error('Invalid response from Freighter');
    }
    return { signedTxXdr: result };
  }

  async signAuthEntry(entryXdr: string, options?: SignAuthEntryOptions): Promise<SignAuthEntryResponse> {
    const result = await signAuthEntry(entryXdr, { accountToSign: options?.accountToSign });
    if (!result || typeof result !== 'string') {
      throw new Error('Invalid response from Freighter');
    }
    return { signedAuthEntry: result };
  }
}
