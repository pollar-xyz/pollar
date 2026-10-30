import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes } from '@noble/hashes/utils';
import type { PollarApiClient } from '../api/client';
import { isRecord, stringField } from '../api/error-fields';
import { base64urlEncode } from '../lib/base64url';
import type {
  CosignDevicesContent,
  CosignRelayContent,
  CosignRelayPath,
  RecoveryPasskeyCeremony,
  RecoveryState,
} from '../types';
import { PollarApiError } from '../types';
import { bytesToHex, encodeStamp, hexToBytes } from './encoding';

/**
 * The ways back into a Turnkey wallet without this device, and the export of
 * its key. A wallet signs nothing but its own setup until one exists (sdk-api
 * answers SDK_WALLET_RECOVERY_REQUIRED). Three methods count: a passkey, a
 * second device, and an email confirmed with an OTP code.
 *
 * OTP codes go through Turnkey's Auth Proxy, straight from the device: Pollar
 * never sees the code. A passkey ceremony is injected by the runtime layer
 * (`@pollar/react` uses the browser's), since core never touches
 * `navigator.credentials` itself.
 */

const AUTH_PROXY_URL = 'https://authproxy.turnkey.com';
const API_KEY_CURVE = 'API_KEY_CURVE_P256';
const SCHEME = 'SIGNATURE_SCHEME_TK_API_P256';

export interface CosignRecoveryDeps {
  api: PollarApiClient;
  /** This device's enrolled key: its public half and an `X-Stamp` over a body. */
  publicKeyHex: () => Promise<string>;
  stamp: (body: string) => Promise<string>;
  /** Forward a Turnkey request this device stamps, through sdk-api. */
  relay: (path: CosignRelayPath, body: Record<string, unknown>) => Promise<CosignRelayContent>;
  /** Forward a body already stamped by another credential (a passkey, an OTP session), byte for byte. */
  relayStamped: (
    path: CosignRelayPath,
    body: string,
    stamp: string,
    stampHeader: 'X-Stamp' | 'X-Stamp-WebAuthn',
  ) => Promise<CosignRelayContent>;
  devices: () => Promise<CosignDevicesContent>;
  passkey?: RecoveryPasskeyCeremony;
  /** Overridable for tests. */
  fetch?: typeof fetch;
  /** Turnkey's crypto helpers, loaded on first use; overridable for tests. */
  turnkeyCrypto?: () => Promise<TurnkeyCrypto>;
}

interface TurnkeyCrypto {
  encryptOtpCodeToBundle: (code: string, targetBundle: string, publicKey: string) => Promise<string>;
  decryptExportBundle: (params: {
    exportBundle: string;
    embeddedKey: string;
    organizationId: string;
    returnMnemonic: boolean;
  }) => Promise<string>;
}

const loadTurnkeyCrypto = async (): Promise<TurnkeyCrypto> => (await import('@turnkey/crypto')) as unknown as TurnkeyCrypto;

/** A throwaway P-256 key: the session an OTP login opens, or the target an export is encrypted to. */
interface EphemeralKey {
  privateKeyHex: string;
  publicKeyHex: string;
  publicKeyUncompressedHex: string;
}

function ephemeralKey(): EphemeralKey {
  const privateKey = p256.utils.randomPrivateKey();
  return {
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(p256.getPublicKey(privateKey, true)),
    publicKeyUncompressedHex: bytesToHex(p256.getPublicKey(privateKey, false)),
  };
}

/** ECDSA P-256 over SHA-256 of the UTF-8 message: `r || s` hex, or the `X-Stamp` an API key makes. */
function signRaw(key: EphemeralKey, message: string): string {
  return p256.sign(sha256(new TextEncoder().encode(message)), hexToBytes(key.privateKeyHex)).toCompactHex();
}
function stampWith(key: EphemeralKey, body: string): string {
  const der = p256.sign(sha256(new TextEncoder().encode(body)), hexToBytes(key.privateKeyHex)).toDERHex();
  return encodeStamp({ publicKey: key.publicKeyHex, scheme: SCHEME, signature: der });
}

