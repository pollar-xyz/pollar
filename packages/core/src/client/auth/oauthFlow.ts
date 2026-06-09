import type { AuthUrlOpener } from '../../types';
import { authenticate } from './authenticate';
import { createAuthSession, FlowDeps } from './deps';

type OAuthDeps = FlowDeps & {
  basePath: string;
  apiKey: string;
  /** Platform strategy for surfacing the hosted-OAuth URL (popup on web, in-app browser on RN). */
  openAuthUrl: AuthUrlOpener;
  /** Sent to the backend as `redirect_uri`; where the provider returns the user afterwards. */
  redirectUri: string;
};

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

/**
 * Default web opener: reserve a blank popup synchronously (before any await)
 * so popup blockers — which only honor `window.open` inside the original
 * user-gesture tick — don't swallow it, then navigate it to the OAuth URL.
 *
 * React Native consumers replace this via `PollarClientConfig.openAuthUrl`
 * (typically wrapping `expo-web-browser`'s `openAuthSessionAsync`).
 */
export const defaultWebOAuthOpener: AuthUrlOpener = async ({ getUrl }) => {
  const popup = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;
  severOpener(popup);

  const url = await getUrl();
  if (!url) {
    popup?.close();
    return;
  }

  if (popup) {
    popup.location.href = url;
    severOpener(popup);
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

export async function loginOAuth(provider: 'google' | 'github', deps: OAuthDeps): Promise<void> {
  const { setAuthState, basePath, apiKey, openAuthUrl, redirectUri, signal } = deps;

  // The auth session is minted lazily inside `getUrl` so the web opener can
  // reserve its popup window *before* this async call runs. We capture the
  // resulting id here so `authenticate` can poll it once the opener returns.
  let clientSessionId: string | null = null;
  const getUrl = async (): Promise<string | null> => {
    clientSessionId = await createAuthSession(deps);
    if (!clientSessionId) return null;

    setAuthState({ step: 'opening_oauth', provider });

    const url = new URL(`${basePath}/auth/${provider}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('client_session_id', clientSessionId);
    url.searchParams.set('redirect_uri', redirectUri);
    return url.toString();
  };

  await openAuthUrl({ provider, getUrl, redirectUri, signal });

  // Opener never called `getUrl`, or session creation failed — nothing to poll.
  if (!clientSessionId) return;

  await authenticate(clientSessionId, deps);
}
