import type { WalletChain } from '@pollar/core';

/** The explorer page of a transaction on its own chain; testnet is Solana devnet and Polygon Amoy. */
export function explorerTxUrl(chain: WalletChain | undefined, hash: string, network: string): string {
  const testnet = network === 'testnet';
  if (chain === 'SOLANA') return `https://explorer.solana.com/tx/${hash}${testnet ? '?cluster=devnet' : ''}`;
  if (chain === 'POLYGON') return `https://${testnet ? 'amoy.' : ''}polygonscan.com/tx/${hash}`;
  return `https://stellar.expert/explorer/${testnet ? 'testnet' : 'public'}/tx/${hash}`;
}
