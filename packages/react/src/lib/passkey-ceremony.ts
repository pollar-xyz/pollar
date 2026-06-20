import type { PasskeyCeremony, PasskeySigner } from '@pollar/core';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

// hex → base64url, for passing the raw auth digest as the WebAuthn challenge.
function hexToBase64url(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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
 * Browser passkey ceremony for the smart-wallet flow.
 *
 * `mode` is set explicitly by the caller's button, so there's no ambiguous
 * autodetect:
 *   - `'login'`    → `get()` only (returning user — the OS shows the account
 *                    picker for discoverable credentials on this domain). A
 *                    failure here is surfaced as-is; it never falls through to
 *                    registration, so cancelling the prompt can't accidentally
 *                    create a second wallet.
 *   - `'register'` → `create()` only (new user → the server deploys the
 *                    C-address).
 *
 * rpId = the current page's hostname (the customer app's domain), which is what
 * the passkey is bound to — the anti-phishing guarantee.
 */
export const browserPasskeyCeremony: PasskeyCeremony = async ({ challenge, mode }) => {
  const rpId = window.location.hostname;

  if (mode === 'login') {
    const response = await startAuthentication({
      optionsJSON: { challenge, rpId, userVerification: 'required' },
    });
    return { kind: 'login', response };
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

/**
 * Browser passkey signer for smart-wallet transactions. Runs a WebAuthn `get()`
 * whose challenge is the raw auth digest (the on-chain verifier checks
 * clientDataJSON.challenge === base64url(digest)), and returns the public
 * assertion fields (base64url) for the server to assemble into the Soroban auth
 * entry. The secp256r1 key never leaves the device.
 */
export const browserPasskeySigner: PasskeySigner = async ({ credentialId, challenge }) => {
  const rpId = window.location.hostname;
  const { response } = await startAuthentication({
    optionsJSON: {
      challenge: hexToBase64url(challenge),
      rpId,
      allowCredentials: [{ id: credentialId, type: 'public-key' }],
      userVerification: 'required',
    },
  });
  // @simplewebauthn/browser returns these as base64url strings.
  return {
    authenticatorData: response.authenticatorData,
    clientDataJSON: response.clientDataJSON,
    signature: response.signature,
  };
};
