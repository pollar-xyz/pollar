import { PollarApiClient } from '../../api/client';
import type { PublicEcJwk } from '../../keys/types';
import { AUTH_ERROR_CODES, AuthState, PollarApplicationConfigContent } from '../../types';
import { WalletAdapter, WalletId } from '../../wallets';

export type FlowDeps = {
  api: PollarApiClient;
  signal: AbortSignal;
  setAuthState: (state: AuthState) => void;
  storeSession: (session: PollarApplicationConfigContent) => void | Promise<void>;
  clearSession: () => void | Promise<void>;
  /**
   * Resolves a wallet adapter for the requested id. Uses the consumer's
   * injected `walletAdapter` resolver when present and falls back to the
   * built-in Freighter/Albedo adapters otherwise.
   */
  resolveWalletAdapter: (id: WalletId) => Promise<WalletAdapter>;
  storeWalletAdapter: (adapter: WalletAdapter, id: WalletId) => void | Promise<void>;
  /**
   * Returns the public JWK of the SDK's per-session DPoP keypair. Auth
   * completion calls (`/auth/login`) pass it as `dpopJwk` so the server
   * can mint DPoP-bound tokens (`cnf.jkt`).
   */
  getPublicJwk: () => Promise<PublicEcJwk>;
  /**
   * Optional UI label persisted on the server-side refresh-token row so the
   * sessions UI can show "iPhone — Safari" instead of a raw user-agent.
   */
  deviceLabel?: string;
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