/** The claims of an Auth Proxy verification token (a JWT): its id and the key it is bound to. */
function verificationClaims(token: string): { id: string; publicKey: string } {
  const payload = token.split('.')[1];
  if (!payload) throw new PollarApiError('SDK_COSIGN_UPSTREAM_ERROR', { reason: 'malformed verification token' });
  const json = atob(
    payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '='),
  );
  const claims = JSON.parse(json) as { id?: unknown; public_key?: unknown };
  if (typeof claims.id !== 'string' || typeof claims.public_key !== 'string') {
    throw new PollarApiError('SDK_COSIGN_UPSTREAM_ERROR', { reason: 'verification token without id or key' });
  }
  return { id: claims.id, publicKey: claims.public_key };
}

const TRANSPORTS: Record<string, string> = {
  usb: 'AUTHENTICATOR_TRANSPORT_USB',
  nfc: 'AUTHENTICATOR_TRANSPORT_NFC',
  ble: 'AUTHENTICATOR_TRANSPORT_BLE',
  internal: 'AUTHENTICATOR_TRANSPORT_INTERNAL',
  hybrid: 'AUTHENTICATOR_TRANSPORT_HYBRID',
};

/** The challenge a passkey signs for a Turnkey request: the hex SHA-256 of the body, as bytes. */
function webauthnChallenge(body: string): Uint8Array {
  return new TextEncoder().encode(bytesToHex(sha256(new TextEncoder().encode(body))));
}

function relayActivity(result: CosignRelayContent): Record<string, unknown> {
  const activity = isRecord(result.body) && isRecord(result.body.activity) ? result.body.activity : null;
  if (!activity || stringField(activity, 'status') !== 'ACTIVITY_STATUS_COMPLETED') {
    throw new PollarApiError('SDK_COSIGN_UPSTREAM_ERROR', { status: result.status, body: result.body });
  }
  return activity;
}

export class CosignRecovery {
  private deps: CosignRecoveryDeps;
  /** The OTP an email flow is waiting a code for. */
  private otp: { otpId: string; targetBundle: string; email: string; purpose: 'confirm' | 'recover' } | null = null;

  constructor(deps: CosignRecoveryDeps) {
    this.deps = deps;
  }

  /** Install the runtime's passkey ceremony when the client was built without one. */
  setDefaultPasskey(ceremony: RecoveryPasskeyCeremony): void {
    if (!this.deps.passkey) this.deps.passkey = ceremony;
  }

  /** Whether passkey methods can run here (the runtime gave a ceremony). */
  get passkeyAvailable(): boolean {
    return !!this.deps.passkey;
  }

  /** Whether the wallet can be recovered without this device, and the methods it has. */
  async status(): Promise<RecoveryState> {
    const res = await this.deps.api.GET('/cosign/recovery');
    if (res.error || !res.data?.content)
      throw new PollarApiError('SDK_COSIGN_UPSTREAM_ERROR', isRecord(res.error) ? res.error : {});
    return res.data.content;
  }

  private async requireWallet(): Promise<RecoveryState & { subOrgId: string; endUserId: string }> {
    const state = await this.status();
    if (!state.required || !state.subOrgId || !state.endUserId) {
      throw new PollarApiError('SDK_COSIGN_REQUEST_NOT_FOUND', { reason: 'this user has no Turnkey wallet' });
    }
    return state as RecoveryState & { subOrgId: string; endUserId: string };
  }

  private requirePasskey(): RecoveryPasskeyCeremony {
    if (!this.deps.passkey) {
      throw new PollarApiError('SDK_COSIGN_PASSKEY_UNAVAILABLE', {
        reason: 'no passkey ceremony configured on this client (PollarClientConfig.recoveryPasskey)',
      });
    }
    return this.deps.passkey;
  }

  // --- Passkey --------------------------------------------------------------

