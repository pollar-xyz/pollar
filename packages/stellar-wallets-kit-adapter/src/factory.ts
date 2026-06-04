import { type ModuleInterface, Networks, StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { BitgetModule } from '@creit.tech/stellar-wallets-kit/modules/bitget';
import { CactusLinkModule } from '@creit.tech/stellar-wallets-kit/modules/cactuslink';
import { FordefiModule } from '@creit.tech/stellar-wallets-kit/modules/fordefi';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { HanaModule } from '@creit.tech/stellar-wallets-kit/modules/hana';
import { HotWalletModule } from '@creit.tech/stellar-wallets-kit/modules/hotwallet';
import { KleverModule } from '@creit.tech/stellar-wallets-kit/modules/klever';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { OneKeyModule } from '@creit.tech/stellar-wallets-kit/modules/onekey';
import { RabetModule } from '@creit.tech/stellar-wallets-kit/modules/rabet';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import type { WalletAdapterResolver, WalletId } from '@pollar/core';
import { StellarWalletsKitAdapter } from './StellarWalletsKitAdapter';

/**
 * Options that shape `<KitWalletPicker>` (from the `/picker` subpath). Kept on
 * `StellarWalletsKitAdapterOptions` so `createStellarWalletsKitBundle()` can
 * receive everything (network + modules + UI) in one call.
 */
export interface KitPickerOptions {
  /** Subset of wallet ids to show. Defaults to every wallet the kit reports. */
  wallets?: string[];
  /** Render order. Default `'as-given'` (the kit's own order). */
  order?: 'as-given' | 'installed-first' | 'alphabetical';
  /** Hide wallets whose `isAvailable` is false. Default `false`. */
  showInstalledOnly?: boolean;
  /** Per-wallet label overrides. Key = wallet id. */
  labels?: Record<string, string>;
  /** Visual layout. Default `'grid'`. */
  layout?: 'grid' | 'list';
  /** Theme passthrough — applied as CSS custom properties on the picker root. */
  theme?: { accent?: string; mode?: 'light' | 'dark' };
}

export interface StellarWalletsKitAdapterOptions {
  /**
   * Stellar network the kit will use for signing. Required — there is no
   * default. The kit is a global singleton, so picking the network silently
   * for a consumer would risk signing real-looking transactions on the wrong
   * chain (testnet xdr signed on mainnet, etc.). Pass `Networks.TESTNET` or
   * `Networks.PUBLIC` explicitly.
   */
  network: Networks;
  /**
   * Wallet modules the kit should drive. Defaults to every module that works
   * out of the box (Albedo, Bitget, CactusLink, Fordefi, Freighter, Hana,
   * HotWallet, Klever, Lobstr, OneKey, Rabet, xBull). Pass an explicit list
   * to add Ledger / Trezor / WalletConnect — those need extra setup (a
   * Buffer polyfill for Ledger; constructor params for the other two) so we
   * don't auto-include them.
   *
   * Import modules from their kit subpaths so the bundle stays lean:
   * ```ts
   * import { WalletConnectModule } from '@creit.tech/stellar-wallets-kit/modules/wallet-connect';
   * ```
   */
  modules?: ModuleInterface[];
  /**
   * Picker-specific options. Only consumed by `<KitWalletPicker>` /
   * `createStellarWalletsKitBundle` (the `/picker` subpath). The resolver
   * itself ignores them.
   */
  picker?: KitPickerOptions;
}

let initialised = false;
let initNetwork: Networks | null = null;

/** @internal — used by the `/picker` subpath. */
export function buildDefaultModules(): ModuleInterface[] {
  return [
    new AlbedoModule(),
    new BitgetModule(),
    new CactusLinkModule(),
    new FordefiModule(),
    new FreighterModule(),
    new HanaModule(),
    new HotWalletModule(),
    new KleverModule(),
    new LobstrModule(),
    new OneKeyModule(),
    new RabetModule(),
    new xBullModule(),
  ];
}

/**
 * @internal — used by the `/picker` subpath.
 *
 * Accepts `Partial<...>` because the picker may be mounted in a flow where
 * `stellarWalletsKit({ network })` has already initialised the kit elsewhere;
 * in that case the call no-ops and the missing `network` is fine. On the
 * first-time init path `network` is required and we throw if it's absent.
 */
export function ensureInit(options: Partial<StellarWalletsKitAdapterOptions>): void {
  if (initialised) {
    // The kit is a global singleton — a second call with a different network
    // would be silently ignored. Warn so the developer notices the
    // misconfiguration instead of debugging wrong-chain signatures later.
    if (options.network && options.network !== initNetwork) {
      console.warn(
        `[StellarWalletsKit] Already initialised with network "${initNetwork}". Ignoring attempted reconfiguration to "${options.network}". The kit is a global singleton — reload the page to change networks.`,
      );
    }
    return;
  }
  if (!options.network) {
    throw new Error(
      '[StellarWalletsKit] `network` is required — pass `Networks.TESTNET` or `Networks.PUBLIC` to `stellarWalletsKit({ network })`. The kit is a global singleton, so the network has to be chosen explicitly at init.',
    );
  }
  StellarWalletsKit.init({
    network: options.network,
    modules: options.modules ?? buildDefaultModules(),
  });
  initNetwork = options.network;
  initialised = true;
}

/** @internal — used by `StellarWalletsKitAdapter` to reject per-call network overrides that don't match init. */
export function getInitNetwork(): Networks {
  if (initNetwork === null) {
    throw new Error('[StellarWalletsKit] not initialised — call `stellarWalletsKit({ network })` first');
  }
  return initNetwork;
}

/**
 * Build a {@link WalletAdapterResolver} backed by Stellar Wallets Kit. Pass
 * the result to `PollarClientConfig.walletAdapter` so Pollar can use any of
 * the kit's modules without `@pollar/core` having to depend on the kit.
 *
 * @example
 * ```ts
 * import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';
 * import { Networks } from '@creit.tech/stellar-wallets-kit';
 *
 * const client = new PollarClient({
 *   apiKey: '…',
 *   walletAdapter: stellarWalletsKit({ network: Networks.PUBLIC }),
 * });
 * ```
 */
export function stellarWalletsKit(options: StellarWalletsKitAdapterOptions): WalletAdapterResolver {
  return (id: WalletId) => {
    ensureInit(options);
    return new StellarWalletsKitAdapter(id);
  };
}
