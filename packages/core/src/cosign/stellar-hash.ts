import { sha256 } from '../lib/sha256';
import { base64urlDecode } from '../lib/base64url';

/**
 * The hash a Stellar account signs, computed from an unsigned (or sponsor-signed)
 * transaction envelope without a full XDR parser: sha256(networkId || envelope
 * type || transaction body). The envelope is the type discriminant, the body,
 * then the signatures array; only the array has to be peeled off.
 *
 * Covers ENVELOPE_TYPE_TX (the only envelope Pollar co-signs). A fee bump or a
 * v0 envelope is refused rather than hashed wrong.
 */

const ENVELOPE_TYPE_TX = 2;
/** DecoratedSignature on the wire: 4-byte hint + 4-byte length + 64-byte ed25519 signature. */
const DECORATED_SIGNATURE_BYTES = 72;

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

export function base64ToBytes(b64: string): Uint8Array {
  // XDR travels as standard base64; reuse the base64url decoder over the mapped alphabet.
  return base64urlDecode(b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
}

/** The transaction body bytes of a v1 envelope, with the signatures array removed. */
export function transactionBodyOf(envelopeXdrBase64: string): Uint8Array {
  const env = base64ToBytes(envelopeXdrBase64);
  if (env.length < 8) throw new Error('envelope too short');
  const type = readUint32(env, 0);
  if (type !== ENVELOPE_TYPE_TX) throw new Error(`unsupported envelope type ${type}; only ENVELOPE_TYPE_TX can be co-signed`);
  // The signatures array ends the envelope: a 4-byte count followed by count
  // decorated signatures. Try every count the length allows and keep the one
  // whose count field agrees and whose signatures are all 64 bytes long.
  for (let count = 0; 4 + 4 + count * DECORATED_SIGNATURE_BYTES <= env.length; count++) {
    const countOffset = env.length - 4 - count * DECORATED_SIGNATURE_BYTES;
    if (readUint32(env, countOffset) !== count) continue;
    let ok = true;
    for (let i = 0; i < count; i++) {
      const sigLenOffset = countOffset + 4 + i * DECORATED_SIGNATURE_BYTES + 4;
      if (readUint32(env, sigLenOffset) !== 64) {
        ok = false;
        break;
      }
    }
    if (ok) return env.subarray(4, countOffset);
  }
  throw new Error('could not locate the signatures array of the envelope');
}

/** sha256 of the network passphrase, as Stellar defines the network id. */
export async function networkIdOf(passphrase: string): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(passphrase));
}

/** Hex of the 32-byte hash the account signs for this envelope on this network. */
export async function stellarTransactionHashHex(envelopeXdrBase64: string, passphrase: string): Promise<string> {
  const body = transactionBodyOf(envelopeXdrBase64);
  const networkId = await networkIdOf(passphrase);
  const preimage = new Uint8Array(32 + 4 + body.length);
  preimage.set(networkId, 0);
  preimage.set([0, 0, 0, ENVELOPE_TYPE_TX], 32);
  preimage.set(body, 36);
  const digest = await sha256(preimage);
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}
