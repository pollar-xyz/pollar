import type { WalletAdapterMeta, WalletId } from '@pollar/core';
import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/base';
import { StandardConnect } from '@wallet-standard/features';
import { SolanaWalletStandardAdapter } from './SolanaWalletStandardAdapter';

export interface SolanaWalletStandardAdapterOptions {
  /** Subset of wallet names to include. Defaults to every Solana wallet found. */
  wallets?: string[];
  /** Per-wallet button-label overrides, keyed by the wallet's `name`. */
  labels?: Record<string, string>;
  /**
   * Gateway button label these wallets collapse behind in the login UI (applied
   * as each adapter's `meta.group`). Default `'Solana Wallet'` — a distinct group
   * from the Stellar `'Wallet'` gateway, so the two chains render as separate
   * login buttons.
   */
  groupLabel?: string;
}

/** A wallet is usable here if it advertises a Solana chain and standard connect. */
function isSolanaWallet(w: Wallet): boolean {
  return StandardConnect in w.features && w.chains.some((c) => c.startsWith('solana:'));
}

/**
 * Build one {@link SolanaWalletStandardAdapter} per installed Solana wallet discovered
 * through the Wallet Standard registry, to pass to
 * `PollarClientConfig.walletAdapters` (once `@pollar/core` is chain-aware — see the
 * design doc).
 *
 * @example
 * ```ts
 * import { solanaWalletStandardAdapters } from '@pollar/solana-wallet-standard-adapter';
 *
 * const client = new PollarClient({
 *   apiKey: '…',
 *   walletAdapters: [...stellarWalletsKitAdapters({ network }), ...solanaWalletStandardAdapters()],
 * });
 * ```
 */
export function solanaWalletStandardAdapters(options: SolanaWalletStandardAdapterOptions = {}): SolanaWalletStandardAdapter[] {
  // SSR guard: wallet extensions register into a browser-global registry, so
  // there is nothing to find server-side. Return [] and let this re-run on the
  // client (build the PollarClient client-side, e.g. behind a mounted flag or
  // `dynamic(..., { ssr: false })`). Mirrors the Stellar adapter factory.
  if (typeof window === 'undefined') return [];

  const wanted = options.wallets;
  const group = options.groupLabel ?? 'Solana Wallet';

  return getWallets()
    .get()
    .filter(isSolanaWallet)
    .filter((w) => !wanted || wanted.includes(w.name))
    .map((w) => {
      const meta: WalletAdapterMeta = {
        label: options.labels?.[w.name] ?? w.name,
        iconUrl: w.icon,
        group,
      };
      // Namespace the id so a Solana wallet never collides with a Stellar adapter
      // of the same brand name in the shared adapter registry.
      const id: WalletId = `solana:${w.name}`;
      return new SolanaWalletStandardAdapter(w, id, meta);
    });
}
