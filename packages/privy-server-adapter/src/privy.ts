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
  // Coalesce concurrent expired-cache calls. Without this, two requests
  // arriving while `entry` is null/expired would each call
  // `config.getCredentials()` and `new PrivyClient(...)`, with the second
  // overwriting the first — wasted creds fetch + an orphaned client.
  let pending: Promise<PrivyClient> | null = null;

  return async (): Promise<PrivyClient> => {
    const now = Date.now();

    if (entry && entry.expiresAt > now) {
      return entry.client;
    }

    if (pending) return pending;

    pending = (async () => {
      try {
        const { appId, appSecret } = await config.getCredentials();
        const fingerprint = createHash('sha256').update(`${appId}:${appSecret}`).digest('hex');

        if (entry && entry.fingerprint === fingerprint) {
          // Credentials unchanged — extend TTL, keep client to avoid reconnect overhead.
          entry.expiresAt = Date.now() + config.cacheTtlMs;
          return entry.client;
        }

        const client = new PrivyClient({ appId, appSecret, timeout: config.requestTimeoutMs });
        entry = { fingerprint, client, expiresAt: Date.now() + config.cacheTtlMs };
        return client;
      } finally {
        pending = null;
      }
    })();

    return pending;
  };
};
