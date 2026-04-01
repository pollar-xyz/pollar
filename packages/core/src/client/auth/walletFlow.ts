import { AUTH_ERROR_CODES } from '../../types';
import { AlbedoAdapter, FreighterAdapter, WalletType } from '../../wallets';
import { authenticate } from './authenticate';
import { createAuthSession, FlowDeps } from './deps';

function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }),
  ]);
}

export async function loginWallet(type: WalletType, deps: FlowDeps): Promise<void> {
  const { api, signal, setAuthState } = deps;

  const clientSessionId = await createAuthSession(deps);
  if (!clientSessionId) return;

  let connectedWallet: string;

  try {
    setAuthState({ step: 'connecting_wallet', walletType: type });
    const adapter = type === WalletType.FREIGHTER ? new FreighterAdapter() : new AlbedoAdapter();

    const available = await withSignal(adapter.isAvailable(), signal);
    if (!available) {
      setAuthState({ step: 'wallet_not_installed', walletType: type });
      return;
    }

    const { publicKey } = await withSignal(adapter.connect(), signal);
    connectedWallet = publicKey;
    deps.storeWalletAdapter(adapter, type);
    setAuthState({ step: 'authenticating_wallet' });

    const { data: walletData, error: walletError } = await api.POST('/auth/wallet', {
      body: { clientSessionId, walletAddress: publicKey },
      signal,
    });

    if (walletError || !walletData?.success) {
      setAuthState({
        step: 'error',
        previousStep: 'authenticating_wallet',
        message: 'Wallet authentication failed',
        errorCode: AUTH_ERROR_CODES.WALLET_AUTH_FAILED,
      });
      return;
    }
  } catch {
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
