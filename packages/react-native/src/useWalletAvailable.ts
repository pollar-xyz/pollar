import { useEffect } from 'react';
import type { WalletBalanceRecord, WalletChain } from '@pollar/core';
import { usePollar } from './context';

/**
 * An asset on one chain. `issuer` is the Stellar issuer or the token contract;
 * null is the chain's native coin, and leaving it out matches on the code alone.
 */
export interface WalletAssetRef {
  chain: WalletChain;
  code: string;
  issuer?: string | null | undefined;
}

/** The wallet's record of an asset, or undefined when it does not hold it. */
export function findWalletBalance(balances: WalletBalanceRecord[], asset: WalletAssetRef): WalletBalanceRecord | undefined {
  const { issuer } = asset;
  return balances.find((b) => {
    if ((b.chain ?? 'STELLAR') !== asset.chain) return false;
    // The native coin goes by its type: its code differs per chain and per caller (XLM, native).
    if (issuer === null) return b.type === 'native' || (!b.issuer && b.code === asset.code);
    if (b.code !== asset.code) return false;
    return issuer === undefined || !b.issuer || b.issuer.toLowerCase() === issuer.toLowerCase();
  });
}

/**
 * What the user's wallet can spend of an asset: '0' when it does not hold it, null
 * when its chain could not be read, undefined while balances are not read yet or
 * no asset is given. Reads the balances once if nothing has asked for them.
 */
export function useWalletAvailable(asset: WalletAssetRef | null | undefined): string | null | undefined {
  const { walletBalance, refreshWalletBalance } = usePollar();
  const wanted = !!asset;

  useEffect(() => {
    if (wanted && walletBalance.step === 'idle') void refreshWalletBalance();
  }, [wanted, walletBalance.step, refreshWalletBalance]);

  if (!asset || walletBalance.step !== 'loaded') return undefined;
  const record = findWalletBalance(walletBalance.data.balances, asset);
  return record ? record.available : '0';
}
