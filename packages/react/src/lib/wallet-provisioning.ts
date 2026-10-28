import type { PollarLanguage, WalletChain, WalletInfo } from '@pollar/core';

const NOT_READY: Record<PollarLanguage, Record<'creating' | 'failed', string>> = {
  en: {
    creating: 'Your wallet is still being prepared on the network. This usually takes a few seconds.',
    failed: 'Your wallet could not be created on the network. Sign in again to retry.',
  },
  es: {
    creating: 'Tu billetera todavía se está preparando en la red. Suele tardar unos segundos.',
    failed: 'No se pudo crear tu billetera en la red. Inicia sesión de nuevo para reintentar.',
  },
  pt: {
    creating: 'Sua carteira ainda está sendo preparada na rede. Isso costuma levar alguns segundos.',
    failed: 'Não foi possível criar sua carteira na rede. Entre novamente para tentar de novo.',
  },
};

/**
 * The one place the widget decides whether a wallet can act on-chain, and what
 * to say when it cannot.
 *
 * Only STELLAR is gated: `provisioning` describes the Stellar account, and a
 * Solana wallet has nothing to wait for. Only the ACCOUNT is described, never
 * trustlines - an asset the app enabled yesterday is not a reason to stop a
 * user from sending the one they already hold.
 *
 * A `null` chain is "not known yet" (the app's chain order comes from
 * `/config`, which is still in flight on a cold start) and reads as no reason
 * to block. Guessing STELLAR there would tell a Solana-first user their wallet
 * is being prepared, next to a Solana address that sends and receives fine.
 *
 * Returns null when the wallet is usable, so a caller reads it as "no reason to
 * block".
 */
export function walletNotReadyReason(
  wallet: WalletInfo | null | undefined,
  chain: WalletChain | null | undefined,
  language: PollarLanguage = 'en',
): string | null {
  if (chain !== 'STELLAR') return null;
  if (wallet?.provisioning === 'CREATING') {
    return NOT_READY[language].creating;
  }
  if (wallet?.provisioning === 'FAILED') {
    return NOT_READY[language].failed;
  }
  return null;
}
