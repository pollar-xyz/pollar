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
import { createLogger, type LogLevel, type PollarLogger, type WalletAdapter } from '@pollar/core';
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
  /**
   * Label of the gateway button these kit wallets collapse behind in the login
   * UI (the `meta.group` applied to every adapter this factory builds). Default
   * `'Wallet'` — the same group as the built-in Freighter/Albedo, so they share
   * one gateway. Set a distinct value (e.g. `'More wallets'`) to render the kit
   * wallets as a *separate* gateway button from the built-in ones.
   */
  groupLabel?: string;
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
  /**
   * Minimum log severity. `silent` disables logging; otherwise `error` < `warn`
   * < `info` < `debug`. Defaults to `'info'`. Since the kit is a global
   * singleton, this is set once at init.
   */
  logLevel?: LogLevel;
  /** Sink for logs. Defaults to the global `console`. */
  logger?: PollarLogger;
}

let initialised = false;
let initNetwork: Networks | null = null;
let _log: PollarLogger = console;

/** The kit's configured logger (set at init). Used by the adapter + picker. */
export function getKitLogger(): PollarLogger {
  return _log;
}

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
 * `stellarWalletsKitAdapters({ network })` has already initialised the kit elsewhere;
 * in that case the call no-ops and the missing `network` is fine. On the
 * first-time init path `network` is required and we throw if it's absent.
 */
export function ensureInit(options: Partial<StellarWalletsKitAdapterOptions>): void {
  if (options.logLevel !== undefined || options.logger !== undefined) {
    _log = createLogger(options.logLevel ?? 'info', options.logger);
  }
  if (initialised) {
    // The kit is a global singleton — a second call with a different network
    // would be silently ignored. Warn so the developer notices the
    // misconfiguration instead of debugging wrong-chain signatures later.
    if (options.network && options.network !== initNetwork) {
      _log.warn(
        `[StellarWalletsKit] Already initialised with network "${initNetwork}". Ignoring attempted reconfiguration to "${options.network}". The kit is a global singleton — reload the page to change networks.`,
      );
    }
    return;
  }
  if (!options.network) {
    throw new Error(
      '[StellarWalletsKit] `network` is required — pass `Networks.TESTNET` or `Networks.PUBLIC` to `stellarWalletsKitAdapters({ network })`. The kit is a global singleton, so the network has to be chosen explicitly at init.',
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
    throw new Error('[StellarWalletsKit] not initialised — call `stellarWalletsKitAdapters({ network })` first');
  }
  return initNetwork;
}

/**
 * Build the list of {@link WalletAdapter}s backed by Stellar Wallets Kit — one
 * per kit module — to pass to `PollarClientConfig.walletAdapters`. Each adapter
 * carries the module's name/icon as its button `meta`. `picker.wallets` (subset)
 * and `picker.labels` (overrides) are honored if provided.
 *
 * @example
 * ```ts
 * import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';
 * import { Networks } from '@creit.tech/stellar-wallets-kit';
 *
 * const client = new PollarClient({
 *   apiKey: '…',
 *   walletAdapters: stellarWalletsKitAdapters({ network: Networks.PUBLIC }),
 * });
 * ```
 */
export function stellarWalletsKitAdapters(options: StellarWalletsKitAdapterOptions): WalletAdapter[] {
  // SSR / non-browser guard. Stellar Wallets Kit talks to browser wallet
  // extensions and touches `window` both at `StellarWalletsKit.init()` and in its
  // wallet modules' constructors — there are no wallets server-side, so return an
  // empty list instead of crashing during Next.js/Remix SSR. The real adapters
  // are built when this re-runs on the client (so build your PollarClient and
  // render the wallet UI on the client, e.g. behind a mounted flag or
  // `dynamic(..., { ssr: false })`).
  if (typeof window === 'undefined') return [];
  ensureInit(options);
  const modules = options.modules ?? buildDefaultModules();
  const wanted = options.picker?.wallets;
  return modules
    .filter((m) => !wanted || wanted.includes(m.productId))
    .map(
      (m) =>
        new StellarWalletsKitAdapter(m.productId, {
          label: options.picker?.labels?.[m.productId] ?? m.productName,
          iconUrl: m.productIcon,
          group: options.picker?.groupLabel ?? 'Wallet',
        }),
    );
}
