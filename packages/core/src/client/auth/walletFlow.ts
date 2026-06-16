import { abortError } from '../../lib/abort';
import { AUTH_ERROR_CODES } from '../../types';
import { WalletId } from '../../wallets';
import { authenticate } from './authenticate';
import { createAuthSession, FlowDeps } from './deps';
import { logApiError } from './logging';

function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      signal.addEventListener('abort', () => reject(abortError()), { once: true });
    }),
  ]);
}

export async function loginWallet(type: WalletId, deps: FlowDeps): Promise<void> {
  const { api, logger, signal, setAuthState } = deps;

  const clientSessionId = await createAuthSession(deps);
  if (!clientSessionId) return;

  let connectedWallet: string;

  try {
    setAuthState({ step: 'connecting_wallet', walletType: type });
    // Wrap the resolver in `withSignal` so `cancelLogin()` exits the await
    // even if the consumer's resolver is hung (broken extension bridge,
    // network call, etc). The resolver itself may keep running in the
    // background — the 5s `walletResolverTimeoutMs` in `_resolveWalletAdapter`
    // bounds that — but the flow won't block waiting for it.
    const adapter = await withSignal(deps.resolveWalletAdapter(type), signal);

    const available = await withSignal(adapter.isAvailable(), signal);
    if (!available) {
      setAuthState({ step: 'wallet_not_installed', walletType: type });
      return;
    }

    const { address } = await withSignal(adapter.connect(), signal);
    connectedWallet = address;
    deps.storeWalletAdapter(adapter, type);
    setAuthState({ step: 'authenticating_wallet' });

    const body = { clientSessionId, walletAddress: address };
    const { data: walletData, error: walletError } = await api.POST('/auth/wallet', { body, signal });

    if (walletError || !walletData?.success) {
      if (!walletError) logApiError(logger, 'POST /auth/wallet', { body, data: walletData });
      setAuthState({
        step: 'error',
        previousStep: 'authenticating_wallet',
        message: 'Wallet authentication failed',
        errorCode: AUTH_ERROR_CODES.WALLET_AUTH_FAILED,
      });
      return;
    }
  } catch (err) {
    logApiError(logger, 'wallet connect', { error: err });
    setAuthState({
      step: 'error',
      previousStep: 'connecting_wallet',
      message: 'Wallet connection failed',
      errorCode: AUTH_ERROR_CODES.WALLET_CONNECT_FAILED,
    });
    return;
  }

  await authenticate(clientSessionId, deps, connectedWallet);
}
