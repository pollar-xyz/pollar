import type { PasskeyCeremony } from '@pollar/core';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

// WebAuthn user.id must be a base64url string in the JSON options. It is a
// per-credential opaque handle (the authenticator stores it for the account
// picker); the server identifies users by credentialId, not this.
function randomUserId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Browser passkey ceremony for `loginSmartWallet()`.
 *
 * Autodetect: try `get()` first (returning user — the OS shows the account
 * picker for discoverable credentials on this domain). If there's no usable
 * credential it falls through to `create()` (new user → the server then
 * deploys the C-address).
 *
 * Known tradeoff: WebAuthn surfaces "no credential" and "user cancelled" as
 * the same `NotAllowedError`, so cancelling the login prompt falls through to
 * registration and would create a new wallet. A dedicated "create another
 * wallet" action would disambiguate the two.
 *
 * rpId = the current page's hostname (the customer app's domain), which is what
 * the passkey is bound to — the anti-phishing guarantee.
 */
export const browserPasskeyCeremony: PasskeyCeremony = async ({ challenge }) => {
  const rpId = window.location.hostname;

  try {
    const response = await startAuthentication({
      optionsJSON: { challenge, rpId, userVerification: 'required' },
    });
    return { kind: 'login', response };
  } catch {
    // No usable credential (or the user opted out) → register a new passkey.
  }

  const userId = randomUserId();
  const response = await startRegistration({
    optionsJSON: {
      challenge,
      rp: { id: rpId, name: rpId },
      user: { id: userId, name: 'Smart Wallet', displayName: 'Smart Wallet' },
      // ES256 (secp256r1) — the curve the on-chain WebAuthn verifier expects.
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      attestation: 'none',
      timeout: 60_000,
    },
  });
  return { kind: 'register', response };
};
