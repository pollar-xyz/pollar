import { AUTH_ERROR_CODES } from '../../types';
import { authenticate } from './authenticate';
import { createAuthSession, FlowDeps } from './deps';

export async function initEmailSession(deps: FlowDeps): Promise<void> {
  const clientSessionId = await createAuthSession(deps);
  if (!clientSessionId) return;
  deps.setAuthState({ step: 'entering_email', clientSessionId });
}

export async function sendEmailCode(email: string, clientSessionId: string, deps: FlowDeps): Promise<void> {
  const { api, signal, setAuthState } = deps;

  setAuthState({ step: 'sending_email', email });

  const { data, error } = await api.POST('/auth/email', {
    body: { clientSessionId, email },
    signal,
  });

  if (error || !data?.success) {
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
  deps: FlowDeps,
): Promise<void> {
  const { api, signal, setAuthState } = deps;

  setAuthState({ step: 'verifying_email_code', clientSessionId, email });

  const { data, error } = await api.POST('/auth/email/verify-code', {
    body: { clientSessionId, code },
    signal,
  });

  if (data?.code === 'SDK_EMAIL_CODE_VERIFIED') {
    await authenticate(clientSessionId, deps);
    return;
  }

  // Extract error code from either the 4xx error body or the 200 body
  const errCode =
    (error as unknown as { error?: string } | undefined)?.error ?? (data as unknown as { code?: string } | undefined)?.code;

  if (errCode === 'SDK_EMAIL_CODE_EXPIRED') {
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

  setAuthState({
    step: 'error',
    previousStep: 'verifying_email_code',
    message: 'Failed to verify code — try again',
    errorCode: AUTH_ERROR_CODES.EMAIL_VERIFY_FAILED,
  });
}
