import { Hono } from 'hono';
import { z } from 'zod';
import { type AdapterDeps, type AppEnv, ErrorCode, SuccessCode } from '../types';
import { withTimeout } from '../lib/timeout';
import { assembleSignedXdr, computeTxHash } from '../stellar';

const BodySchema = z.object({
  userId: z.string().min(1),
  walletAddress: z.string().min(1),
  txXdr: z.string().min(1),
});

export const createWalletsSignRoute = (deps: AdapterDeps) => {
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

    const { userId, walletAddress, txXdr } = parsed;

    let txHash: Buffer;
    try {
      txHash = computeTxHash(txXdr, deps.config.network);
    } catch {
      return c.var.error(ErrorCode.TX_INVALID_SIGNED_XDR, 400);
    }

    try {
      let walletId = deps.walletCache.get(walletAddress);

      if (!walletId) {
        const privy = await deps.getPrivy();
        const list = await withTimeout(
          privy.wallets().list({ chain_type: 'stellar', user_id: userId }),
          deps.config.requestTimeoutMs,
        );

        const match = list.data.find((w) => w.address === walletAddress);
        if (!match) {
          return c.var.error(ErrorCode.WALLET_NOT_FOUND, 404);
        }
        walletId = match.id;
        deps.walletCache.set(walletAddress, walletId);
      }

      const privy = await deps.getPrivy();
      const hashHex = '0x' + txHash.toString('hex');

      const result = await withTimeout(
        privy.wallets().rawSign(walletId, { params: { hash: hashHex } }),
        deps.config.requestTimeoutMs,
      );

      const sigHex = result.signature.startsWith('0x') ? result.signature.slice(2) : result.signature;
      const sigBytes = Buffer.from(sigHex, 'hex');

      const signedTxXdr = assembleSignedXdr(txXdr, deps.config.network, walletAddress, sigBytes);

      deps.config.onTransactionSigned?.(walletAddress);

      return c.var.content(SuccessCode.PRIVY_ADAPTER_TX_SIGNED, { signedTxXdr });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      deps.config.onError?.(err, { endpoint: 'POST /wallets/sign', body: parsed });
      return c.var.error(ErrorCode.TX_SUBMIT_FAILED, 502, { reason: err.message });
    }
  });

  return app;
};
