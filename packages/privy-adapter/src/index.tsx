import { type ReactNode, useEffect, useRef } from 'react';
import {
  PrivyProvider,
  type PrivyClientConfig,
  type User,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
} from '@privy-io/react-auth';
import { useCreateWallet, useSignRawHash } from '@privy-io/react-auth/extended-chains';
import type { PollarPrivyConfig } from './config';
import { buildPrivyAdapter, type InteractiveAuthAdapter, type PrivyAdapterHandle, type PrivyRuntime } from './runtime';

export type { PollarPrivyConfig, PollarPrivyAppearance, PrivyLoginMethod } from './config';
export type { AuthOption, InteractiveAuthAdapter, PrivyRuntime } from './runtime';
export { PrivyAdapterUnsupportedError } from './environment';

/** The Stellar `chainType` Privy uses for extended-chain (raw-hash) signing. */
const STELLAR_CHAIN = 'stellar';

/**
 * Create a Privy-backed wallet adapter for `@pollar/core`. The returned object
 * is a `WalletAdapter` that also drives its own login (email / OAuth), rendered
 * by the Pollar login modal as a sub-modal.
 *
 * The adapter is inert until {@link PrivyAdapterProvider} mounts around your app
 * — that bridge wires Privy's React hooks into the adapter. In a non-React host
 * (Angular/Vue) no bridge can mount, so the adapter throws a clear
 * `PrivyAdapterUnsupportedError` on first use.
 *
 * @example
 * ```tsx
 * const privy = createPrivyAdapter({ appId, loginMethods: ['email', 'google'] });
 * // <PrivyAdapterProvider adapter={privy}>
 * //   <PollarProvider config={{ apiKey, walletAdapters: [privy] }}>…</PollarProvider>
 * // </PrivyAdapterProvider>
 * ```
 */
export function createPrivyAdapter(config: PollarPrivyConfig): InteractiveAuthAdapter {
  // The full handle (with `_attachRuntime`) is what PrivyAdapterProvider needs;
  // we stash it so the provider can find it from the public adapter reference.
  const handle = buildPrivyAdapter(config);
  handlesByAdapter.set(handle, handle);
  return handle;
}

/** Maps the public adapter back to its internal handle for the bridge. */
const handlesByAdapter = new WeakMap<InteractiveAuthAdapter, PrivyAdapterHandle>();

/** Find the user's Privy embedded **Stellar** wallet address, if any. */
function findStellarAddress(user: User | null): string | null {
  if (!user) return null;
  for (const account of user.linkedAccounts) {
    if (
      account.type === 'wallet' &&
      account.walletClientType === 'privy' &&
      // `chainType` is typed to the public chain union (no `stellar`); the
      // extended-chains wallet carries it at runtime, so compare as a string.
      (account.chainType as string) === STELLAR_CHAIN
    ) {
      return account.address;
    }
  }
  return null;
}

/** Map the slim Pollar config onto Privy's `PrivyClientConfig`. */
function toPrivyClientConfig(config: PollarPrivyConfig): PrivyClientConfig {
  const cfg: PrivyClientConfig = {
    loginMethods: config.loginMethods as NonNullable<PrivyClientConfig['loginMethods']>,
    // We create the Stellar wallet explicitly via `useCreateWallet`, so disable
    // Privy's automatic EVM/Solana wallet provisioning on login.
    embeddedWallets: {
      ethereum: { createOnLogin: 'off' },
      solana: { createOnLogin: 'off' },
    },
  };
  // Build appearance only from defined fields — `exactOptionalPropertyTypes`
  // forbids assigning `undefined` to optional props.
  const a = config.appearance;
  if (a) {
    const appearance: NonNullable<PrivyClientConfig['appearance']> = {};
    if (a.theme) appearance.theme = a.theme;
    if (a.accentColor) appearance.accentColor = a.accentColor as `#${string}`;
    if (a.logo) appearance.logo = a.logo;
    cfg.appearance = appearance;
  }
  return cfg;
}

interface BridgeProps {
  adapter: InteractiveAuthAdapter;
}

/**
 * Inner bridge: runs inside `<PrivyProvider>`, captures Privy's hooks and
 * attaches them to the adapter as a {@link PrivyRuntime}. Renders nothing.
 */
function PrivyRuntimeBridge({ adapter }: BridgeProps) {
  const handle = handlesByAdapter.get(adapter);
  const privy = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const oauthPending = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);
  const { initOAuth } = useLoginWithOAuth({
    onComplete: () => {
      oauthPending.current?.resolve();
      oauthPending.current = null;
    },
    onError: (error) => {
      oauthPending.current?.reject(error);
      oauthPending.current = null;
    },
  });
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();

  // Hooks return fresh closures each render; keep the latest in a ref so the
  // (stable) runtime object below always calls the current ones.
  const api = useRef({ privy, sendCode, loginWithCode, initOAuth, createWallet, signRawHash });
  api.current = { privy, sendCode, loginWithCode, initOAuth, createWallet, signRawHash };

  useEffect(() => {
    if (!handle) return;
    const runtime: PrivyRuntime = {
      sendEmailCode: (email) => api.current.sendCode({ email }),
      verifyEmailCode: async (code) => {
        await api.current.loginWithCode({ code });
      },
      loginWithOAuth: (provider) =>
        new Promise<void>((resolve, reject) => {
          oauthPending.current = { resolve, reject };
          // On web, `initOAuth` redirects (or opens a popup); completion arrives
          // via the onComplete callback above — after the redirect round-trip,
          // which the Pollar sub-modal resumes once Privy reports authenticated.
          api.current.initOAuth({ provider }).catch((error) => {
            oauthPending.current = null;
            reject(error);
          });
        }),
      ensureStellarWallet: async () => {
        const existing = findStellarAddress(api.current.privy.user);
        if (existing) return existing;
        const { wallet } = await api.current.createWallet({ chainType: STELLAR_CHAIN });
        return wallet.address;
      },
      signRawHash: async (address, hashHex) => {
        const { signature } = await api.current.signRawHash({
          address,
          chainType: STELLAR_CHAIN,
          hash: `0x${hashHex}`,
        });
        return signature;
      },
      getAddress: () => findStellarAddress(api.current.privy.user),
      logout: () => api.current.privy.logout(),
    };
    handle._attachRuntime(runtime);
    return () => handle._detachRuntime();
  }, [handle]);

  return null;
}

interface PrivyAdapterProviderProps {
  /** The adapter returned by {@link createPrivyAdapter}. */
  adapter: InteractiveAuthAdapter;
  config?: PollarPrivyConfig;
  children: ReactNode;
}

/**
 * Mounts `@privy-io/react-auth`'s `PrivyProvider` and the runtime bridge around
 * your app. Place it above `<PollarProvider>`. The `config` defaults to the one
 * passed to {@link createPrivyAdapter}; pass it again only to override.
 */
export function PrivyAdapterProvider({ adapter, config, children }: PrivyAdapterProviderProps) {
  const handle = handlesByAdapter.get(adapter);
  const effective = config ?? handle?.config;
  if (!effective) {
    throw new Error('[privy-adapter] PrivyAdapterProvider needs a config — pass `config` or an adapter from createPrivyAdapter.');
  }
  return (
    <PrivyProvider
      appId={effective.appId}
      {...(effective.clientId ? { clientId: effective.clientId } : {})}
      config={toPrivyClientConfig(effective)}
    >
      <PrivyRuntimeBridge adapter={adapter} />
      {children}
    </PrivyProvider>
  );
}
