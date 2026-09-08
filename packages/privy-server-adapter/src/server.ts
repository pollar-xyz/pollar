import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { type AdapterDeps, type AppEnv, ErrorCode } from './types';
import { responseMiddleware } from './middleware/response';
import { createBearerMiddleware } from './middleware/bearer';
import { createHealthRoute } from './routes/health';
import { createWalletsCreateRoute } from './routes/wallets-create';
import { createWalletsSignRoute } from './routes/wallets-sign';
import { createWalletsAddressRoute } from './routes/wallets-address';

export const createApp = (deps: AdapterDeps): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();

  app.use('*', responseMiddleware);

  app.use(
    '*',
    bodyLimit({
      maxSize: deps.config.maxBodyBytes,
      onError: (c) => c.var.error(ErrorCode.VALIDATION_ERROR, 413, { reason: 'body too large' }),
    }),
  );

  app.route('/health', createHealthRoute());

  const auth = createBearerMiddleware(deps.config.pollarApiSecret);
  app.use('/wallets/*', auth);

  app.route('/wallets/create', createWalletsCreateRoute(deps));
  app.route('/wallets/sign', createWalletsSignRoute(deps));
  app.route('/wallets', createWalletsAddressRoute(deps));

  app.onError((error, c) => {
    deps.config.onError?.(error, { endpoint: c.req.path, body: null });
    return c.var.error(ErrorCode.INTERNAL_SERVER_ERROR, 500);
  });

  return app;
};
