import { AUTH_ERROR_CODES, PollarAuthProvider } from '../../types';
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
      // Reject a blank email BEFORE minting a server session, so an `email`-less
      // login() doesn't create an orphaned session that then errors. sendEmailCode
      // validates too (the real safety net) — this just fails faster and avoids
      // the wasted /auth/session round-trip.
      if (!email.trim()) {
        ctx.setAuthState({
          step: 'error',
          previousStep: 'sending_email',
          message: 'A valid email address is required',
          errorCode: AUTH_ERROR_CODES.EMAIL_SEND_FAILED,
        });
        return;
      }
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
