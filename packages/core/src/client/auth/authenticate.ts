import { AUTH_ERROR_CODES } from '../../types';
import { isValidSession } from '../session';
import { SessionStatusError, waitForSessionReady } from '../stream';
import { FlowDeps } from './deps';
import { logApiError } from './logging';

export async function authenticate(clientSessionId: string, deps: FlowDeps, expectedWallet?: string): Promise<void> {
  const { api, logger, basePath, useStreaming, signal, setAuthState, storeSession, clearSession } = deps;

  setAuthState({ step: 'authenticating' });

  try {
    await waitForSessionReady({
      api,
      baseUrl: basePath,
      clientSessionId,
      check: (data) => data?.status === 'READY',
      useStreaming,
      signal,
      logger,
    });
  } catch (err) {
    // Terminal session-status condition (invalid / expired). Reset to an error
    // state and clear any partial session so the user can start a fresh login.
    // Other errors (AbortError from cancelLogin, etc.) bubble to the flow's
    // generic handler unchanged.
    if (err instanceof SessionStatusError) {
      // App-level terminal session status rides on a 2xx stream, so the central
      // HTTP middleware can't classify it — log it here.
      logApiError(logger, 'session status', { data: err });
      const { message, errorCode } =
        err.code === 'LOGIN_TIMEOUT'
          ? { message: 'Login timed out — please try again', errorCode: AUTH_ERROR_CODES.LOGIN_TIMEOUT }
          : err.code === 'EXPIRED_CLIENT_ID'
            ? { message: 'Login session expired — please try again', errorCode: AUTH_ERROR_CODES.SESSION_EXPIRED }
            : { message: 'Login session is no longer valid — please try again', errorCode: AUTH_ERROR_CODES.SESSION_INVALID };
      setAuthState({ step: 'error', previousStep: 'authenticating', message, errorCode });
      await clearSession();
      return;
    }
    throw err;
  }

  // Pass `dpopJwk` so the server mints DPoP-bound tokens (`cnf.jkt`).
  const dpopJwk = await deps.getPublicJwk();
  // HTTP-level `error` is not handled here; the `else` branch below catches
  // both "request failed" (data === undefined) and "request OK but body
  // wasn't a valid session" via the same generic path.
  const body = {
    clientSessionId,
    dpopJwk,
    ...(deps.deviceLabel ? { deviceLabel: deps.deviceLabel } : {}),
  };
  const { data, error } = await api.POST('/auth/login', { body, signal });

  if (data?.code === 'SDK_LOGIN_SUCCESS' && isValidSession(data?.content, logger)) {
    // `isValidSession` doesn't validate the `data` (PII) subtree, so reach into
    // it defensively — a contract-drifted response missing `data`/`providers`
    // should surface as a clean wallet-mismatch error, not a raw TypeError.
    const sessionWallet = data.content.data?.providers?.wallet?.address;
    if (expectedWallet && sessionWallet !== expectedWallet) {
      setAuthState({
        step: 'error',
        previousStep: 'authenticating',
        message: 'Wallet mismatch: session wallet does not match connected wallet',
        errorCode: AUTH_ERROR_CODES.WALLET_AUTH_FAILED,
      });
      await clearSession();
      return;
    }
    // The login was cancelled (cancelLogin) or superseded by a newer attempt
    // (_newController) while POST /auth/login was in flight — its `signal` is now
    // aborted. Don't resurrect `authenticated` over the idle/new state. (The
    // intervening error/clearSession writes above are intentionally NOT guarded.)
    if (signal.aborted) return;
    await storeSession(data.content);
  } else {
    if (!error) logApiError(logger, 'POST /auth/login', { body, data });
    setAuthState({
      step: 'error',
      previousStep: 'authenticating',
      message: 'Failed to load session',
      errorCode: AUTH_ERROR_CODES.AUTH_FAILED,
    });
    await clearSession();
  }
}
