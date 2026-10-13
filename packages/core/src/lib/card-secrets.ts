// Card number reveal, end to end encrypted (Coral's scheme). The device makes a
// one-shot AES-128 key, wraps it with the provider's RSA public key into a
// `sessionId`, and decrypts the PAN and CVC the provider encrypted with that
// key. The key never leaves this module; the server only relays ciphertext.
//
// Two engines, same output: WebCrypto where the runtime has it (browsers,
// Node), and plain JavaScript (`rsa-oaep.ts` + @noble/ciphers) on React Native,
// which has no `crypto.subtle`.

import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/hashes/utils';
import type { EncryptedCardSecrets } from '../api/endpoints/cards';
import { rsaOaepSha1Encrypt } from './rsa-oaep';

export type CardSecretsEngine = 'auto' | 'webcrypto' | 'js';

export interface CardSecretsSession {
  /** Wrapped key for `POST /cards/:id/secrets`. */
  sessionId: string;
  /** Decrypts one `{ iv, data }` from the provider's answer. */
  open(value: { iv: string; data: string }): Promise<string>;
}

function b64encode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  return b64decode(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''));
}

async function webCryptoSession(publicKeyPem: string, subtle: SubtleCrypto): Promise<CardSecretsSession> {
  const rawKey = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const aesKey = await subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const rsaKey = await subtle.importKey('spki', pemToDer(publicKeyPem), { name: 'RSA-OAEP', hash: 'SHA-1' }, false, [
    'encrypt',
  ]);
  // The provider expects the base64 text of the key as the RSA plaintext, not the raw bytes.
  const wrapped = await subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, new TextEncoder().encode(b64encode(rawKey)));
  rawKey.fill(0);
  return {
    sessionId: b64encode(new Uint8Array(wrapped)),
    async open(value) {
      const plain = await subtle.decrypt(
        { name: 'AES-GCM', iv: b64decode(value.iv), tagLength: 128 },
        aesKey,
        b64decode(value.data),
      );
      return new TextDecoder().decode(plain);
    },
  };
}

function jsSession(publicKeyPem: string): CardSecretsSession {
  const rawKey = randomBytes(16);
  const wrapped = rsaOaepSha1Encrypt(pemToDer(publicKeyPem), new TextEncoder().encode(b64encode(rawKey)));
  return {
    sessionId: b64encode(wrapped),
    async open(value) {
      // noble's GCM takes ciphertext with the 16-byte tag appended, which is how the provider sends it.
      const plain = gcm(rawKey, b64decode(value.iv)).decrypt(b64decode(value.data));
      return new TextDecoder().decode(plain);
    },
  };
}

/**
 * Make the one-shot session key and wrap it with the provider's public key
 * (RSA-OAEP, SHA-1). `engine` is for tests; `auto` picks WebCrypto when present.
 */
export async function createCardSecretsSession(
  publicKeyPem: string,
  options: { engine?: CardSecretsEngine } = {},
): Promise<CardSecretsSession> {
  const engine = options.engine ?? 'auto';
  const subtle = globalThis.crypto?.subtle;
  if (engine === 'webcrypto' || (engine === 'auto' && subtle)) {
    if (!subtle) throw new Error('Card secrets need WebCrypto, which this runtime does not provide');
    return webCryptoSession(publicKeyPem, subtle);
  }
  return jsSession(publicKeyPem);
}

/** Decrypt both values of a provider answer with the session that produced its `sessionId`. */
export async function openCardSecrets(session: CardSecretsSession, encrypted: EncryptedCardSecrets) {
  const [pan, cvc] = await Promise.all([session.open(encrypted.encryptedPan), session.open(encrypted.encryptedCvc)]);
  return { pan, cvc, last4: encrypted.last4, expMonth: encrypted.expMonth, expYear: encrypted.expYear };
}
