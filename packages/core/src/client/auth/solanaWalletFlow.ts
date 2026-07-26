import { abortError } from '../../lib/abort';
import { base64urlEncode } from '../../lib/base64url';
import { AUTH_ERROR_CODES } from '../../types';
import { WalletAdapter } from '../../wallets';
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

/**
 * Sign In With Solana (SIWS) login for a `chain: 'SOLANA'` adapter — the Solana
 * counterpart of {@link loginWithAdapter} (which is SEP-10, Stellar). Solana has no
 * challenge TRANSACTION (its signature binds an expiring blockhash), so the server
 * issues a SIWS INPUT, the wallet signs the rendered message (`solana:signIn`), and
 * the server verifies the ed25519 signature. Both endpoints
 * (`/auth/wallet/solana/challenge` and `/auth/wallet/solana`) are part of the typed
 * openapi paths, so the shared api client is used directly (it runs the DPoP / auth
 * / retry middleware on both).
 */
export async function loginWithSolanaAdapter(adapter: WalletAdapter, deps: FlowDeps): Promise<void> {
  const { api, logger, signal, setAuthState } = deps;
  const type = adapter.type;

  let connectedWallet: string;
  let clientSessionId: string;
  let currentStep: 'connecting_wallet' | 'signing_wallet_challenge' | 'authenticating_wallet' = 'connecting_wallet';

  try {
    setAuthState({ step: 'connecting_wallet', walletType: type });

    const available = await withSignal(adapter.isAvailable(), signal);
    if (!available) {
      setAuthState({ step: 'wallet_not_installed', walletType: type });
      return;
    }

    // Phase 1 requires native SIWS (`solana:signIn`). A `signMessage`-only fallback
    // (build the SIWS message text ourselves) is a planned follow-up.
    if (!adapter.signIn) {
      logApiError(logger, 'solana login', { error: `adapter "${type}" has no signIn (SIWS) capability` });
      setAuthState({
        step: 'error',
        previousStep: 'connecting_wallet',
        message: 'Wallet does not support Sign In With Solana',
        errorCode: AUTH_ERROR_CODES.WALLET_CONNECT_FAILED,
      });
      return;
    }

    const sid = await createAuthSession(deps);
    if (!sid) return;
    clientSessionId = sid;

    const { address } = await withSignal(adapter.connect(), signal);
    connectedWallet = address;

    currentStep = 'signing_wallet_challenge';
    setAuthState({ step: 'signing_wallet_challenge', walletType: type });

    // 1. Ask the server for a SIWS input bound to this session.
    const challengeRes = await api.POST('/auth/wallet/solana/challenge', {
      body: { clientSessionId, walletAddress: address },
      signal,
    });
    const input = challengeRes.data?.content?.input;
    if (challengeRes.error || !challengeRes.data?.success || !input) {
      if (!challengeRes.error) logApiError(logger, 'POST /auth/wallet/solana/challenge', { data: challengeRes.data });
      setAuthState({
        step: 'error',
        previousStep: 'signing_wallet_challenge',
        message: 'Failed to obtain a Solana sign-in challenge',
        errorCode: AUTH_ERROR_CODES.WALLET_AUTH_FAILED,
      });
      return;
    }

    // 2. The wallet renders + signs the SIWS message.
    const output = await withSignal(adapter.signIn(input), signal);

    currentStep = 'authenticating_wallet';
    setAuthState({ step: 'authenticating_wallet' });

    // 3. Send the signed message + signature (base64url) for ed25519 verification.
    const authRes = await api.POST('/auth/wallet/solana', {
      body: {
        clientSessionId,
        walletAddress: address,
        signedMessage: base64urlEncode(output.signedMessage),
        signature: base64urlEncode(output.signature),
      },
      signal,
    });
    if (authRes.error || !authRes.data?.success) {
      if (!authRes.error) logApiError(logger, 'POST /auth/wallet/solana', { data: authRes.data });
      setAuthState({
        step: 'error',
        previousStep: 'authenticating_wallet',
        message: 'Solana wallet authentication failed',
        errorCode: AUTH_ERROR_CODES.WALLET_AUTH_FAILED,
      });
      return;
    }

    // Key control is proven — persist the adapter (and its walletType) now, so a
    // failure above never strands one (mirrors the Stellar flow).
    await deps.storeWalletAdapter(adapter, type);
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    logApiError(logger, `solana wallet connect (${currentStep})`, { error: err });
    setAuthState({
      step: 'error',
      previousStep: currentStep,
      message: 'Wallet connection failed',
      errorCode: AUTH_ERROR_CODES.WALLET_CONNECT_FAILED,
    });
    return;
  }

  await authenticate(clientSessionId, deps, connectedWallet);
}
