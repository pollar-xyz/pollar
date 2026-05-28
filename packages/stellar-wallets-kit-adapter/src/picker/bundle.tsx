'use client';

import type { WalletAdapterResolver } from '@pollar/core';
import type { RenderWalletsSlot } from '@pollar/react';
import { stellarWalletsKit, type StellarWalletsKitAdapterOptions } from '../factory';
import { KitWalletPicker } from './KitWalletPicker';

export interface StellarWalletsKitBundle {
  /** Pass to `PollarClientConfig.walletAdapter`. */
  walletAdapter: WalletAdapterResolver;
  /** Pass to `<PollarProvider ui={{ renderWallets }}>`. */
  renderWallets: RenderWalletsSlot;
}

/**
 * One-shot helper that builds both halves of the integration from a single
 * options object: the `walletAdapter` (a `WalletAdapterResolver` for the SDK)
 * and `renderWallets` (a slot for `<PollarProvider ui={{ ... }}>`). The same
 * `network` / `modules` / `picker` opts power both, so the picker shows the
 * exact wallets that signing will actually work with.
 *
 * @example
 * ```tsx
 * import { createStellarWalletsKitBundle } from '@pollar/stellar-wallets-kit-adapter/picker';
 * import { Networks } from '@creit.tech/stellar-wallets-kit';
 *
 * const bundle = createStellarWalletsKitBundle({
 *   network: Networks.PUBLIC,
 *   picker: { wallets: ['xbull', 'lobstr', 'freighter'] },
 * });
 *
 * <PollarProvider
 *   client={{ apiKey: '…', walletAdapter: bundle.walletAdapter }}
 *   ui={{ renderWallets: bundle.renderWallets }}
 * />
 * ```
 */
export function createStellarWalletsKitBundle(
  options: StellarWalletsKitAdapterOptions = {},
): StellarWalletsKitBundle {
  const walletAdapter = stellarWalletsKit(options);
  const renderWallets: RenderWalletsSlot = (slot) => (
    <KitWalletPicker
      onConnect={slot.onConnect}
      authState={slot.authState}
      {...(options.network !== undefined && { network: options.network })}
      {...(options.modules !== undefined && { modules: options.modules })}
      {...(options.picker !== undefined && { picker: options.picker })}
    />
  );
  return { walletAdapter, renderWallets };
}
