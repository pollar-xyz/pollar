import { authenticate } from './authenticate';
import { createAuthSession, FlowDeps } from './deps';

type OAuthDeps = FlowDeps & { basePath: string; apiKey: string };

/**
 * Break the popup's `window.opener` back-reference so the OAuth window
 * cannot navigate the parent. Best-effort — older browsers expose the
 * property as read-only.
 */
function severOpener(popup: Window | null): void {
  if (!popup) return;
  try {
    popup.opener = null;
  } catch {
    // ignore
  }
}

export async function loginOAuth(provider: 'google' | 'github', deps: OAuthDeps): Promise<void> {
  const { setAuthState, basePath, apiKey } = deps;

  // Must open popup before any await — browsers block popups opened after async calls
  const popup = window.open('about:blank', '_blank');
  severOpener(popup);

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
    severOpener(popup);
  } else {
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }

  await authenticate(clientSessionId, deps);
}
