import { PollarApiClient } from '../../api/client';
import { AuthState, PollarApplicationConfigContent } from '../../types';

export type FlowDeps = {
  api: PollarApiClient;
  signal: AbortSignal;
  setAuthState: (state: AuthState) => void;
  storeSession: (session: PollarApplicationConfigContent) => void;
  clearSession: () => void;
};