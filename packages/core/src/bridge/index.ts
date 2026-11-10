import type { BridgeChain, BridgeConfig, BridgeTransfer } from '../types';

const SETTLED = ['COMPLETED', 'FAILED', 'HELD'];

/** True once the transfer no longer moves on its own: completed, failed clean, or held for Pollar. */
export function isBridgeSettled(transfer: Pick<BridgeTransfer, 'status'>): boolean {
  return SETTLED.includes(transfer.status);
}

/** The chains the user can bridge from now, in the config's order. */
export function bridgeSourceChains(config: BridgeConfig): BridgeChain[] {
  const chains: BridgeChain[] = [];
  for (const { fromChain } of config.directions) if (!chains.includes(fromChain)) chains.push(fromChain);
  return chains;
}

/** Where the user can bridge to from `from`. */
export function bridgeTargetChains(config: BridgeConfig, from: BridgeChain): BridgeChain[] {
  return config.directions.filter((d) => d.fromChain === from).map((d) => d.toChain);
}