  /** Register a passkey (synced by the platform, iCloud or Google) as a way back in. */
  async addPasskey(options?: { name?: string }): Promise<RecoveryState> {
    const { subOrgId, endUserId } = await this.requireWallet();
    const challenge = base64urlEncode(randomBytes(32));
    const attestation = await this.requirePasskey().create({ challenge, userName: options?.name ?? 'Pollar wallet' });
    await this.deps
      .relay('/public/v1/submit/create_authenticators', {
        type: 'ACTIVITY_TYPE_CREATE_AUTHENTICATORS_V2',
        timestampMs: String(Date.now()),
        organizationId: subOrgId,
        parameters: {
          userId: endUserId,
          authenticators: [
            {
              authenticatorName: options?.name ?? 'Passkey',
              challenge,
              attestation: {
                credentialId: attestation.credentialId,
                clientDataJson: attestation.clientDataJson,
                attestationObject: attestation.attestationObject,
                transports: attestation.transports.map((t) => TRANSPORTS[t]).filter((t): t is string => !!t),
              },
            },
          ],
        },
      })
      .then(relayActivity);
    return this.status();
  }

  async removePasskey(authenticatorId: string): Promise<RecoveryState> {
    const { subOrgId, endUserId } = await this.requireWallet();
    await this.deps
      .relay('/public/v1/submit/delete_authenticators', {
        type: 'ACTIVITY_TYPE_DELETE_AUTHENTICATORS',
        timestampMs: String(Date.now()),
        organizationId: subOrgId,
        parameters: { userId: endUserId, authenticatorIds: [authenticatorId] },
      })
      .then(relayActivity);
    return this.status();
  }

  /**
   * On a device that lost access: one of the user's passkeys adds this device's
   * key to their Turnkey user. The user is signed in to the app here, but this
   * device is not one of their credentials yet.
   */
  async recoverWithPasskey(): Promise<RecoveryState> {
    const { subOrgId, endUserId, passkeys } = await this.requireWallet();
    if (passkeys.length === 0)
      throw new PollarApiError('SDK_WALLET_RECOVERY_REQUIRED', { reason: 'no passkey to recover with' });
    const body = JSON.stringify(await this.addThisDeviceBody(subOrgId, endUserId, 'Recovered with a passkey'));
    const assertion = await this.requirePasskey().get({
      challenge: base64urlEncode(webauthnChallenge(body)),
      allowCredentials: passkeys.map((p) => p.credentialId),
    });
    const stamp = JSON.stringify({
      authenticatorData: assertion.authenticatorData,
      clientDataJson: assertion.clientDataJson,
      credentialId: assertion.credentialId,
      signature: assertion.signature,
    });
    await this.relayStamped('/public/v1/submit/create_api_keys', body, stamp, 'X-Stamp-WebAuthn');
    return this.status();
  }

  // --- Email OTP (Turnkey Auth Proxy) ---------------------------------------

