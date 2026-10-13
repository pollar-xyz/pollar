// RSA-OAEP encryption (RFC 8017 section 7.1.1) with SHA-1 and MGF1-SHA1, in
// plain JavaScript on BigInt. Used where WebCrypto is missing (React Native):
// the only operation needed is wrapping a short session key with a provider's
// public key, so a full RSA library would be weight for nothing. Encrypt-only:
// no private keys ever exist on the device.

import { sha1 } from '@noble/hashes/sha1';
import { randomBytes } from '@noble/hashes/utils';

const H_LEN = 20;

interface RsaPublicKey {
  n: bigint;
  e: bigint;
  /** Modulus length in bytes (k). */
  k: number;
}

/** One DER element: its tag, and where its content starts and ends. */
function derElement(der: Uint8Array, at: number): { tag: number; start: number; end: number } {
  const tag = der[at]!;
  let len = der[at + 1]!;
  let p = at + 2;
  if (len & 0x80) {
    const bytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < bytes; i++) len = (len << 8) | der[p++]!;
  }
  return { tag, start: p, end: p + len };
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

function bigIntToBytes(v: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/**
 * Read `n` and `e` out of a SubjectPublicKeyInfo (the body of a
 * `-----BEGIN PUBLIC KEY-----` block): SEQUENCE { AlgorithmIdentifier,
 * BIT STRING { SEQUENCE { INTEGER n, INTEGER e } } }.
 */
export function parseRsaSpki(der: Uint8Array): RsaPublicKey {
  const spki = derElement(der, 0);
  const algorithm = derElement(der, spki.start);
  const bitString = derElement(der, algorithm.end);
  if (spki.tag !== 0x30 || bitString.tag !== 0x03) throw new Error('Not a SubjectPublicKeyInfo');
  // The BIT STRING starts with the count of unused bits, always 0 here.
  const rsaKey = derElement(der, bitString.start + 1);
  const nEl = derElement(der, rsaKey.start);
  const eEl = derElement(der, nEl.end);
  if (rsaKey.tag !== 0x30 || nEl.tag !== 0x02 || eEl.tag !== 0x02) throw new Error('Not an RSA public key');
  // A leading 0x00 only keeps the INTEGER positive; it is not part of the modulus.
  let nStart = nEl.start;
  while (nStart < nEl.end - 1 && der[nStart] === 0) nStart++;
  const nBytes = der.subarray(nStart, nEl.end);
  return { n: bytesToBigInt(nBytes), e: bytesToBigInt(der.subarray(eEl.start, eEl.end)), k: nBytes.length };
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/** MGF1 with SHA-1: the mask the OAEP padding is built from. */
function mgf1(seed: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  const counter = new Uint8Array(4);
  const input = new Uint8Array(seed.length + 4);
  input.set(seed);
  for (let i = 0, filled = 0; filled < length; i++) {
    counter[0] = (i >>> 24) & 0xff;
    counter[1] = (i >>> 16) & 0xff;
    counter[2] = (i >>> 8) & 0xff;
    counter[3] = i & 0xff;
    input.set(counter, seed.length);
    const block = sha1(input);
    const take = Math.min(H_LEN, length - filled);
    out.set(block.subarray(0, take), filled);
    filled += take;
  }
  return out;
}

/** Encrypt `message` for the given SPKI public key. Empty label, as the providers expect. */
export function rsaOaepSha1Encrypt(spkiDer: Uint8Array, message: Uint8Array): Uint8Array {
  const { n, e, k } = parseRsaSpki(spkiDer);
  if (message.length > k - 2 * H_LEN - 2) throw new Error('Message too long for RSA-OAEP');

  // DB = lHash || PS || 0x01 || M, with lHash = SHA-1 of the empty label.
  const db = new Uint8Array(k - H_LEN - 1);
  db.set(sha1(new Uint8Array(0)));
  db[db.length - message.length - 1] = 0x01;
  db.set(message, db.length - message.length);

  const seed = randomBytes(H_LEN);
  const dbMask = mgf1(seed, db.length);
  for (let i = 0; i < db.length; i++) db[i]! ^= dbMask[i]!;
  const seedMask = mgf1(db, H_LEN);
  for (let i = 0; i < H_LEN; i++) seed[i]! ^= seedMask[i]!;

  const em = new Uint8Array(k);
  em.set(seed, 1);
  em.set(db, 1 + H_LEN);
  return bigIntToBytes(modPow(bytesToBigInt(em), e, n), k);
}
