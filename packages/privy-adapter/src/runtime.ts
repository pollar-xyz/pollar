import { FeeBumpTransaction, Keypair, type Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import type {
  AuthOption,
  ConnectWalletResponse,
  InteractiveAuthAdapter,
  ProviderAuthState,
  SignAuthEntryResponse,
  SignTransactionOptions,
  SignTransactionResponse,
} from '@pollar/core';
import type { PollarPrivyConfig, PrivyLoginMethod } from './config';

export type { AuthOption, InteractiveAuthAdapter } from '@pollar/core';
import { PrivyAdapterUnsupportedError, RUNTIME_ATTACH_TIMEOUT_MS, UNSUPPORTED_MESSAGE } from './environment.ts';
import { log, setPrivyAdapterDebug } from './log.ts';

export const PRIVY_ID = 'privy';

/**
 * Platform-agnostic contract a Privy "bridge" fulfils — `@privy-io/react-auth`
 * on web, `@privy-io/expo` on React Native. Both SDKs are hook-based and must
 * run inside a React tree, so the bridge captures those hooks and exposes them
 * imperatively here, letting the {@link WalletAdapter} drive login + signing
 * without knowing which Privy SDK is underneath.
 *
 * All methods assume the bridge is mounted; the adapter never calls them until a
 * runtime is attached.
 */
export interface PrivyRuntime {
  /** Send an email OTP to start email login. */
  sendEmailCode(email: string): Promise<void>;
  /** Submit the email OTP; resolves once Privy reports the user authenticated. */
  verifyEmailCode(code: string): Promise<void>;
  /**
   * Begin an OAuth login (google/github). Resolves once Privy reports the user
   * authenticated (after the popup/redirect round-trip the bridge manages).
   */
  loginWithOAuth(provider: 'google' | 'github'): Promise<void>;
  /**
   * Ensure the authenticated user has a Stellar embedded wallet, creating one if
   * absent. Returns its `G...` address.
   */
  ensureStellarWallet(): Promise<string>;
  /**
   * Raw-hash sign (ed25519) over the 32-byte transaction hash. Hex in, hex out
   * — mirrors Privy's `signRawHash` for `chainType: 'stellar'`.
   */
  signRawHash(address: string, hashHex: string): Promise<string>;
  /** The authenticated Stellar address, or null if not logged in / no wallet. */
  getAddress(): string | null;
  /** Log out of the Privy session. */
  logout(): Promise<void>;
}

/**
 * The adapter instance returned by {@link createPrivyAdapter}, plus the internal
 * hooks a platform bridge uses to attach/detach its captured Privy runtime.
 */
export interface PrivyAdapterHandle extends InteractiveAuthAdapter {
  /** The config the adapter was created with (so the provider can default it). */
  readonly config: PollarPrivyConfig;
  /** @internal Called by the platform bridge once Privy's hooks are captured. */
  _attachRuntime(runtime: PrivyRuntime): void;
  /** @internal Called by the platform bridge on unmount. */
  _detachRuntime(): void;
  /** @internal Called by the platform bridge when Privy's auth state changes. */
  _notifyAuthState(state: ProviderAuthState): void;
}

const LOGIN_METHOD_TO_OPTION: Record<PrivyLoginMethod, AuthOption> = {
  email: 'email',
  google: 'google',
  github: 'github',
};

/**
 * Build the platform-agnostic Privy {@link WalletAdapter}. The returned handle
 * is inert until a platform bridge calls `_attachRuntime`; any method invoked
 * before that waits briefly and then throws {@link PrivyAdapterUnsupportedError}
 * — the signal that there is no React/Expo host (e.g. Angular/Vue) or the bridge
 * was never mounted.
 */
export function buildPrivyAdapter(config: PollarPrivyConfig): PrivyAdapterHandle {
  setPrivyAdapterDebug(config.debug ?? false);
  log('adapter created', { type: PRIVY_ID, loginMethods: config.loginMethods });

  let runtime: PrivyRuntime | null = null;
  let resolveRuntime!: (rt: PrivyRuntime) => void;
  let runtimeReady = new Promise<PrivyRuntime>((resolve) => {
    resolveRuntime = resolve;
  });

  // Provider auth-state subscribers (the host's auto-login listens here).
  const authListeners = new Set<(state: ProviderAuthState) => void>();
  let lastAuthState: ProviderAuthState = { authenticated: false, address: null };

  /** Wait for a bridge to attach, or fail clearly if none ever does. */
  const requireRuntime = (): Promise<PrivyRuntime> => {
    if (runtime) return Promise.resolve(runtime);
    log('requireRuntime: no bridge attached yet — waiting (mount <PrivyAdapterProvider>?)');
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        log('requireRuntime: timed out — no runtime attached (unsupported host?)');
        reject(new PrivyAdapterUnsupportedError(UNSUPPORTED_MESSAGE));
      }, RUNTIME_ATTACH_TIMEOUT_MS);
    });
    const ready = runtimeReady.then((rt) => {
      clearTimeout(timer);
      log('requireRuntime: bridge attached, proceeding');
      return rt;
    });
    return Promise.race([ready, timeout]);
  };

  const buildDecorated = async (address: string, txHash: Buffer): Promise<xdr.DecoratedSignature> => {
    const rt = await requireRuntime();
    const signature = await rt.signRawHash(address, txHash.toString('hex'));
    const sigBytes = Buffer.from(signature.replace(/^0x/, ''), 'hex');
    const keypair = Keypair.fromPublicKey(address);
    return new xdr.DecoratedSignature({ hint: keypair.signatureHint(), signature: sigBytes });
  };

  const authOptions = config.loginMethods.map((m) => LOGIN_METHOD_TO_OPTION[m]);

  const handle: PrivyAdapterHandle = {
    type: PRIVY_ID,
    meta: config.meta ?? { label: 'Privy' },
    custody: 'external',
    config,
    isAvailable: async () => true,

    getAuthOptions: () => [...authOptions],

    sendEmailCode: async (email) => {
      log('sendEmailCode()', { email });
      const rt = await requireRuntime();
      await rt.sendEmailCode(email);
      log('sendEmailCode(): code sent');
    },
    verifyEmailCode: async (code) => {
      log('verifyEmailCode()');
      const rt = await requireRuntime();
      await rt.verifyEmailCode(code);
      log('verifyEmailCode(): Privy authenticated');
    },
    loginWithOAuth: async (provider) => {
      log('loginWithOAuth()', { provider });
      const rt = await requireRuntime();
      await rt.loginWithOAuth(provider);
      log('loginWithOAuth(): resolved (Privy authenticated)');
    },

    connect: async (): Promise<ConnectWalletResponse> => {
      log('connect(): called by core (login flow) — ensuring Stellar wallet');
      const rt = await requireRuntime();
      // The interactive login (email/oauth) has already run via the sub-modal by
      // the time core calls connect(); here we just make sure the Stellar wallet
      // exists and return its address for the SEP-10 flow.
      const address = await rt.ensureStellarWallet();
      log('connect(): resolved address for SEP-10', { address });
      return { address };
    },
    disconnect: async () => {
      log('disconnect(): logging out of Privy');
      if (runtime) await runtime.logout();
    },
    getPublicKey: async () => {
      const address = runtime ? runtime.getAddress() : null;
      log('getPublicKey()', { address });
      return address;
    },

    signTransaction: async (txXdr: string, opts?: SignTransactionOptions): Promise<SignTransactionResponse> => {
      const passphrase = opts?.networkPassphrase;
      if (!passphrase) {
        throw new Error('[privy-adapter] networkPassphrase is required to sign (passed per call by the SDK).');
      }
      const rt = await requireRuntime();
      const address = rt.getAddress();
      log('signTransaction(): start', { address });
      if (!address) {
        throw new Error('[privy-adapter] cannot sign: no authenticated Privy Stellar wallet.');
      }
      const tx = TransactionBuilder.fromXDR(txXdr, passphrase);
      if (tx instanceof FeeBumpTransaction) {
        throw new Error('[privy-adapter] fee-bump transactions are not supported.');
      }
      const classic = tx as Transaction;
      classic.signatures.push(await buildDecorated(address, classic.hash()));
      log('signTransaction(): signed');
      return { signedTxXdr: classic.toEnvelope().toXDR('base64') };
    },
    signAuthEntry: async (): Promise<SignAuthEntryResponse> => {
      // Soroban auth-entry signing is for smart (C-address) wallets; Privy
      // external wallets are classic G-addresses and never invoke this.
      throw new Error('[privy-adapter] signAuthEntry is not supported for Privy external wallets.');
    },

    onProviderAuthChange: (callback) => {
      authListeners.add(callback);
      // Replay the latest known state so a late subscriber isn't stuck waiting.
      callback(lastAuthState);
      return () => authListeners.delete(callback);
    },

    _attachRuntime: (rt: PrivyRuntime) => {
      log('runtime attached by platform bridge');
      runtime = rt;
      resolveRuntime(rt);
    },
    _notifyAuthState: (state: ProviderAuthState) => {
      if (state.authenticated === lastAuthState.authenticated && state.address === lastAuthState.address) {
        return;
      }
      lastAuthState = state;
      log('provider auth state changed', state);
      for (const listener of authListeners) listener(state);
    },
    _detachRuntime: () => {
      log('runtime detached (bridge unmounted)');
      runtime = null;
      // Re-arm the gate so a remount can attach a fresh runtime.
      runtimeReady = new Promise<PrivyRuntime>((resolve) => {
        resolveRuntime = resolve;
      });
    },
  };

  return handle;
}