  private async authProxy<T>(configId: string, path: string, body: Record<string, unknown>): Promise<T> {
    const doFetch = this.deps.fetch ?? fetch;
    const res = await doFetch(`${AUTH_PROXY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Proxy-Config-Id': configId },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) {
      throw new PollarApiError('SDK_COSIGN_TURNKEY_REJECTED', {
        turnkeyStatus: res.status,
        message: stringField(json, 'message') ?? `Turnkey's Auth Proxy answered ${res.status}`,
      });
    }
    return json as T;
  }

  private async sendCode(email: string, purpose: 'confirm' | 'recover'): Promise<void> {
    const { authProxyConfigId } = await this.requireWallet();
    if (!authProxyConfigId) throw new PollarApiError('SDK_COSIGN_NOT_CONFIGURED', { reason: 'no Auth Proxy config' });
    const init = await this.authProxy<{ otpId: string; otpEncryptionTargetBundle: string }>(
      authProxyConfigId,
      '/v1/otp_init_v2',
      { otpType: 'OTP_TYPE_EMAIL', contact: email },
    );
    this.otp = { otpId: init.otpId, targetBundle: init.otpEncryptionTargetBundle, email, purpose };
  }

  /** Verify the code Turnkey emailed; the token is bound to `key`, which the caller holds. */
  private async verifyCode(code: string, key: EphemeralKey, purpose: 'confirm' | 'recover'): Promise<string> {
    const otp = this.otp;
    if (!otp || otp.purpose !== purpose)
      throw new PollarApiError('SDK_COSIGN_REQUEST_NOT_FOUND', { reason: 'no code was sent' });
    const { authProxyConfigId } = await this.requireWallet();
    const { encryptOtpCodeToBundle } = await (this.deps.turnkeyCrypto ?? loadTurnkeyCrypto)();
    const encryptedOtpBundle = await encryptOtpCodeToBundle(code, otp.targetBundle, key.publicKeyHex);
    const { verificationToken } = await this.authProxy<{ verificationToken: string }>(authProxyConfigId!, '/v1/otp_verify_v2', {
      otpId: otp.otpId,
      encryptedOtpBundle,
    });
    this.otp = null;
    return verificationToken;
  }

  /** Email a code to confirm `email` as a way back in; {@link confirmEmail} finishes it. */
  async startEmail(email: string): Promise<void> {
    await this.sendCode(email, 'confirm');
  }

  /** Confirm the email with the code Turnkey sent; it counts as a recovery method from now on. */
  async confirmEmail(code: string): Promise<RecoveryState> {
    const email = this.otp?.email;
    const { subOrgId, endUserId, email: current } = await this.requireWallet();
    const verificationToken = await this.verifyCode(code, ephemeralKey(), 'confirm');
    const same = !!email && !!current.address && current.address.toLowerCase() === email.toLowerCase();
    if (same && current.verified) return this.status();
    const updateEmail = (parameters: Record<string, unknown>) =>
      this.deps
        .relay('/public/v1/submit/update_user_email', {
          type: 'ACTIVITY_TYPE_UPDATE_USER_EMAIL',
          timestampMs: String(Date.now()),
          organizationId: subOrgId,
          parameters: { userId: endUserId, ...parameters },
        })
        .then(relayActivity);
    // The wallet may already carry this address unconfirmed (the sign-in email it was
    // created with), and Turnkey refuses to set an email it already holds: it is
    // cleared first, then set with the code's token, which is what confirms it.
    if (same) await updateEmail({ userEmail: '' });
    await updateEmail({ userEmail: email, verificationToken });
    return this.status();
  }

  /** On a device that lost access: email a code to the address the user confirmed. */
  async startEmailRecovery(): Promise<void> {
    const { email } = await this.requireWallet();
    if (!email.address || !email.verified) {
      throw new PollarApiError('SDK_WALLET_RECOVERY_REQUIRED', { reason: 'no confirmed email to recover with' });
    }
    await this.sendCode(email.address, 'recover');
  }

  /**
   * Finish an email recovery: the code logs a short Turnkey session in, and
   * that session adds this device's key to the user's Turnkey user.
   */
  async recoverWithEmailCode(code: string): Promise<RecoveryState> {
    const { subOrgId, endUserId, authProxyConfigId } = await this.requireWallet();
    const session = ephemeralKey();
    const verificationToken = await this.verifyCode(code, session, 'recover');
    const claims = verificationClaims(verificationToken);
    const message = JSON.stringify({
      login: { publicKey: session.publicKeyHex },
      tokenId: claims.id,
      type: 'USAGE_TYPE_LOGIN',
    });
    await this.authProxy(authProxyConfigId!, '/v1/otp_login_v2', {
      verificationToken,
      publicKey: session.publicKeyHex,
      organizationId: subOrgId,
      clientSignature: {
        publicKey: claims.publicKey,
        scheme: 'CLIENT_SIGNATURE_SCHEME_API_P256',
        message,
        signature: signRaw(session, message),
      },
    });
    const body = JSON.stringify(await this.addThisDeviceBody(subOrgId, endUserId, 'Recovered by email'));
    await this.relayStamped('/public/v1/submit/create_api_keys', body, stampWith(session, body), 'X-Stamp');
    return this.status();
  }

  // --- Second device --------------------------------------------------------

  /** On the new device: ask one of the user's enrolled devices to add this one. */
  async requestDeviceEnrollment(label?: string): Promise<{ id: string; expiresAt: string }> {
    const res = await this.deps.api.POST('/cosign/devices/enrollments', {
      body: { publicKey: await this.deps.publicKeyHex(), ...(label ? { label } : {}) },
    });
    if (res.error || !res.data?.content)
      throw new PollarApiError('SDK_COSIGN_UPSTREAM_ERROR', isRecord(res.error) ? res.error : {});
    return res.data.content as { id: string; expiresAt: string };
  }

  /** On an enrolled device: add the device that asked to join, by its request id. */
  async approveDevice(enrollmentId: string): Promise<CosignDevicesContent> {
    const current = await this.deps.devices();
    const enrollment = current.enrollments.find((e) => e.id === enrollmentId);
    if (!enrollment || !current.subOrgId || !current.endUserId) {
      throw new PollarApiError('SDK_COSIGN_REQUEST_NOT_FOUND', { enrollmentId });
    }
    await this.deps
      .relay('/public/v1/submit/create_api_keys', {
        type: 'ACTIVITY_TYPE_CREATE_API_KEYS_V2',
        timestampMs: String(Date.now()),
        organizationId: current.subOrgId,
        parameters: {
          userId: current.endUserId,
          apiKeys: [
            { apiKeyName: enrollment.label ?? 'Second device', publicKey: enrollment.publicKey, curveType: API_KEY_CURVE },
          ],
        },
      })
      .then(relayActivity);
    return this.deps.devices();
  }

  async rejectDevice(enrollmentId: string): Promise<void> {
    const res = await this.deps.api.POST('/cosign/devices/enrollments/{id}/reject', { params: { path: { id: enrollmentId } } });
    if (res.error) throw new PollarApiError('SDK_COSIGN_REQUEST_NOT_FOUND', isRecord(res.error) ? res.error : {});
  }

  // --- Export ---------------------------------------------------------------

  /**
   * The wallet's recovery phrase, decrypted on this device. Turnkey encrypts it
   * to a key that exists only here for this call; nothing readable crosses
   * sdk-api. Whoever holds the phrase controls every account of the wallet.
   */
  async exportWallet(): Promise<string> {
    const { subOrgId, walletId } = await this.requireWallet();
    if (!walletId) throw new PollarApiError('SDK_COSIGN_REQUEST_NOT_FOUND', { reason: 'no wallet to export' });
    const target = ephemeralKey();
    const result = await this.deps.relay('/public/v1/submit/export_wallet', {
      type: 'ACTIVITY_TYPE_EXPORT_WALLET',
      timestampMs: String(Date.now()),
      organizationId: subOrgId,
      parameters: { walletId, targetPublicKey: target.publicKeyUncompressedHex },
    });
    const activity = relayActivity(result);
    const exportBundle = stringField(
      isRecord(activity.result) ? activity.result.exportWalletResult : undefined,
      'exportBundle',
    );
    if (!exportBundle) throw new PollarApiError('SDK_COSIGN_UPSTREAM_ERROR', { reason: 'the export carried no bundle' });
    const { decryptExportBundle } = await (this.deps.turnkeyCrypto ?? loadTurnkeyCrypto)();
    return decryptExportBundle({
      exportBundle,
      embeddedKey: target.privateKeyHex,
      organizationId: subOrgId,
      returnMnemonic: true,
    });
  }

  // --- Helpers --------------------------------------------------------------

  private async addThisDeviceBody(subOrgId: string, endUserId: string, name: string) {
    return {
      type: 'ACTIVITY_TYPE_CREATE_API_KEYS_V2',
      timestampMs: String(Date.now()),
      organizationId: subOrgId,
      parameters: {
        userId: endUserId,
        apiKeys: [{ apiKeyName: name, publicKey: await this.deps.publicKeyHex(), curveType: API_KEY_CURVE }],
      },
    };
  }

  private async relayStamped(
    path: CosignRelayPath,
    body: string,
    stamp: string,
    stampHeader: 'X-Stamp' | 'X-Stamp-WebAuthn',
  ): Promise<void> {
    relayActivity(await this.deps.relayStamped(path, body, stamp, stampHeader));
  }
}
