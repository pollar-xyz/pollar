import { createHash } from 'node:crypto';
import { PrivyClient } from '@privy-io/node';
import type { ResolvedAdapterConfig } from './types';

interface CacheEntry {
  fingerprint: string;
  client: PrivyClient;
  expiresAt: number;
}

export const createPrivyClientFactory = (config: ResolvedAdapterConfig) => {
  let entry: CacheEntry | null = null;

  return async (): Promise<PrivyClient> => {
    const now = Date.now();

    if (entry && entry.expiresAt > now) {
      return entry.client;
    }

    const { appId, appSecret } = await config.getCredentials();
    const fingerprint = createHash('sha256').update(`${appId}:${appSecret}`).digest('hex');

    if (entry && entry.fingerprint === fingerprint) {
      // Credentials unchanged — extend TTL, keep client to avoid reconnect overhead.
      entry.expiresAt = now + config.cacheTtlMs;
      return entry.client;
    }

    const client = new PrivyClient({ appId, appSecret, timeout: config.requestTimeoutMs });
    entry = { fingerprint, client, expiresAt: now + config.cacheTtlMs };
    return client;
  };
};
