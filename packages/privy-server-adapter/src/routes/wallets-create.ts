import { Hono } from 'hono';
import { z } from 'zod';
import { type AdapterDeps, type AppEnv, ErrorCode, SuccessCode } from '../types';
import { withTimeout } from '../lib/timeout';
import { findStellarWalletInUser, getOrCreatePrivyUser } from '../lib/user-mapping';

const BodySchema = z.object({
  userId: z.string().min(1),
});

export const createWalletsCreateRoute = (deps: AdapterDeps) => {
  const app = new Hono<AppEnv>();

  /**
   * In-process dedupe of concurrent create requests for the same userId.
   *
   * `getOrCreatePrivyUser` already handles the user-creation race (Privy
   * returns `ConflictError` on the second `users.create`, we fall back to
   * fetch). But for an EXISTING user without a stellar wallet, both
   * requests fall through `findStellarWalletInUser → null` and both call
   * `wallets().create(...)` — Privy doesn't dedupe by user, so you get two
   * stellar wallets attached to the same Privy user, with the second
   * overwriting the first in `walletCache`.
   *
   * The mutex is per-process: scaling the adapter to N replicas reintroduces
   * the race across instances. That's an accepted trade-off — the adapter is
   * documented as stateless beyond in-memory caches.
   */
  const inflight = new Map<string, Promise<{ address: string; walletCreated: boolean }>>();

  app.post('/', async (c) => {
    let parsed: z.infer<typeof BodySchema>;
    try {
      const body = (await c.req.json()) as unknown;
      parsed = BodySchema.parse(body);
    } catch (e) {
      const issues = e instanceof z.ZodError ? e.flatten() : { message: 'invalid JSON' };
      return c.var.error(ErrorCode.VALIDATION_ERROR, 400, { issues });
    }

    const { userId } = parsed;

    try {
      let promise = inflight.get(userId);
      if (!promise) {
        promise = (async () => {
          try {
            const privy = await deps.getPrivy();

            // Privy's API requires owner.user_id to be a did:privy: identifier, not
            // Pollar's SDK user CUID. We resolve (or create) the Privy user via
            // custom_auth linked_accounts; users.create returns the wallet inline.
            const { user, created } = await getOrCreatePrivyUser(privy, userId, {
              ensureStellarWallet: true,
              timeoutMs: deps.config.requestTimeoutMs,
            });

            let stellar = findStellarWalletInUser(user);
            let walletCreated = created && stellar !== null;

            // Existing user with no stellar wallet (pre-stellar account, or wallet
            // detached). Provision one now, owned by the resolved DID.
            if (!stellar) {
              const wallet = await withTimeout(
                privy.wallets().create({ chain_type: 'stellar', owner: { user_id: user.id } }),
                deps.config.requestTimeoutMs,
              );
              stellar = { id: wallet.id, address: wallet.address };
              walletCreated = true;
            }

            deps.walletCache.set(stellar.address, stellar.id);
            // Fire `onWalletCreated` inside the de-duplicated block so it
            // emits exactly once per actual creation, not once per coalesced
            // request awaiter.
            if (walletCreated) {
              deps.config.onWalletCreated?.(userId, stellar.address);
            }
            return { address: stellar.address, walletCreated };
          } finally {
            inflight.delete(userId);
          }
        })();
        inflight.set(userId, promise);
      }

      const { address, walletCreated } = await promise;
      if (walletCreated) {
        return c.var.content(SuccessCode.PRIVY_ADAPTER_WALLET_CREATED, { address }, 201);
      }
      return c.var.content(SuccessCode.PRIVY_ADAPTER_WALLET_EXISTS, { address });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Raw error to `onError` (server-side logs); HTTP response is code-only
      // so Privy internals don't leak to the caller.
      deps.config.onError?.(err, { endpoint: 'POST /wallets/create', body: parsed });
      return c.var.error(ErrorCode.WALLET_CREATION_FAILED, 502);
    }
  });

  return app;
};
