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

  // Validate before hitting the API — an empty email/session (e.g. login()
  // called without an `email`, or an action with a missing payload) would
  // otherwise POST blanks to /auth/email and get an opaque 400.
  if (!email?.trim() || !clientSessionId) {
    setAuthState({
      step: 'error',
      previousStep: 'sending_email',
      message: 'A valid email address is required',
      errorCode: AUTH_ERROR_CODES.EMAIL_SEND_FAILED,
    });
    return;
  }

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

  // Validate before hitting the API — a blank code/session would otherwise POST
  // blanks to /auth/email/verify-code for an opaque 400.
  if (!code?.trim() || !clientSessionId) {
    setAuthState({
      step: 'error',
      previousStep: 'verifying_email_code',
      message: 'A verification code is required',
      errorCode: AUTH_ERROR_CODES.EMAIL_CODE_INVALID,
    });
    return;
  }

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
  // Carry `clientSessionId`/`email` so this generic failure (transient 5xx,
  // contract drift) stays RETRYABLE — the message says "try again" and the
  // session is usually still alive, so `verifyEmailCode()` must be able to
  // re-submit without restarting the whole flow.
  setAuthState({
    step: 'error',
    previousStep: 'verifying_email_code',
    message: 'Failed to verify code — try again',
    errorCode: AUTH_ERROR_CODES.EMAIL_VERIFY_FAILED,
    clientSessionId,
    email,
  });
}
