import { serve } from '@hono/node-server';
import { LRUCache } from 'lru-cache';
import { createApp } from './server';
import { createPrivyClientFactory } from './privy';
import type { AdapterDeps, PollarPrivyAdapter, PollarPrivyAdapterConfig, ResolvedAdapterConfig, WalletCache } from './types';

const DEFAULT_PORT = 3001;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const WALLET_CACHE_TTL_MS = 10 * 60 * 1000;
const WALLET_CACHE_MAX = 1000;

export const createPollarPrivyAdapter = (config: PollarPrivyAdapterConfig): PollarPrivyAdapter => {
  const resolvedConfig: ResolvedAdapterConfig = {
    ...config,
    port: config.port ?? DEFAULT_PORT,
    cacheTtlMs: config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    maxBodyBytes: config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
  };

  const getPrivy = createPrivyClientFactory(resolvedConfig);

  const walletCache: WalletCache = new LRUCache<string, string>({
    max: WALLET_CACHE_MAX,
    ttl: WALLET_CACHE_TTL_MS,
  });

  const deps: AdapterDeps = {
    config: resolvedConfig,
    getPrivy,
    walletCache,
  };

  const app = createApp(deps);

  let server: ReturnType<typeof serve> | null = null;

  return {
    async start(): Promise<void> {
      if (server) return;
      await new Promise<void>((resolve, reject) => {
        const s = serve(
          {
            fetch: app.fetch,
            port: resolvedConfig.port,
          },
          () => resolve(),
        );
        s.once('error', (err: Error) => {
          server = null;
          reject(err);
        });
        server = s;
      });
    },
    async stop(): Promise<void> {
      if (!server) return;
      const s = server;
      server = null;
      await new Promise<void>((resolve, reject) => {
        s.close((err?: Error) => (err ? reject(err) : resolve()));
      });
    },
  };
};

export type { PollarPrivyAdapter, PollarPrivyAdapterConfig, StellarNetwork } from './types';
export { SuccessCode, ErrorCode } from './types';
