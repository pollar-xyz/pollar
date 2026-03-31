import { authenticate } from './authenticate';
import { createAuthSession, FlowDeps } from './deps';

type OAuthDeps = FlowDeps & { basePath: string; apiKey: string };

export async function loginOAuth(provider: 'google' | 'github', deps: OAuthDeps): Promise<void> {
  const { setAuthState, basePath, apiKey } = deps;

  // Must open popup before any await — browsers block popups opened after async calls
  const popup = window.open('about:blank', '_blank');

  const clientSessionId = await createAuthSession(deps);

  if (!clientSessionId) {
    popup?.close();
    return;
  }

  setAuthState({ step: 'opening_oauth', provider });

  const url = new URL(`${basePath}/auth/${provider}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('client_session_id', clientSessionId);
  url.searchParams.set('redirect_uri', window.location.origin);

  if (popup) {
    popup.location.href = url.toString();
  } else {
    window.open(url.toString(), '_blank');
  }

  await authenticate(clientSessionId, deps);
}
