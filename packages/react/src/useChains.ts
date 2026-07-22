'use client';

// ─── Chain order, one source of truth ─────────────────────────────────────────
// Every component that shows "the user's address" or offers a network picker
// reads it from here, so the wallet button and the modals can never disagree
// about which chain is first.
//
// The order and the membership both come from `/applications/config`
// (`appConfig.application.chains`), which is the app's own list as arranged in
// the dashboard. Two reasons it is the authority and `getWallets()` is not:
//
//   - `wallets[]` is written into the session at LOGIN and then persisted. A
//     chain switched off today would keep showing for anyone with a live
//     session. `/config` is refetched on every page load, so it corrects itself.
//   - Before this, the backend listed `wallets[]` `ORDER BY network` (the Prisma
//     enum order), identical for every app on the platform. That is fixed
//     server-side now, but a session persisted before the fix still carries the
//     old array, and re-deriving here repairs it without forcing a re-login.
// ─────────────────────────────────────────────────────────────────────────────

import type { WalletChain } from '@pollar/core';
import { useMemo } from 'react';
import { addressForChain, chainsOf } from './components/ChainSelect';
import { usePollar } from './context';

export interface UseChainsResult {
  /**
   * Chains to offer, in the app's configured order: those the app serves AND the
   * user already holds a wallet on. `[]` until `/config` resolves, so a network
   * picker driven by this renders nothing rather than a list it may have to
   * reorder a moment later.
   */
  chains: WalletChain[];
  /** The app's first configured chain that the user holds. `null` until ready. */
  primaryChain: WalletChain | null;
  /**
   * The address on {@link primaryChain}. While `/config` is still in flight this
   * falls back to the first wallet the session lists, so a logged-in user never
   * sees the wallet button blank out into a "Connect" state on every reload.
   */
  primaryAddress: string;
  /** `false` while `/config` is in flight or failed. Gate any chain UI on it. */
  ready: boolean;
}

export function useChains(): UseChainsResult {
  const { wallets, appConfig, configStatus } = usePollar();
  const configured = appConfig?.application?.chains as WalletChain[] | undefined;
  const ready = configStatus === 'ready';

  return useMemo(() => {
    if (!ready) {
      // No configured order yet, so no opinion about which chain leads. The
      // picker stays empty; the button borrows the session's first address
      // purely so it has something to render.
      const fallback = chainsOf(wallets);
      return {
        chains: [],
        primaryChain: null,
        primaryAddress: addressForChain(wallets, fallback[0] ?? null),
        ready: false,
      };
    }
    const chains = chainsOf(wallets, configured);
    const primaryChain = chains[0] ?? null;
    return { chains, primaryChain, primaryAddress: addressForChain(wallets, primaryChain), ready: true };
  }, [wallets, configured, ready]);
}
