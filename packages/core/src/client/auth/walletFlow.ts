import { abortError } from '../../lib/abort';
import { AUTH_ERROR_CODES } from '../../types';
import { WalletId } from '../../wallets';
import { authenticate } from './authenticate';
import { createAuthSession, FlowDeps } from './deps';
import { logApiError } from './logging';
import { isValidSep10Challenge } from './sep10-challenge';

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
 * Request a SEP-10 challenge transaction (XDR) for `walletAddress`, bound to the
 * client session. The wallet counter-signs it to prove key control. Returns
 * `null` on failure. Shared by the built-in wallet flow and custom providers
 * (via `AuthProviderContext.requestChallenge`).
 */
export async function requestWalletChallenge(
  clientSessionId: string,
  walletAddress: string,
  deps: FlowDeps,
): Promise<string | null> {
  const { api, logger, signal } = deps;
  const body = { clientSessionId, walletAddress };
  const { data, error } = await api.POST('/auth/wallet/challenge', { body, signal });
  if (error || !data?.success) {
    if (!error) logApiError(logger, 'POST /auth/wallet/challenge', { body, data });
    return null;
  }
  const challengeXdr = data.content.challengeXdr;
  // Defense-in-depth before ANY consumer hands this to a real wallet to sign —
  // the built-in flow AND custom providers (via `ctx.requestChallenge`). Refuse
  // anything that isn't a real SEP-10 challenge (e.g. a live, submittable tx with
  // sequence != 0 from a compromised/MITM'd challenge endpoint). The server's
  // verifyChallengeTxSigners is still authoritative; this blocks the worst case.
  if (!isValidSep10Challenge(challengeXdr)) {
    logApiError(logger, 'SEP-10 challenge validation', { error: 'unexpected challenge structure (sequence != 0?)' });
    return null;
  }
  return challengeXdr;
}

export async function loginWallet(type: WalletId, deps: FlowDeps): Promise<void> {
  const { api, logger, signal, setAuthState } = deps;

  const clientSessionId = await createAuthSession(deps);
  if (!clientSessionId) return;

  let connectedWallet: string;
  // Track the phase so the catch reports where the failure ACTUALLY happened
  // (connect vs sign vs the /auth/wallet call) instead of always blaming
  // 'connecting_wallet'.
  let currentStep: 'connecting_wallet' | 'signing_wallet_challenge' | 'authenticating_wallet' = 'connecting_wallet';

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

    // SEP-10 challenge-response: prove control of the wallet key. Get a
    // server-signed challenge tx, have the wallet counter-sign it, and send the
    // signed XDR to /auth/wallet.
    currentStep = 'signing_wallet_challenge';
    setAuthState({ step: 'signing_wallet_challenge', walletType: type });
    // requestWalletChallenge now runs the SEP-10 validation internally (so custom
    // providers get it too) and returns null on a missing OR malformed challenge.
    const challengeXdr = await requestWalletChallenge(clientSessionId, address, deps);
    if (!challengeXdr) {
      setAuthState({
        step: 'error',
        previousStep: 'signing_wallet_challenge',
        message: 'Failed to obtain a valid wallet challenge',
        errorCode: AUTH_ERROR_CODES.WALLET_AUTH_FAILED,
      });
      return;
    }
    const { signedTxXdr } = await withSignal(
      adapter.signTransaction(challengeXdr, { networkPassphrase: deps.networkPassphrase }),
      signal,
    );

    currentStep = 'authenticating_wallet';
    setAuthState({ step: 'authenticating_wallet' });

    const body = { clientSessionId, walletAddress: address, signedChallengeXdr: signedTxXdr };
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

    // Key control is proven — NOW persist the adapter (and its walletType).
    // Storing it at connect time left a dangling adapter + walletType row with
    // NO session whenever any step above failed; doing it here means a failure
    // never strands one. If the `authenticate()` call below fails, it runs
    // `clearSession()` which clears the adapter again.
    await deps.storeWalletAdapter(adapter, type);
  } catch (err) {
    // A cancel (cancelLogin / destroy / new login) aborts the signal → withSignal
    // rejects with an AbortError. Rethrow it so the flow's handler maps it to
    // `idle`, instead of mislabeling a user cancel as WALLET_CONNECT_FAILED.
    // (Mirrors how the other flows let AbortError propagate.)
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    logApiError(logger, 'wallet connect', { error: err });
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
