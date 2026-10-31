'use client';

import {
  completeAuthEntryStep,
  isAuthEntryAdapterStep,
  type AuthEntryAdapterOutcome,
  type AuthEntryAdapterStep,
  type PollarAdapter,
  type SubmitOutcome,
} from '@pollar/core';
import { usePollar } from './context';

/** A transaction adapter answers with the submit; an auth-entry one with what its `complete` returned. */
type WrappedAdapter<T extends PollarAdapter> = {
  [K in keyof T]: (
    params: Parameters<T[K]>[0],
  ) => Promise<Awaited<ReturnType<T[K]>> extends AuthEntryAdapterStep<infer R> ? AuthEntryAdapterOutcome<R> : SubmitOutcome>;
};

export function createPollarAdapterHook<T extends PollarAdapter>(key: string) {
  return function usePollarAdapter(): WrappedAdapter<T> {
    const { adapters, signAndSubmitTx, getClient } = usePollar();
    const adapter = adapters?.[key] as T | undefined;

    if (!adapter) {
      throw new Error(`No adapter "${key}" provided to PollarProvider`);
    }

    return Object.fromEntries(
      Object.entries(adapter).map(([name, fn]) => [
        name,
        async (params: Parameters<typeof fn>[0]) => {
          const result = await fn(params);
          if (isAuthEntryAdapterStep(result)) {
            const client = getClient();
            return completeAuthEntryStep(result, (entry, options) => client.signAuthEntry(entry, options));
          }
          return signAndSubmitTx(result.unsignedTransaction);
        },
      ]),
    ) as WrappedAdapter<T>;
  };
}
