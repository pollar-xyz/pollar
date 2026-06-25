import { timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import { ErrorCode, type AppEnv } from '../types';

const WWW_AUTH_MISSING = 'Bearer realm="pollar-privy-adapter"';
const WWW_AUTH_INVALID = 'Bearer realm="pollar-privy-adapter", error="invalid_token"';

export const createBearerMiddleware = (pollarApiSecret: string) => {
  const expected = Buffer.from(pollarApiSecret, 'utf8');

  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      c.header('WWW-Authenticate', WWW_AUTH_MISSING);
      return c.var.error(ErrorCode.FORBIDDEN, 401);
    }

    const provided = Buffer.from(auth.slice(7), 'utf8');
    // timingSafeEqual throws on length mismatch — guard first.
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      c.header('WWW-Authenticate', WWW_AUTH_INVALID);
      return c.var.error(ErrorCode.FORBIDDEN, 401);
    }

    await next();
  };
};
