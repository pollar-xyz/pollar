import type { Context, Next } from 'hono';
import type { AppEnv, PaginationMeta } from '../types';
import { ErrorCode, SuccessCode } from '../types';

export const responseMiddleware = async (c: Context<AppEnv>, next: Next) => {
  c.set('content', <T>(code: SuccessCode, content: T, status?: number) =>
    c.json({ content, code, success: true }, (status ?? 200) as never),
  );

  c.set('contents', <T>(contents: T[], meta: PaginationMeta) => c.json({ contents, success: true, meta }));

  c.set('error', (code: ErrorCode, status?: number, extra?: Record<string, unknown>) => {
    return c.json({ code, success: false, ...extra }, (status ?? 400) as never);
  });

  await next();
};
