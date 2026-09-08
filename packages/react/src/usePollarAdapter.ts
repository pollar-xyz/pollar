'use client';

import type { PollarAdapter, SubmitOutcome } from '@pollar/core';
import { usePollar } from './context';

type WrappedAdapter<T extends PollarAdapter> = {
  [K in keyof T]: (params: Parameters<T[K]>[0]) => Promise<SubmitOutcome>;
};

export function createPollarAdapterHook<T extends PollarAdapter>(key: string) {
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
          return signAndSubmitTx(unsignedTransaction);
        },
      ]),
    ) as WrappedAdapter<T>;
  };
}
