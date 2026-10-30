// Wallet recovery from the device's side: each method builds the Turnkey
// request the server expects, stamped by the credential that may make it, and
// an OTP code never leaves the device in the clear. Run with `npm test` in
// packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha2';
import { CosignRecovery } from '../src/cosign/recovery';
import { base64urlDecode } from '../src/lib/base64url';

const DEVICE = '02' + 'ab'.repeat(32);
const STATE = {
  required: true,
  configured: false,
  subOrgId: 'sub-1',
  endUserId: 'tk-user',
  walletId: 'wallet-1',
  authProxyConfigId: 'cfg-1',
  email: { address: 'user@fixture.invalid', verified: true },
  passkeys: [{ authenticatorId: 'pk0', credentialId: 'cred-0', name: 'phone', createdAt: '' }],
  devices: [],
};
const completed = { status: 200, body: { activity: { status: 'ACTIVITY_STATUS_COMPLETED' } } };
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function harness(extra: { exportBundle?: string; state?: Partial<typeof STATE> } = {}) {
  const relays: Array<{ path: string; body: Record<string, unknown> }> = [];
  const stamped: Array<{ path: string; body: string; stamp: string; stampHeader: string }> = [];
  const proxy: Array<{ path: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
  const crypto: Array<[string, unknown[]]> = [];
  const recovery = new CosignRecovery({
    api: {
      GET: async () => ({ data: { content: { ...STATE, ...extra.state } } }),
      POST: async (_path: string) => ({ data: { content: { id: 'enr-1', expiresAt: 'later' } } }),
    } as never,
    publicKeyHex: async () => DEVICE,
    stamp: async () => 'device-stamp',
    relay: async (path, body) => {
      relays.push({ path, body });
      return path === '/public/v1/submit/export_wallet'
        ? {
            status: 200,
            body: {
              activity: {
                status: 'ACTIVITY_STATUS_COMPLETED',
                result: { exportWalletResult: { exportBundle: extra.exportBundle ?? 'bundle' } },
              },
            },
          }
        : completed;
    },
    relayStamped: async (path, body, stamp, stampHeader) => {
      stamped.push({ path, body, stamp, stampHeader });
      return completed;
    },
    devices: async () =>
      ({
        subOrgId: 'sub-1',
        endUserId: 'tk-user',
        custody: 'SELF_CUSTODY',
        quorumState: 'VERIFIED',
        devices: [],
        enrollments: [{ id: 'enr-1', publicKey: '03' + 'cd'.repeat(32), label: 'Laptop', expiresAt: 'later' }],
      }) as never,
    passkey: {
      create: async () => ({
        credentialId: 'cred-new',
        clientDataJson: 'cdj',
        attestationObject: 'ao',
        transports: ['internal', 'hybrid'],
      }),
      get: async (options) => {
        crypto.push(['webauthn.get', [options]]);
        return { credentialId: 'cred-0', authenticatorData: 'ad', clientDataJson: 'cdj', signature: 'sig' };
      },
    },
    fetch: (async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      proxy.push({ path, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      if (path === '/v1/otp_init_v2') return Response.json({ otpId: 'otp-1', otpEncryptionTargetBundle: 'target' });
      if (path === '/v1/otp_verify_v2') {
        const sessionKey = crypto.find(([n]) => n === 'encryptOtp')![1][2] as string;
        const claims = Buffer.from(JSON.stringify({ id: 'tok-1', public_key: sessionKey })).toString('base64url');
        return Response.json({ verificationToken: `h.${claims}.s` });
      }
      return Response.json({ session: 'jwt' });
    }) as never,
    turnkeyCrypto: async () =>
      ({
        encryptOtpCodeToBundle: async (...args: unknown[]) => {
          crypto.push(['encryptOtp', args]);
          return 'encrypted-code';
        },
        decryptExportBundle: async (params: unknown) => {
          crypto.push(['decryptExport', [params]]);
          return 'abandon abandon about';
        },
      }) as never,
  });
  return { recovery, relays, stamped, proxy, crypto };
}

test('a passkey is registered with its attestation and Turnkey transport names', async () => {
  const { recovery, relays } = harness();
  await recovery.addPasskey({ name: 'iPhone' });
  assert.equal(relays[0]!.path, '/public/v1/submit/create_authenticators');
  const params = relays[0]!.body.parameters as { userId: string; authenticators: Array<Record<string, unknown>> };
  assert.equal(params.userId, 'tk-user');
  const attestation = params.authenticators[0]!.attestation as { transports: string[]; credentialId: string };
  assert.deepEqual(attestation.transports, ['AUTHENTICATOR_TRANSPORT_INTERNAL', 'AUTHENTICATOR_TRANSPORT_HYBRID']);
  assert.equal(attestation.credentialId, 'cred-new');
});

test('an email is confirmed through the Auth Proxy: the code goes encrypted, then the device sets the verified email', async () => {
  const { recovery, relays, proxy, crypto } = harness({ state: { email: { address: null, verified: false } } as never });
  await recovery.startEmail('user@fixture.invalid');
  assert.equal(proxy[0]!.path, '/v1/otp_init_v2');
  assert.equal(proxy[0]!.headers['X-Auth-Proxy-Config-Id'], 'cfg-1');
  assert.deepEqual(proxy[0]!.body, { otpType: 'OTP_TYPE_EMAIL', contact: 'user@fixture.invalid' });
  await recovery.confirmEmail('123456789');
  const [code, target] = crypto.find(([n]) => n === 'encryptOtp')![1] as string[];
  assert.deepEqual([code, target], ['123456789', 'target']);
  assert.deepEqual(proxy[1]!.body, { otpId: 'otp-1', encryptedOtpBundle: 'encrypted-code' });
  assert.ok(!JSON.stringify(proxy).includes('"123456789"'), 'the code never travels in the clear');
  assert.equal(relays[0]!.path, '/public/v1/submit/update_user_email');
  assert.equal((relays[0]!.body.parameters as { verificationToken: string }).verificationToken.split('.')[0], 'h');
});

test('an email recovery logs a session in and that session adds this device, stamping the exact body', async () => {
  const { recovery, stamped, proxy } = harness();
  await recovery.startEmailRecovery();
  await recovery.recoverWithEmailCode('987654321');
  const login = proxy.find((p) => p.path === '/v1/otp_login_v2')!.body as {
    publicKey: string;
    organizationId: string;
    clientSignature: { publicKey: string; message: string; signature: string; scheme: string };
  };
  assert.equal(login.organizationId, 'sub-1');
  const message = JSON.parse(login.clientSignature.message) as { login: { publicKey: string }; tokenId: string; type: string };
  assert.deepEqual(message, { login: { publicKey: login.publicKey }, tokenId: 'tok-1', type: 'USAGE_TYPE_LOGIN' });
  assert.ok(
    p256.verify(
      login.clientSignature.signature,
      sha256(new TextEncoder().encode(login.clientSignature.message)),
      login.publicKey,
    ),
    'the client signature verifies with the session key',
  );

  const add = stamped[0]!;
  assert.equal(add.path, '/public/v1/submit/create_api_keys');
  assert.equal(add.stampHeader, 'X-Stamp');
  const stamp = JSON.parse(Buffer.from(add.stamp, 'base64url').toString()) as { publicKey: string; signature: string };
  assert.equal(stamp.publicKey, login.publicKey, 'the session key stamps the request');
  assert.ok(p256.verify(stamp.signature, sha256(new TextEncoder().encode(add.body)), stamp.publicKey, { format: 'der' }));
  const params = (JSON.parse(add.body) as { parameters: { apiKeys: Array<{ publicKey: string }> } }).parameters;
  assert.equal(params.apiKeys[0]!.publicKey, DEVICE, 'the key added is this device');
});

test('a passkey recovery signs the hex SHA-256 of the exact body and goes out under the WebAuthn header', async () => {
  const { recovery, stamped, crypto } = harness();
  await recovery.recoverWithPasskey();
  const add = stamped[0]!;
  assert.equal(add.stampHeader, 'X-Stamp-WebAuthn');
  const options = crypto.find(([n]) => n === 'webauthn.get')![1][0] as { challenge: string; allowCredentials: string[] };
  assert.deepEqual(options.allowCredentials, ['cred-0']);
  const expected = hex(sha256(new TextEncoder().encode(add.body)));
  assert.equal(new TextDecoder().decode(base64urlDecode(options.challenge)), expected);
  assert.equal((JSON.parse(add.stamp) as { credentialId: string }).credentialId, 'cred-0');
});

test('approving a device adds the key that asked, under its label', async () => {
  const { recovery, relays } = harness();
  await recovery.approveDevice('enr-1');
  const params = relays[0]!.body.parameters as { apiKeys: Array<{ publicKey: string; apiKeyName: string }> };
  assert.equal(relays[0]!.path, '/public/v1/submit/create_api_keys');
  assert.deepEqual(params.apiKeys[0], {
    apiKeyName: 'Laptop',
    publicKey: '03' + 'cd'.repeat(32),
    curveType: 'API_KEY_CURVE_P256',
  });
});

test('an export is encrypted to a key made for it and decrypted here', async () => {
  const { recovery, relays, crypto } = harness();
  const phrase = await recovery.exportWallet();
  assert.equal(phrase, 'abandon abandon about');
  const target = (relays[0]!.body.parameters as { targetPublicKey: string }).targetPublicKey;
  const params = crypto.find(([n]) => n === 'decryptExport')![1][0] as { embeddedKey: string; organizationId: string };
  assert.equal(params.organizationId, 'sub-1');
  assert.equal(
    hex(p256.getPublicKey(Buffer.from(params.embeddedKey, 'hex'), false)),
    target,
    'the bundle is decrypted with the target key',
  );
});

test('the sign-in email the wallet already holds unconfirmed is cleared, then set again with the code', async () => {
  const { recovery, relays } = harness({ state: { email: { address: 'User@Fixture.invalid', verified: false } } as never });
  await recovery.startEmail('user@fixture.invalid');
  await recovery.confirmEmail('123456789');
  assert.deepEqual(
    relays.map((r) => r.body.parameters),
    [
      { userId: 'tk-user', userEmail: '' },
      {
        userId: 'tk-user',
        userEmail: 'user@fixture.invalid',
        verificationToken: (relays[1]!.body.parameters as { verificationToken: string }).verificationToken,
      },
    ],
  );
});

test('an email already confirmed is not set again', async () => {
  const { recovery, relays } = harness();
  await recovery.startEmail('user@fixture.invalid');
  await recovery.confirmEmail('123456789');
  assert.equal(relays.length, 0);
});
