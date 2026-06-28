import { type ReactNode, useEffect, useRef } from 'react';
import { PrivyProvider, useLoginWithEmail, useLoginWithOAuth, usePrivy } from '@privy-io/expo';
import { useCreateWallet, useSignRawHash } from '@privy-io/expo/extended-chains';
import type { User } from '@privy-io/api-types';
import type { InteractiveAuthAdapter } from '@pollar/core';
import type { PollarPrivyConfig } from './config';
import type { PrivyRuntime } from './runtime';
import { getPrivyHandle } from './factory';

export { createPrivyAdapter } from './factory';
export type { PollarPrivyConfig, PollarPrivyAppearance, PrivyLoginMethod } from './config';
export type { AuthOption, InteractiveAuthAdapter, PrivyRuntime } from './runtime';
export { PrivyAdapterUnsupportedError } from './environment';

/** The Stellar `chainType` Privy uses for extended-chain (raw-hash) signing. */
const STELLAR_CHAIN = 'stellar';

/** Find the user's Privy embedded **Stellar** wallet address, if any. */
function findStellarAddress(user: User | null): string | null {
  if (!user) return null;
  for (const account of user.linked_accounts) {
    if (
      account.type === 'wallet' &&
      account.wallet_client_type === 'privy' &&
      // `chain_type` is typed to the public chain union (no `stellar`); the
      // extended-chains wallet carries it at runtime, so compare as a string.
      (account.chain_type as string) === STELLAR_CHAIN
    ) {
      return account.address;
    }
  }
  return null;
}

interface BridgeProps {
  adapter: InteractiveAuthAdapter;
}

/**
 * Inner bridge: runs inside Expo's `<PrivyProvider>`, captures Privy's hooks and
 * attaches them to the adapter as a {@link PrivyRuntime}. Renders nothing.
 */
function PrivyRuntimeBridge({ adapter }: BridgeProps) {
  const handle = getPrivyHandle(adapter);
  const privy = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { login } = useLoginWithOAuth();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();

  // Hooks return fresh closures each render; keep the latest in a ref so the
  // (stable) runtime object below always calls the current ones.
  const api = useRef({ privy, sendCode, loginWithCode, login, createWallet, signRawHash });
  api.current = { privy, sendCode, loginWithCode, login, createWallet, signRawHash };

  useEffect(() => {
    if (!handle) return;
    const runtime: PrivyRuntime = {
      sendEmailCode: async (email) => {
        await api.current.sendCode({ email });
      },
      verifyEmailCode: async (code) => {
        await api.current.loginWithCode({ code });
      },
      loginWithOAuth: async (provider) => {
        // On RN, Expo opens an in-app browser and resolves in-session (no
        // redirect round-trip), so the await completes once the user authenticates.
        await api.current.login({ provider });
      },
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
 * Mounts `@privy-io/expo`'s `PrivyProvider` and the runtime bridge around your
 * app. Place it above `<PollarProvider>`. The `config` defaults to the one passed
 * to {@link createPrivyAdapter}; pass it again only to override.
 *
 * Your Expo app must have `@privy-io/expo`'s peer deps installed (including
 * `react-native-webview`, which hosts Privy's secure signer).
 */
export function PrivyAdapterProvider({ adapter, config, children }: PrivyAdapterProviderProps) {
  const handle = getPrivyHandle(adapter);
  const effective = config ?? handle?.config;
  if (!effective) {
    throw new Error('[privy-adapter] PrivyAdapterProvider needs a config — pass `config` or an adapter from createPrivyAdapter.');
  }
  return (
    <PrivyProvider appId={effective.appId} {...(effective.clientId ? { clientId: effective.clientId } : {})}>
      <PrivyRuntimeBridge adapter={adapter} />
      {children}
    </PrivyProvider>
  );
}
