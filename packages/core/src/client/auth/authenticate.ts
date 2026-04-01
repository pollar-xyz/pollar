import { AUTH_ERROR_CODES } from '../../types';
import { isValidSession } from '../session';
import { streamUntilFound } from '../stream';
import { FlowDeps } from './deps';

export async function authenticate(
  clientSessionId: string,
  deps: FlowDeps,
  expectedWallet?: string,
): Promise<void> {
  const { api, signal, setAuthState, storeSession, clearSession } = deps;

  setAuthState({ step: 'authenticating' });

  await streamUntilFound(api, clientSessionId, (data) => data?.status === 'READY', 200, signal);

  const { data, error } = await api.POST('/auth/login', {
    body: { clientSessionId },
    signal,
  });

  if (data?.code === 'SDK_LOGIN_SUCCESS' && isValidSession(data?.content)) {
    if (expectedWallet && data.content.data.providers.wallet?.address !== expectedWallet) {
      setAuthState({
        step: 'error',
        previousStep: 'authenticating',
        message: 'Wallet mismatch: session wallet does not match connected wallet',
        errorCode: AUTH_ERROR_CODES.WALLET_AUTH_FAILED,
      });
      clearSession();
      return;
    }
    storeSession(data.content);
  } else {
    setAuthState({
      step: 'error',
      previousStep: 'authenticating',
      message: 'Failed to load session',
      errorCode: AUTH_ERROR_CODES.AUTH_FAILED,
    });
    clearSession();
  }
}
