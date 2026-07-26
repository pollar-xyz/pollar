// Derived from stellar-wallet-kit by Tushar Pamnani (MIT)
// https://github.com/tusharpamnani/stellar-wallet-kit

import {
  getAddress,
  getNetwork,
  isAllowed,
  isConnected,
  requestAccess,
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

/**
 * freighter-api v6 returns `{ ...data, error? }` on every call instead of the
 * bare values / thrown errors of v2. This helper turns that error envelope into
 * a thrown `Error` so the adapter keeps the same throw-on-failure contract the
 * rest of `@pollar/core` expects.
 */
function unwrap<T extends { error?: { message: string } }>(result: T, context: string): Omit<T, 'error'> {
  if (result.error) {
    throw new Error(`Freighter ${context} failed: ${result.error.message}`);
  }
  return result;
}

export class FreighterAdapter implements WalletAdapter {
  readonly type = WalletType.FREIGHTER;
  readonly meta = { label: 'Freighter', group: 'Wallet' };
  readonly custody = 'external' as const;

  async isAvailable(): Promise<boolean> {
    try {
      const { isConnected: connected } = await isConnected();
      return connected;
    } catch {
      return false;
    }
  }

  async connect(): Promise<ConnectWalletResponse> {
    const { isConnected: connected } = await isConnected();
    if (!connected) {
      throw new Error('Freighter wallet is not installed');
    }

    // `requestAccess` prompts the user (if not already granted) and returns the
    // active address — it replaces the v2 `isAllowed`/`setAllowed`/`getUserInfo`
    // dance in a single call.
    const { address } = unwrap(await requestAccess(), 'requestAccess');
    if (!address) {
      throw new Error('Failed to get address from Freighter');
    }

    return { address };
  }

  async disconnect(): Promise<void> {
    // Freighter does not expose a programmatic disconnect
  }

  async getPublicKey(): Promise<string | null> {
    try {
      // Non-prompting: only report an address when access is already granted, so
      // this stays side-effect-free (no Freighter popup) unlike `connect`.
      const { isAllowed: allowed } = await isAllowed();
      if (!allowed) return null;
      const { address, error } = await getAddress();
      if (error || !address) return null;
      return address;
    } catch {
      return null;
    }
  }

  async getNetwork(): Promise<string> {
    const { network } = unwrap(await getNetwork(), 'getNetwork');
    return network;
  }

  async signTransaction(xdr: string, options?: SignTransactionOptions): Promise<SignTransactionResponse> {
    // v6 dropped the `network` option; it derives the network from
    // `networkPassphrase`. `accountToSign` is now `address`. Omit undefined keys
    // rather than passing them (the build runs `exactOptionalPropertyTypes`).
    const { signedTxXdr } = unwrap(await signTransaction(xdr, freighterOpts(options)), 'signTransaction');
    if (!signedTxXdr) {
      throw new Error('Invalid response from Freighter');
    }
    return { signedTxXdr };
  }

  async signAuthEntry(entryXdr: string, options?: SignAuthEntryOptions): Promise<SignAuthEntryResponse> {
    const { signedAuthEntry } = unwrap(await signAuthEntry(entryXdr, freighterOpts(options)), 'signAuthEntry');
    if (!signedAuthEntry) {
      throw new Error('Invalid response from Freighter');
    }
    return { signedAuthEntry };
  }
}

/** Map our `{ networkPassphrase, accountToSign }` options onto freighter-api v6's
 *  `{ networkPassphrase?, address? }`, omitting undefined keys. */
function freighterOpts(options?: SignTransactionOptions | SignAuthEntryOptions): { networkPassphrase?: string; address?: string } {
  const opts: { networkPassphrase?: string; address?: string } = {};
  if (options?.networkPassphrase) opts.networkPassphrase = options.networkPassphrase;
  if (options?.accountToSign) opts.address = options.accountToSign;
  return opts;
}
