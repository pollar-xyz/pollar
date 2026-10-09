// @pollar smoke test: card secrets reveal, both engines.
//
// Run with `node tests/smoke-card-secrets.cjs` after `npm run build`.
//
// The provider's side is played by Node's own crypto: a real RSA-2048 key
// unwraps the `sessionId` exactly as the issuer would (RSA-OAEP, SHA-1), then
// encrypts a PAN and a CVC with the recovered AES-128 key (GCM, tag appended),
// and the session must open both. The `js` engine is the one React Native
// runs, where there is no WebCrypto; proving it against Node's implementation
// is what makes it trustworthy without a device.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const { createCardSecretsSession, openCardSecrets } = require(
  path.join(__dirname, '..', 'packages', 'core', 'dist', 'index.js'),
);

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

function unwrapSessionKey(sessionId) {
  const plaintext = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
    Buffer.from(sessionId, 'base64'),
  );
  // The wrapped plaintext is the base64 TEXT of the key, per the provider's scheme.
  const key = Buffer.from(plaintext.toString('utf8'), 'base64');
  assert.equal(key.length, 16, 'session key must be AES-128');
  return key;
}

function encryptLikeProvider(key, text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { iv: iv.toString('base64'), data: data.toString('base64') };
}

async function roundTrip(engine) {
  const session = await createCardSecretsSession(publicKeyPem, { engine });
  const key = unwrapSessionKey(session.sessionId);
  const secrets = await openCardSecrets(session, {
    last4: '4242',
    expMonth: '07',
    expYear: '2029',
    encryptedPan: encryptLikeProvider(key, '4242424242424242'),
    encryptedCvc: encryptLikeProvider(key, '123'),
  });
  assert.equal(secrets.pan, '4242424242424242', `${engine}: pan`);
  assert.equal(secrets.cvc, '123', `${engine}: cvc`);
  assert.equal(secrets.last4, '4242');

  // A tampered ciphertext must not decrypt to anything.
  const bad = encryptLikeProvider(key, '4242424242424242');
  const bytes = Buffer.from(bad.data, 'base64');
  bytes[0] ^= 0xff;
  await assert.rejects(session.open({ iv: bad.iv, data: bytes.toString('base64') }), `${engine}: tamper`);

  // Every session wraps a fresh key.
  const other = await createCardSecretsSession(publicKeyPem, { engine });
  assert.notEqual(other.sessionId, session.sessionId, `${engine}: fresh key per session`);
  assert.notDeepEqual(unwrapSessionKey(other.sessionId), key, `${engine}: fresh key per session`);
}

(async () => {
  await roundTrip('js');
  await roundTrip('webcrypto');
  await roundTrip('auto');
  console.log('smoke-card-secrets: ok (js, webcrypto, auto)');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
