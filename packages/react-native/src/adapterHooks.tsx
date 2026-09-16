import type { PollarAdapters } from '@pollar/core';
import { useRef } from 'react';
import { usePollar } from './context';
type EscrowAdapter = PollarAdapters[string];

type WrappedAdapter<T extends EscrowAdapter> = {
  [K in keyof T]: (params: Parameters<T[K]>[0]) => Promise<void>;
};

export function createPollarAdapterHook<T extends EscrowAdapter>(key: string) {
  return function usePollarAdapter(): WrappedAdapter<T> {
    const { adapters, signAndSubmitTx } = usePollar();
    const pending = useRef(false);
    const adapter = adapters?.[key] as T | undefined;

    if (!adapter) {
      throw new Error(`No adapter "${key}" provided to PollarProvider`);
    }

    return Object.fromEntries(
      Object.entries(adapter).map(([name, fn]) => [
        name,
        async (params: Parameters<typeof fn>[0]) => {
          if (pending.current) throw new Error('An adapter transaction is already pending.');
          pending.current = true;
          try {
            const { unsignedTransaction } = await fn(params);
            await signAndSubmitTx(unsignedTransaction);
          } finally {
            pending.current = false;
          }
        },
      ]),
    ) as WrappedAdapter<T>;
  };
}
