import type {
  ConnectWalletResponse,
  SignAuthEntryResponse,
  SignTransactionResponse,
  WalletAdapter,
  WalletAdapterMeta,
} from '@pollar/core';

/**
 * Signs a full Stellar transaction XDR for the user's Accessly Smart Account and
 * returns the signed XDR. The consumer wires this from `@accesly/react`'s
 * `useAccesly().tx` — typically `wallet.unlockForSigning` (passkey → Shamir →
 * ed25519 seed) followed by `tx.signRawXdr({ transactionXdr, ed25519Seed, expectedPublicKey })`.
 */
export type AccesslySignXdr = (xdr: string) => Promise<string>;

export interface AccesslyAdapterOptions {
  /** The user's Accessly Smart Account address (C-address, Soroban contract). */
  address: string;
  /** Signs a full transaction XDR via Accessly, returning the signed XDR. */
  signXdr: AccesslySignXdr;
  /** Button label/icon for the login UI. Defaults to `{ label: 'Accessly' }`. */
  meta?: WalletAdapterMeta;
}

const ACCESSLY_ID = 'accessly';

/**
 * Build a `@pollar/core` {@link WalletAdapter} for an Accessly Smart Account.
 *
 * Accessly is a self-custodial **smart wallet** (C-address Soroban contract,
 * passkey + Shamir-MPC ed25519 signer) that Accessly itself deploys and manages.
 * So `custody` is `'smart'`, but — unlike Pollar's own smart wallets — signing
 * happens **client-side** via Accessly's SDK: Pollar never holds the key and does
 * not deploy/sponsor/submit through wallet-service. The signed XDR is broadcast
 * via RPC, the same routing as an external wallet.
 *
 * @example
 * ```tsx
 * import { useAccesly } from '@accesly/react';
 * import { createAccesslyAdapter } from '@pollar/accessly-adapter';
 *
 * function buildAccesslyAdapter(address: string, username: string) {
 *   const { wallet, tx } = useAccesly();
 *   return createAccesslyAdapter({
 *     address, // the Accessly C-address
 *     signXdr: async (transactionXdr) => {
 *       const { ed25519Seed, expectedPublicKey } = await wallet.unlockForSigning(username);
 *       const { signedXdr } = await tx.signRawXdr({ transactionXdr, ed25519Seed, expectedPublicKey });
 *       return signedXdr;
 *     },
 *   });
 * }
 * // new PollarClient({ apiKey, walletAdapters: [buildAccesslyAdapter(addr, user)] });
 * ```
 *
 * PENDING CONFIRMATION: this assumes Accessly's `signRawXdr` signs an *arbitrary*
 * Pollar-built XDR for the account. If Accessly only signs SDK-built txs
 * (send/swap), Pollar's generic `buildTx` flow won't apply and Accessly must own
 * the tx flow instead. End-to-end login also needs Pollar's SEP-10 backend to
 * accept contract-account (C-address) auth.
 */
export function createAccesslyAdapter(options: AccesslyAdapterOptions): WalletAdapter {
  const { address, signXdr } = options;
  return {
    type: ACCESSLY_ID,
    meta: options.meta ?? { label: 'Accessly' },
    custody: 'smart',
    isAvailable: async () => true,
    connect: async (): Promise<ConnectWalletResponse> => ({ address }),
    disconnect: async () => {},
    getPublicKey: async () => address,
    signTransaction: async (txXdr: string): Promise<SignTransactionResponse> => ({
      signedTxXdr: await signXdr(txXdr),
    }),
    signAuthEntry: async (): Promise<SignAuthEntryResponse> => {
      // Accessly signs the full transaction envelope (signRawXdr); it does not
      // expose standalone Soroban auth-entry signing.
      throw new Error('[accessly-adapter] signAuthEntry is not supported; Accessly signs the full transaction XDR.');
    },
  };
}
