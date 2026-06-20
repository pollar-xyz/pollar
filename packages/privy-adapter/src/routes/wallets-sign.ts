import { Hono } from 'hono';
import type { Transaction } from '@stellar/stellar-sdk';
import { NotFoundError } from '@privy-io/node';
import { z } from 'zod';
import { type AdapterDeps, type AppEnv, ErrorCode, SuccessCode } from '../types';
import { withTimeout } from '../lib/timeout';
import { findStellarWalletInUser } from '../lib/user-mapping';
import { assembleSignedXdr, parseTx, validateTxOperations } from '../stellar';

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

    let tx: Transaction;
    try {
      tx = parseTx(txXdr, deps.config.network);
    } catch {
      return c.var.error(ErrorCode.TX_INVALID_SIGNED_XDR, 400);
    }

    // Operation allowlist gate. Privy can't apply per-operation policy (it only
    // ever sees the tx hash via rawSign), so this is the only enforcement point.
    // Runs before any Privy round-trip so a disallowed tx never reaches signing.
    const policyCheck = validateTxOperations(tx, {
      allowedOperations: deps.config.allowedOperations,
      restrictToTrustlines: deps.config.restrictToTrustlines,
    });
    if (!policyCheck.ok) {
      return c.var.error(ErrorCode.TX_OPERATION_NOT_ALLOWED, 403, { reason: policyCheck.reason });
    }

    try {
      let walletId = deps.walletCache.get(walletAddress);

      if (!walletId) {
        // Cache miss: resolve userId → did:privy: and inspect linked_accounts
        // to find the matching wallet. We do NOT auto-create here; sign without
        // a pre-existing wallet must surface as WALLET_NOT_FOUND so the caller
        // can route through the create flow first.
        const privy = await deps.getPrivy();

        let user;
        try {
          user = await withTimeout(privy.users().getByCustomAuthID({ custom_user_id: userId }), deps.config.requestTimeoutMs);
        } catch (err) {
          if (err instanceof NotFoundError) {
            return c.var.error(ErrorCode.WALLET_NOT_FOUND, 404);
          }
          throw err;
        }

        const stellar = findStellarWalletInUser(user);
        if (!stellar || stellar.address !== walletAddress) {
          return c.var.error(ErrorCode.WALLET_NOT_FOUND, 404);
        }
        walletId = stellar.id;
        deps.walletCache.set(walletAddress, walletId);
      }

      const privy = await deps.getPrivy();
      const hashHex = '0x' + tx.hash().toString('hex');

      let result;
      try {
        result = await withTimeout(
          privy.wallets().rawSign(walletId, { params: { hash: hashHex } }),
          deps.config.requestTimeoutMs,
        );
      } catch (err) {
        // Cache may have a stale walletId (wallet detached / deleted on
        // Privy side between resolution and now). Evict so the next request
        // re-resolves from Privy — this request still fails, but we don't
        // keep returning errors for the same stale entry until TTL expires.
        if (err instanceof NotFoundError) {
          deps.walletCache.delete(walletAddress);
          return c.var.error(ErrorCode.WALLET_NOT_FOUND, 404);
        }
        throw err;
      }

      const sigHex = result.signature.startsWith('0x') ? result.signature.slice(2) : result.signature;
      const sigBytes = Buffer.from(sigHex, 'hex');

      const signedTxXdr = assembleSignedXdr(tx, walletAddress, sigBytes);

      deps.config.onTransactionSigned?.(walletAddress);

      return c.var.content(SuccessCode.PRIVY_ADAPTER_TX_SIGNED, { signedTxXdr });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Raw error goes to the host's `onError` callback for server-side logging
      // (Privy SDK errors can include user IDs, rate-limit context, internal
      // identifiers — none of which the caller should see). The HTTP response
      // is intentionally code-only.
      deps.config.onError?.(err, { endpoint: 'POST /wallets/sign', body: parsed });
      return c.var.error(ErrorCode.TX_SIGN_FAILED, 502);
    }
  });

  return app;
};
