import { PollarAuthProvider } from '../../types';
import { initEmailSession, sendEmailCode, verifyAndAuthenticate } from './emailFlow';

/**
 * Built-in hosted-OAuth provider (`google` / `github`). The whole popup +
 * status-poll dance lives in `ctx.startHostedOAuth`, so the provider is a
 * one-liner — and any custom provider can reuse the same helper.
 */
export function oauthProvider(provider: 'google' | 'github'): PollarAuthProvider {
  return {
    id: provider,
    login: (ctx) => ctx.startHostedOAuth(provider),
  };
}

/**
 * Built-in email OTP provider. `login` is the one-shot entry point used by
 * `login({ provider: 'email', email })` (create session + send the first code).
 * The interactive continuation (resend / verify) is exposed both as the
 * dedicated `PollarClient` methods and here as `actions`, so a generic consumer
 * can drive it through `providerAction('email', ...)` too.
 */
export function emailProvider(): PollarAuthProvider {
  return {
    id: 'email',
    login: async (ctx, options) => {
      const email = (options as { email?: string }).email ?? '';
      const clientSessionId = await initEmailSession(ctx);
      if (clientSessionId) await sendEmailCode(email, clientSessionId, ctx);
    },
    actions: {
      begin: async (ctx) => {
        await initEmailSession(ctx);
      },
      sendCode: (ctx, payload) => {
        const { email, clientSessionId } = (payload ?? {}) as { email: string; clientSessionId: string };
        return sendEmailCode(email, clientSessionId, ctx);
      },
      verifyCode: (ctx, payload) => {
        const { code, clientSessionId, email } = (payload ?? {}) as {
          code: string;
          clientSessionId: string;
          email: string;
        };
        return verifyAndAuthenticate(code, clientSessionId, email, ctx);
      },
    },
  };
}
