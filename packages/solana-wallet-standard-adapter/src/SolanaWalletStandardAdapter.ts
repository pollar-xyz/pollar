import type {
  ConnectWalletResponse,
  SolanaSignInInput,
  SolanaSignInOutput,
  SolanaSignMessageResponse,
  WalletAdapter,
  WalletAdapterMeta,
  WalletChain,
  WalletId,
} from '@pollar/core';
import {
  SolanaSignIn,
  SolanaSignMessage,
  SolanaSignTransaction,
  type SolanaSignInFeature,
  type SolanaSignMessageFeature,
  type SolanaSignTransactionFeature,
} from '@solana/wallet-standard-features';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import {
  StandardConnect,
  StandardDisconnect,
  type StandardConnectFeature,
  type StandardDisconnectFeature,
} from '@wallet-standard/features';

/** A Solana chain identifier as used by the Wallet Standard (e.g. `solana:mainnet`). */
type SolanaChainId = `solana:${string}`;

function isSolanaChain(chain: string): boolean {
  return chain.startsWith('solana:');
}

/**
 * Wraps a Wallet Standard Solana wallet (Phantom, Solflare, Backpack, …) so it can
 * back a Pollar external-wallet login. The Wallet Standard is the headless
 * substrate `@solana/wallet-adapter` is built on, so this stays framework-agnostic
 * exactly like `@pollar/stellar-wallets-kit-adapter`.
 *
 * The signing surface is Solana-native, NOT the Stellar `WalletAdapter` shape:
 * login is SIWS (`signIn`, a signed MESSAGE) rather than SEP-10 (a signed
 * transaction), and transactions are serialized Solana messages, not XDR. Once
 * `@pollar/core` grows a chain-aware adapter contract (see the design doc) this
 * slots into `PollarClientConfig.walletAdapters`.
 */
export class SolanaWalletStandardAdapter implements WalletAdapter {
  readonly type: WalletId;
  readonly meta: WalletAdapterMeta;
  readonly custody = 'external' as const;
  readonly chain: WalletChain = 'SOLANA';

  private readonly _wallet: Wallet;
  private _account: WalletAccount | null = null;

  constructor(wallet: Wallet, walletId: WalletId, meta: WalletAdapterMeta) {
    this._wallet = wallet;
    this.type = walletId;
    this.meta = meta;
  }

  async isAvailable(): Promise<boolean> {
    // Registered in the Wallet Standard registry with a Solana chain and the
    // standard connect feature. Discovery already filtered to Solana wallets, so
    // this is a cheap re-check rather than a probe.
    return StandardConnect in this._wallet.features && this._wallet.chains.some(isSolanaChain);
  }

  async connect(): Promise<ConnectWalletResponse> {
    const feature = this._wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect] | undefined;
    if (!feature) throw new Error(`[SolanaWalletStandardAdapter] "${this.type}" does not support standard:connect`);
    const { accounts } = await feature.connect();
    const account = accounts.find((a) => a.chains.some(isSolanaChain)) ?? accounts[0];
    if (!account) throw new Error(`[SolanaWalletStandardAdapter] "${this.type}" returned no account on connect`);
    this._account = account;
    return { address: account.address };
  }

  async disconnect(): Promise<void> {
    try {
      const feature = this._wallet.features[StandardDisconnect] as
        | StandardDisconnectFeature[typeof StandardDisconnect]
        | undefined;
      await feature?.disconnect();
    } finally {
      this._account = null;
    }
  }

  async getPublicKey(): Promise<string | null> {
    if (this._account) return this._account.address;
    // A wallet reconnected across a reload exposes its accounts without a fresh
    // connect(); adopt the first Solana one so getPublicKey works after resume.
    this._account = this._wallet.accounts.find((a) => a.chains.some(isSolanaChain)) ?? null;
    return this._account?.address ?? null;
  }

  /** Does this wallet expose native SIWS (`solana:signIn`)? If not, use `signMessage`. */
  get supportsSignIn(): boolean {
    return SolanaSignIn in this._wallet.features;
  }

  /**
   * SIWS: sign the server-issued Sign In With Solana input. This is the Solana
   * analogue of the Stellar SEP-10 challenge, but the wallet signs a structured
   * MESSAGE (domain, statement, nonce, …) rather than a transaction.
   */
  async signIn(input: SolanaSignInInput): Promise<SolanaSignInOutput> {
    const feature = this._wallet.features[SolanaSignIn] as SolanaSignInFeature[typeof SolanaSignIn] | undefined;
    if (!feature) throw new Error(`[SolanaWalletStandardAdapter] "${this.type}" does not support solana:signIn (SIWS)`);
    const [output] = await feature.signIn(input);
    if (!output) throw new Error(`[SolanaWalletStandardAdapter] "${this.type}" returned no SIWS output`);
    this._account = output.account;
    // The Wallet Standard hands back readonly byte views; copy into real
    // Uint8Arrays so `@pollar/core` (which base64-encodes them for the server)
    // gets mutable, standard arrays.
    return {
      account: { address: output.account.address, publicKey: Uint8Array.from(output.account.publicKey) },
      signedMessage: Uint8Array.from(output.signedMessage),
      signature: Uint8Array.from(output.signature),
      ...(output.signatureType ? { signatureType: output.signatureType } : {}),
    };
  }

  /** Raw message signing — the SIWS fallback for wallets without `solana:signIn`. */
  async signMessage(message: Uint8Array): Promise<SolanaSignMessageResponse> {
    const account = this._requireAccount();
    const feature = this._wallet.features[SolanaSignMessage] as SolanaSignMessageFeature[typeof SolanaSignMessage] | undefined;
    if (!feature) throw new Error(`[SolanaWalletStandardAdapter] "${this.type}" does not support solana:signMessage`);
    const [output] = await feature.signMessage({ account, message });
    if (!output) throw new Error(`[SolanaWalletStandardAdapter] "${this.type}" returned no signature`);
    return { signature: Uint8Array.from(output.signature), signedMessage: Uint8Array.from(output.signedMessage) };
  }

  /**
   * Sign a serialized Solana transaction. Used by phase 2 (sponsored external
   * transfers), where Pollar builds a durable-nonce transfer whose fee payer is
   * the app GAS wallet and the user signs their part here.
   */
  async signSolanaTransaction(transaction: Uint8Array, chain?: string): Promise<Uint8Array> {
    const account = this._requireAccount();
    const feature = this._wallet.features[SolanaSignTransaction] as
      | SolanaSignTransactionFeature[typeof SolanaSignTransaction]
      | undefined;
    if (!feature) throw new Error(`[SolanaWalletStandardAdapter] "${this.type}" does not support solana:signTransaction`);
    const solanaChain = chain && chain.startsWith('solana:') ? (chain as SolanaChainId) : undefined;
    const [output] = await feature.signTransaction({ account, transaction, ...(solanaChain ? { chain: solanaChain } : {}) });
    if (!output) throw new Error(`[SolanaWalletStandardAdapter] "${this.type}" returned no signed transaction`);
    return Uint8Array.from(output.signedTransaction);
  }

  private _requireAccount(): WalletAccount {
    if (!this._account) {
      throw new Error(`[SolanaWalletStandardAdapter] "${this.type}" is not connected — call connect() first`);
    }
    return this._account;
  }
}
