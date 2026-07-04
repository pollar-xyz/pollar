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
import type { InteractiveAuthAdapter } from '@pollar/core';
import type { PollarPrivyConfig } from './config';
import type { PrivyRuntime } from './runtime';
import { getPrivyHandle } from './factory';
import { log } from './log';

export { createPrivyAdapter } from './factory';
export type { PollarPrivyConfig, PollarPrivyAppearance, PrivyLoginMethod } from './config';
export type { AuthOption, InteractiveAuthAdapter, PrivyRuntime } from './runtime';
export { PrivyAdapterUnsupportedError } from './environment';

/** The Stellar `chainType` Privy uses for extended-chain (raw-hash) signing. */
const STELLAR_CHAIN = 'stellar';

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
  const handle = getPrivyHandle(adapter);
  const privy = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const oauthPending = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);
  const { initOAuth } = useLoginWithOAuth({
    onComplete: () => {
      log('web: useLoginWithOAuth onComplete (OAuth finished)');
      oauthPending.current?.resolve();
      oauthPending.current = null;
    },
    onError: (error) => {
      log('web: useLoginWithOAuth onError', error);
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

  // Trace Privy's auth state. If this logs `authenticated: true` but Pollar still
  // shows logged-out, the handoff (login({ provider:'privy' })) never ran — e.g.
  // an OAuth redirect that lost the in-page promise.
  useEffect(() => {
    const address = findStellarAddress(privy.user);
    log('web: privy state', {
      ready: privy.ready,
      authenticated: privy.authenticated,
      userId: privy.user?.id ?? null,
      stellarAddress: address,
    });
    // Notify subscribers (the host auto-login) of the provider's auth state.
    handle?._notifyAuthState({ authenticated: privy.authenticated, address });
  }, [privy.ready, privy.authenticated, privy.user, handle]);

  // Keep the host app's URL clean: once authenticated, strip Privy's OAuth
  // redirect params. react-auth usually does this, but skips it when the user
  // was already logged in — so we always do it ourselves. `replaceState` does
  // not reload or add a history entry.
  useEffect(() => {
    if (!privy.authenticated || typeof window === 'undefined') return;
    if (handle?.config.cleanupOAuthRedirect === false) return;
    const url = new URL(window.location.href);
    const before = url.search;
    for (const param of ['privy_oauth_state', 'privy_oauth_provider', 'privy_oauth_code']) {
      url.searchParams.delete(param);
    }
    if (url.search !== before) {
      log('web: cleaned Privy OAuth params from the URL');
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, [privy.authenticated, handle]);

  useEffect(() => {
    if (!handle) return;
    log('web: bridge mounted — attaching runtime');
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
          log('web: initOAuth invoked (web uses a redirect/popup)', { provider });
          api.current.initOAuth({ provider }).catch((error) => {
            log('web: initOAuth threw', error);
            oauthPending.current = null;
            reject(error);
          });
        }),
      ensureStellarWallet: async () => {
        const existing = findStellarAddress(api.current.privy.user);
        if (existing) {
          log('web: ensureStellarWallet — existing wallet', { address: existing });
          return existing;
        }
        log('web: ensureStellarWallet — none found, creating Stellar wallet');
        const { wallet } = await api.current.createWallet({ chainType: STELLAR_CHAIN });
        log('web: ensureStellarWallet — created', { address: wallet.address });
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
  /**
   * Optional. In the classic "wrapper" usage you place this above
   * `<PollarProvider>` and pass your app as children, so they sit inside
   * `<PrivyProvider>`'s context. In the "sibling" usage you only need Privy +
   * the runtime bridge mounted (the bridge wires the runtime onto the shared
   * adapter by reference), so children can be omitted entirely.
   */
  children?: ReactNode;
}

/**
 * Mounts `@privy-io/react-auth`'s `PrivyProvider` and the runtime bridge around
 * your app. Place it above `<PollarProvider>`. The `config` defaults to the one
 * passed to {@link createPrivyAdapter}; pass it again only to override.
 */
export function PrivyAdapterProvider({ adapter, config, children }: PrivyAdapterProviderProps) {
  const handle = getPrivyHandle(adapter);
  const effective = config ?? handle?.config;
  if (!effective) {
    throw new Error(
      '[privy-adapter] PrivyAdapterProvider needs a config — pass `config` or an adapter from createPrivyAdapter.',
    );
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
