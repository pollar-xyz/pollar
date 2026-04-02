'use client';

import type { EscrowAdapter } from '@pollar/core';
import { usePollar } from './context';

type WrappedAdapter<T extends EscrowAdapter> = {
  [K in keyof T]: (params: Parameters<T[K]>[0]) => Promise<void>;
};

export function createPollarAdapterHook<T extends EscrowAdapter>(key: string) {
  return function usePollarAdapter(): WrappedAdapter<T> {
    const { adapters, signAndSubmitTx } = usePollar();
    const adapter = adapters?.[key] as T | undefined;

    if (!adapter) {
      throw new Error(`No adapter "${key}" provided to PollarProvider`);
    }

    return Object.fromEntries(
      Object.entries(adapter).map(([name, fn]) => [
        name,
        async (params: Parameters<typeof fn>[0]) => {
          const { unsignedTransaction } = await fn(params);
          await signAndSubmitTx(unsignedTransaction);
        },
      ]),
    ) as WrappedAdapter<T>;
  };
}
