import { Hono } from 'hono';
import { type AdapterDeps, type AppEnv, ErrorCode, SuccessCode } from '../types';
import { withTimeout } from '../lib/timeout';

export const createWalletsAddressRoute = (deps: AdapterDeps) => {
  const app = new Hono<AppEnv>();

  app.get('/:userId/address', async (c) => {
    const userId = c.req.param('userId');
    if (!userId) {
      return c.var.error(ErrorCode.VALIDATION_ERROR, 400);
    }

    try {
      const privy = await deps.getPrivy();
      const list = await withTimeout(
        privy.wallets().list({ chain_type: 'stellar', user_id: userId }),
        deps.config.requestTimeoutMs,
      );

      const wallet = list.data[0];
      if (!wallet) {
        return c.var.error(ErrorCode.WALLET_NOT_FOUND, 404);
      }

      deps.walletCache.set(wallet.address, wallet.id);

      return c.var.content(SuccessCode.PRIVY_ADAPTER_WALLET_ADDRESS, { address: wallet.address });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      deps.config.onError?.(err, { endpoint: `GET /wallets/${userId}/address`, body: null });
      return c.var.error(ErrorCode.INTERNAL_SERVER_ERROR, 500);
    }
  });

  return app;
};
