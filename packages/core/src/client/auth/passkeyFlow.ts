import { AUTH_ERROR_CODES, PasskeyMode } from '../../types';
import { authenticate } from './authenticate';
import { createAuthSession, FlowDeps } from './deps';

/**
 * "Smart Wallet" auth via passkey (WebAuthn).
 *
 * `mode` is chosen by the caller's button: `'login'` for a returning user
 * (`/auth/passkey/login`) and `'register'` for a brand-new wallet
 * (`/auth/passkey/register`, which also deploys the C-address server-side).
 *
 * 1. Create the auth session.
 * 2. Ask the server for a challenge bound to that session.
 * 3. Run the device ceremony (injected `deps.passkey`) in `mode`.
 * 4. Post the result to the matching endpoint.
 * 5. Hand off to `authenticate()` for the READY → `/auth/login` token exchange.
 */
export async function smartWalletFlow(deps: FlowDeps, mode: PasskeyMode): Promise<void> {
  const { api, signal, setAuthState, passkey } = deps;

  if (!passkey) {
    setAuthState({
      step: 'error',
      previousStep: 'creating_session',
      message: 'Passkey support is not configured',
      errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
    });
    return;
  }

  const clientSessionId = await createAuthSession(deps);
  if (!clientSessionId) return;

  try {
    // 1. Server challenge.
    const { data: challengeData } = await api.POST('/auth/passkey/challenge', {
      body: { clientSessionId },
      signal,
    });
    const challenge = challengeData?.content?.challenge;
    if (!challengeData?.success || !challenge) {
      return failPasskey(setAuthState, 'Failed to start passkey');
    }

    // 2. Device ceremony (Touch ID / biometric) — runtime-injected.
    setAuthState({ step: 'creating_passkey' });
    const ceremony = await passkey({ challenge, mode });
    // openapi-fetch types the WebAuthn payload as a loose object; the browser
    // PublicKeyCredential JSON satisfies it.
    const response = ceremony.response as { [key: string]: unknown };

    // 3. New user → register (deploys the C-address); returning → login.
    if (ceremony.kind === 'register') {
      setAuthState({ step: 'deploying_smart_account' });
      const { data } = await api.POST('/auth/passkey/register', {
        body: { clientSessionId, response },
        signal,
      });
      if (!data?.success) return failPasskey(setAuthState, 'Passkey registration failed');
    } else {
      const { data } = await api.POST('/auth/passkey/login', {
        body: { clientSessionId, response },
        signal,
      });
      if (!data?.success) return failPasskey(setAuthState, 'Passkey authentication failed');
    }
  } catch {
    return failPasskey(setAuthState, 'Passkey login failed');
  }

  // 4. Session is READY → exchange for DPoP-bound tokens.
  await authenticate(clientSessionId, deps);
}

function failPasskey(setAuthState: FlowDeps['setAuthState'], message: string): void {
  setAuthState({ step: 'error', previousStep: 'creating_passkey', message, errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED });
}
