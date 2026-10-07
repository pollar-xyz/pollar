// Card number reveal, end to end encrypted (Coral's scheme). The device makes a
// one-shot AES-128 key, wraps it with the provider's RSA public key into a
// `sessionId`, and decrypts the PAN and CVC the provider encrypted with that
// key. The key never leaves this function; the server only relays ciphertext.
//
// WebCrypto only. React Native has no `crypto.subtle`, so the reveal is a web
// feature until an RSA-OAEP implementation is picked for RN.

import type { EncryptedCardSecrets } from '../api/endpoints/cards';

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Card secrets need WebCrypto, which this runtime does not provide');
  return s;
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

export interface CardSecretsSession {
  /** Wrapped key for `POST /cards/:id/secrets`. */
  sessionId: string;
  /** Decrypts one `{ iv, data }` from the provider's answer. */
  open(value: { iv: string; data: string }): Promise<string>;
}

/** Make the one-shot session key and wrap it with the provider's public key (RSA-OAEP, SHA-1). */
export async function createCardSecretsSession(publicKeyPem: string): Promise<CardSecretsSession> {
  const crypto = subtle();
  const rawKey = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const aesKey = await crypto.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const rsaKey = await crypto.importKey('spki', pemToDer(publicKeyPem), { name: 'RSA-OAEP', hash: 'SHA-1' }, false, [
    'encrypt',
  ]);
  // The provider expects the base64 text of the key as the RSA plaintext, not the raw bytes.
  const wrapped = await crypto.encrypt({ name: 'RSA-OAEP' }, rsaKey, new TextEncoder().encode(b64encode(rawKey)));
  rawKey.fill(0);
  return {
    sessionId: b64encode(new Uint8Array(wrapped)),
    async open(value) {
      const plain = await crypto.decrypt(
        { name: 'AES-GCM', iv: b64decode(value.iv), tagLength: 128 },
        aesKey,
        b64decode(value.data),
      );
      return new TextDecoder().decode(plain);
    },
  };
}

/** Decrypt both values of a provider answer with the session that produced its `sessionId`. */
export async function openCardSecrets(session: CardSecretsSession, encrypted: EncryptedCardSecrets) {
  const [pan, cvc] = await Promise.all([session.open(encrypted.encryptedPan), session.open(encrypted.encryptedCvc)]);
  return { pan, cvc, last4: encrypted.last4, expMonth: encrypted.expMonth, expYear: encrypted.expYear };
}
