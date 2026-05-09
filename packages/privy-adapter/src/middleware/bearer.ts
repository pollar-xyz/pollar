import { timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import { ErrorCode, type AppEnv } from '../types';

export const createBearerMiddleware = (pollarApiSecret: string) => {
  const expected = Buffer.from(pollarApiSecret, 'utf8');

  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return c.var.error(ErrorCode.FORBIDDEN, 401);
    }

    const provided = Buffer.from(auth.slice(7), 'utf8');
    // timingSafeEqual throws on length mismatch — guard first.
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return c.var.error(ErrorCode.FORBIDDEN, 401);
    }

    await next();
  };
};
