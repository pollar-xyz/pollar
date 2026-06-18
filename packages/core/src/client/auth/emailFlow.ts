import { AUTH_ERROR_CODES, AuthProviderContext } from '../../types';
import { logApiError } from './logging';

/**
 * Mint an auth session and move to the email-entry step. Returns the
 * `clientSessionId` so a one-shot caller can chain straight into
 * {@link sendEmailCode}; returns `null` if session creation failed (the error
 * state is already set by `ctx.createSession()`).
 */
export async function initEmailSession(ctx: AuthProviderContext): Promise<string | null> {
  const clientSessionId = await ctx.createSession();
  if (!clientSessionId) return null;
  ctx.setAuthState({ step: 'entering_email', clientSessionId });
  return clientSessionId;
}

export async function sendEmailCode(email: string, clientSessionId: string, ctx: AuthProviderContext): Promise<void> {
  const { api, logger, signal, setAuthState } = ctx;

  setAuthState({ step: 'sending_email', email });

  const body = { clientSessionId, email };
  const { data, error } = await api.POST('/auth/email', { body, signal });

  if (error || !data?.success) {
    if (!error) logApiError(logger, 'POST /auth/email', { body, data });
    setAuthState({
      step: 'error',
      previousStep: 'sending_email',
      message: 'Failed to send code',
      errorCode: AUTH_ERROR_CODES.EMAIL_SEND_FAILED,
    });
    return;
  }

  setAuthState({ step: 'entering_code', clientSessionId, email });
}

export async function verifyAndAuthenticate(
  code: string,
  clientSessionId: string,
  email: string,
  ctx: AuthProviderContext,
): Promise<void> {
  const { api, logger, signal, setAuthState } = ctx;

  setAuthState({ step: 'verifying_email_code', clientSessionId, email });

  const body = { clientSessionId, code };
  const { data, error } = await api.POST('/auth/email/verify-code', { body, signal });

  if (data?.code === 'SDK_EMAIL_CODE_VERIFIED') {
    await ctx.authenticate(clientSessionId);
    return;
  }

  // Extract error code from either the 4xx error body or the 200 body
  const errCode =
    (error as unknown as { error?: string } | undefined)?.error ?? (data as unknown as { code?: string } | undefined)?.code;

  if (errCode === 'SDK_EMAIL_CODE_EXPIRED') {
    if (!error) logApiError(logger, 'POST /auth/email/verify-code', { body, data });
    setAuthState({
      step: 'error',
      previousStep: 'verifying_email_code',
      message: 'Code expired — request a new one',
      errorCode: AUTH_ERROR_CODES.EMAIL_CODE_EXPIRED,
      clientSessionId,
      email,
    });
    return;
  }

  if (errCode === 'INVALID_EMAIL_CODE' || errCode === 'SDK_EMAIL_CODE_INVALID') {
    if (!error) logApiError(logger, 'POST /auth/email/verify-code', { body, data });
    setAuthState({
      step: 'error',
      previousStep: 'verifying_email_code',
      message: 'Invalid code — try again',
      errorCode: AUTH_ERROR_CODES.EMAIL_CODE_INVALID,
      clientSessionId,
      email,
    });
    return;
  }

  if (!error) logApiError(logger, 'POST /auth/email/verify-code', { body, data });
  setAuthState({
    step: 'error',
    previousStep: 'verifying_email_code',
    message: 'Failed to verify code — try again',
    errorCode: AUTH_ERROR_CODES.EMAIL_VERIFY_FAILED,
  });
}
