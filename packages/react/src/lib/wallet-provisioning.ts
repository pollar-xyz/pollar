import type { WalletInfo } from '@pollar/core';

/**
 * The one place the widget decides whether a wallet can act on-chain, and what
 * to say when it cannot.
 *
 * Only STELLAR is gated: `provisioning` describes the Stellar account, and a
 * Solana wallet has nothing to wait for. Only the ACCOUNT is described, never
 * trustlines - an asset the app enabled yesterday is not a reason to stop a
 * user from sending the one they already hold.
 *
 * Returns null when the wallet is usable, so a caller reads it as "no reason to
 * block".
 */
export function walletNotReadyReason(wallet: WalletInfo | null | undefined, chain: string | null | undefined): string | null {
  if (chain !== null && chain !== undefined && chain !== 'STELLAR') return null;
  if (wallet?.provisioning === 'CREATING') {
    return 'Your wallet is still being prepared on the network. This usually takes a few seconds.';
  }
  if (wallet?.provisioning === 'FAILED') {
    return 'Your wallet could not be created on the network. Sign in again to retry.';
  }
  return null;
}
