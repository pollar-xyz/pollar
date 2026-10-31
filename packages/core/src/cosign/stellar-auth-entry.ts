import { sha256 } from '../lib/sha256';
import { stellarAccountBytes } from './recognize';
import { base64ToBytes, networkIdOf } from './stellar-hash';

/**
 * The hash a Stellar account signs to authorize a Soroban call
 * (`SorobanAuthorizationEntry`), computed from the entry without a full XDR
 * parser: sha256 of the ENVELOPE_TYPE_SOROBAN_AUTHORIZATION preimage, which is
 * the network id, the credentials' nonce and expiration, and the root
 * invocation exactly as the entry carries it.
 *
 * Read field by field, and only the shape a co-signed account signs: address
 * credentials for that same ed25519 account, not yet signed. Anything else is
 * refused rather than hashed.
 */

const SOROBAN_CREDENTIALS_ADDRESS = 1;
const SC_ADDRESS_TYPE_ACCOUNT = 0;
const PUBLIC_KEY_TYPE_ED25519 = 0;
const SCV_VOID = 1;
const ENVELOPE_TYPE_SOROBAN_AUTHORIZATION = 9;

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) throw new Error('auth entry: unexpected end');
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

/** Hex of the 32-byte hash `account` signs for this unsigned entry on this network. */
export async function stellarAuthEntryHashHex(entryXdrBase64: string, passphrase: string, account: string): Promise<string> {
  const entry = base64ToBytes(entryXdrBase64);
  let offset = 0;
  if (readUint32(entry, offset) !== SOROBAN_CREDENTIALS_ADDRESS) throw new Error('only address credentials can be co-signed');
  offset += 4;
  if (readUint32(entry, offset) !== SC_ADDRESS_TYPE_ACCOUNT || readUint32(entry, offset + 4) !== PUBLIC_KEY_TYPE_ED25519) {
    throw new Error('the entry does not authorize a Stellar account');
  }
  offset += 8;
  const expected = stellarAccountBytes(account);
  const authorized = entry.subarray(offset, offset + 32);
  if (!expected || authorized.length !== 32 || authorized.some((b, i) => b !== expected[i])) {
    throw new Error('the entry authorizes another account');
  }
  offset += 32;
  // int64 nonce, then uint32 signatureExpirationLedger: copied into the preimage as they are.
  const nonceAndExpiration = entry.subarray(offset, offset + 12);
  if (nonceAndExpiration.length !== 12) throw new Error('auth entry: unexpected end');
  offset += 12;
  if (readUint32(entry, offset) !== SCV_VOID) throw new Error('the entry already carries a signature');
  offset += 4;
  // The root invocation ends the entry; the preimage carries the same bytes.
  const invocation = entry.subarray(offset);
  if (invocation.length === 0) throw new Error('auth entry: no invocation');

  const networkId = await networkIdOf(passphrase);
  const preimage = new Uint8Array(4 + 32 + 12 + invocation.length);
  preimage.set([0, 0, 0, ENVELOPE_TYPE_SOROBAN_AUTHORIZATION], 0);
  preimage.set(networkId, 4);
  preimage.set(nonceAndExpiration, 36);
  preimage.set(invocation, 48);
  const digest = await sha256(preimage);
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}
