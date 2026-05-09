import { Hono } from 'hono';
import { z } from 'zod';
import { type AdapterDeps, type AppEnv, ErrorCode, SuccessCode } from '../types';
import { withTimeout } from '../lib/timeout';

const BodySchema = z.object({
  userId: z.string().min(1),
});

export const createWalletsCreateRoute = (deps: AdapterDeps) => {
  const app = new Hono<AppEnv>();

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
      const privy = await deps.getPrivy();

      const existing = await withTimeout(
        privy.wallets().list({ chain_type: 'stellar', user_id: userId }),
        deps.config.requestTimeoutMs,
      );

      const existingWallet = existing.data[0];
      if (existingWallet) {
        deps.walletCache.set(existingWallet.address, existingWallet.id);
        return c.var.content(SuccessCode.PRIVY_ADAPTER_WALLET_EXISTS, { address: existingWallet.address });
      }

      const wallet = await withTimeout(
        privy.wallets().create({ chain_type: 'stellar', owner: { user_id: userId } }),
        deps.config.requestTimeoutMs,
      );

      deps.walletCache.set(wallet.address, wallet.id);
      deps.config.onWalletCreated?.(userId, wallet.address);

      return c.var.content(SuccessCode.PRIVY_ADAPTER_WALLET_CREATED, { address: wallet.address }, 201);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      deps.config.onError?.(err, { endpoint: 'POST /wallets/create', body: parsed });
      return c.var.error(ErrorCode.WALLET_CREATION_FAILED, 502, { reason: err.message });
    }
  });

  return app;
};
