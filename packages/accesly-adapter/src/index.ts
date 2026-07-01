import type {
  ConnectWalletResponse,
  SignAuthEntryResponse,
  SignTransactionResponse,
  WalletAdapter,
  WalletAdapterMeta,
} from '@pollar/core';

/**
 * Signs a full Stellar transaction XDR for the user's Accesly Smart Account and
 * returns the signed XDR. The consumer wires this from `@accesly/react`'s
 * `useAccesly().tx` — typically `wallet.unlockForSigning` (passkey → Shamir →
 * ed25519 seed) followed by `tx.signRawXdr({ transactionXdr, ed25519Seed, expectedPublicKey })`.
 */
export type AcceslySignXdr = (xdr: string) => Promise<string>;

export interface AcceslyAdapterOptions {
  /** The user's Accesly Smart Account address (C-address, Soroban contract). */
  address: string;
  /** Signs a full transaction XDR via Accesly, returning the signed XDR. */
  signXdr: AcceslySignXdr;
  /** Button label/icon for the login UI. Defaults to `{ label: 'Accesly' }`. */
  meta?: WalletAdapterMeta;
}

const ACCESLY_ID = 'accesly';

/**
 * Build a `@pollar/core` {@link WalletAdapter} for an Accesly Smart Account.
 *
 * Accesly is a self-custodial **smart wallet** (C-address Soroban contract,
 * passkey + Shamir-MPC ed25519 signer) that Accesly itself deploys and manages.
 * So `custody` is `'smart'`, but — unlike Pollar's own smart wallets — signing
 * happens **client-side** via Accesly's SDK: Pollar never holds the key and does
 * not deploy/sponsor/submit through wallet-service. The signed XDR is broadcast
 * via RPC, the same routing as an external wallet.
 *
 * @example
 * ```tsx
 * import { useAccesly } from '@accesly/react';
 * import { createAcceslyAdapter } from '@pollar/accesly-adapter';
 *
 * function buildAcceslyAdapter(address: string, username: string) {
 *   const { wallet, tx } = useAccesly();
 *   return createAcceslyAdapter({
 *     address, // the Accesly C-address
 *     signXdr: async (transactionXdr) => {
 *       const { ed25519Seed, expectedPublicKey } = await wallet.unlockForSigning(username);
 *       const { signedXdr } = await tx.signRawXdr({ transactionXdr, ed25519Seed, expectedPublicKey });
 *       return signedXdr;
 *     },
 *   });
 * }
 * // new PollarClient({ apiKey, walletAdapters: [buildAcceslyAdapter(addr, user)] });
 * ```
 *
 * PENDING CONFIRMATION: this assumes Accesly's `signRawXdr` signs an *arbitrary*
 * Pollar-built XDR for the account. If Accesly only signs SDK-built txs
 * (send/swap), Pollar's generic `buildTx` flow won't apply and Accesly must own
 * the tx flow instead. End-to-end login also needs Pollar's SEP-10 backend to
 * accept contract-account (C-address) auth.
 */
export function createAcceslyAdapter(options: AcceslyAdapterOptions): WalletAdapter {
  const { address, signXdr } = options;
  return {
    type: ACCESLY_ID,
    meta: options.meta ?? { label: 'Accesly' },
    custody: 'smart',
    isAvailable: async () => true,
    connect: async (): Promise<ConnectWalletResponse> => ({ address }),
    disconnect: async () => {},
    getPublicKey: async () => address,
    signTransaction: async (txXdr: string): Promise<SignTransactionResponse> => ({
      signedTxXdr: await signXdr(txXdr),
    }),
    signAuthEntry: async (): Promise<SignAuthEntryResponse> => {
      // Accesly signs the full transaction envelope (signRawXdr); it does not
      // expose standalone Soroban auth-entry signing.
      throw new Error('[accesly-adapter] signAuthEntry is not supported; Accesly signs the full transaction XDR.');
    },
  };
}
