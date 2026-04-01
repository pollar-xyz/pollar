import { PollarApiClient } from '../../api/client';
import { AUTH_ERROR_CODES, AuthState, PollarApplicationConfigContent } from '../../types';
import { WalletAdapter, WalletType } from '../../wallets';

export type FlowDeps = {
  api: PollarApiClient;
  signal: AbortSignal;
  setAuthState: (state: AuthState) => void;
  storeSession: (session: PollarApplicationConfigContent) => void;
  clearSession: () => void;
  storeWalletAdapter: (adapter: WalletAdapter, type: WalletType) => void;
};

export async function createAuthSession(deps: FlowDeps): Promise<string | null> {
  const { api, signal, setAuthState } = deps;

  setAuthState({ step: 'creating_session' });

  const { data, error } = await api.POST('/auth/session', { signal });

  if (error || !data?.success) {
    setAuthState({
      step: 'error',
      previousStep: 'creating_session',
      message: 'Failed to create session',
      errorCode: AUTH_ERROR_CODES.SESSION_CREATE_FAILED,
    });
    return null;
  }

  return data.content.clientSessionId;
}
