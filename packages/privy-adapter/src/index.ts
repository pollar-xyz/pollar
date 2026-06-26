import { FeeBumpTransaction, Keypair, type Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import type {
  ConnectWalletResponse,
  SignAuthEntryResponse,
  SignTransactionOptions,
  SignTransactionResponse,
  WalletAdapter,
  WalletAdapterMeta,
} from '@pollar/core';

/**
 * Privy's raw-hash signer for Stellar, obtained on the client from
 * `useSignRawHash()` in `@privy-io/react-auth/extended-chains`. Hex in, hex out.
 */
export type PrivySignRawHash = (input: {
  address: string;
  chainType: 'stellar';
  hash: `0x${string}`;
}) => Promise<{ signature: string }>;

export interface PrivyAdapterOptions {
  /** The user's Privy embedded Stellar wallet G-address. */
  address: string;
  /**
   * Privy's `signRawHash` (from `useSignRawHash()`), pre-bound by the consumer
   * in a React component. `@pollar/core` invokes it with the transaction hash.
   */
  signRawHash: PrivySignRawHash;
  /**
   * Network passphrase used to parse + hash the XDR. Optional: the SDK's login /
   * signing flow passes the app's passphrase per call; this is only the fallback.
   */
  networkPassphrase?: string;
  /** Button label/icon for the login UI. Defaults to `{ label: 'Privy' }`. */
  meta?: WalletAdapterMeta;
}

const PRIVY_ID = 'privy';

/**
 * Build a `@pollar/core` {@link WalletAdapter} backed by a user's Privy embedded
 * Stellar wallet. Privy signs the raw transaction hash (ed25519, `chainType:
 * 'stellar'`); this adapter wraps that signature into a Stellar
 * `DecoratedSignature` and returns the signed envelope.
 *
 * Privy's `signRawHash` comes from a React hook, so the consumer extracts it
 * (and the wallet address) in their component and passes both here:
 *
 * @example
 * ```tsx
 * import { useSignRawHash } from '@privy-io/react-auth/extended-chains';
 * import { createPrivyAdapter } from '@pollar/privy-adapter';
 *
 * function buildPrivyAdapter(address: string) {
 *   const { signRawHash } = useSignRawHash();
 *   return createPrivyAdapter({ address, signRawHash });
 * }
 * // new PollarClient({ apiKey, walletAdapters: [buildPrivyAdapter(stellarAddress)] });
 * ```
 */
export function createPrivyAdapter(options: PrivyAdapterOptions): WalletAdapter {
  const { address, signRawHash } = options;

  const buildDecorated = async (txHash: Buffer): Promise<xdr.DecoratedSignature> => {
    const { signature } = await signRawHash({ address, chainType: 'stellar', hash: `0x${txHash.toString('hex')}` });
    const sigBytes = Buffer.from(signature.replace(/^0x/, ''), 'hex');
    const keypair = Keypair.fromPublicKey(address);
    return new xdr.DecoratedSignature({ hint: keypair.signatureHint(), signature: sigBytes });
  };

  return {
    type: PRIVY_ID,
    meta: options.meta ?? { label: 'Privy' },
    custody: 'external',
    isAvailable: async () => true,
    connect: async (): Promise<ConnectWalletResponse> => ({ address }),
    disconnect: async () => {},
    getPublicKey: async () => address,
    signTransaction: async (txXdr: string, opts?: SignTransactionOptions): Promise<SignTransactionResponse> => {
      const passphrase = opts?.networkPassphrase ?? options.networkPassphrase;
      if (!passphrase) {
        throw new Error('[privy-adapter] networkPassphrase is required to sign (pass it in options or per call).');
      }
      const tx = TransactionBuilder.fromXDR(txXdr, passphrase);
      if (tx instanceof FeeBumpTransaction) {
        throw new Error('[privy-adapter] fee-bump transactions are not supported.');
      }
      const classic = tx as Transaction;
      classic.signatures.push(await buildDecorated(classic.hash()));
      return { signedTxXdr: classic.toEnvelope().toXDR('base64') };
    },
    signAuthEntry: async (): Promise<SignAuthEntryResponse> => {
      // Soroban auth-entry signing is for smart (C-address) wallets; Privy
      // external wallets are classic G-addresses and never invoke this.
      throw new Error('[privy-adapter] signAuthEntry is not supported for Privy external wallets.');
    },
  };
}
