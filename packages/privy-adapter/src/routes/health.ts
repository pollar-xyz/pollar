import { Hono } from 'hono';
import { type AppEnv, SuccessCode } from '../types';

export const createHealthRoute = () => {
  const app = new Hono<AppEnv>();

  app.get('/', (c) =>
    c.var.content(SuccessCode.PRIVY_ADAPTER_HEALTH_OK, {
      ok: true,
      timestamp: Date.now(),
    }),
  );

  return app;
};
