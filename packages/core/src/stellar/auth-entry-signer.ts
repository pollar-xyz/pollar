import { stellarAccountBytes } from '../cosign/recognize';
import { base64urlEncode } from '../lib/base64url';
import { base64ToBytes, networkIdOf } from '../cosign/stellar-hash';
import type { SignAuthEntryOutcome } from '../types';

/**
 * A SEP-43 `signAuthEntry` over the user's Pollar wallet: what stellar-sdk's
 * contract client and x402's `ExactStellarScheme` sign Soroban auth with.
 *
 * The two speak different dialects. stellar-sdk hands the signer the entry's
 * `HashIdPreimage` and wants the raw ed25519 signature back; Pollar signs the
 * whole `SorobanAuthorizationEntry`, because the backend checks its invocation
 * tree against the app's allowlist and a hash shows it nothing. The preimage
 * carries everything the entry does but the signer's address, so the entry is
 * rebuilt from it byte for byte, signed, and the signature read back out.
 * A caller that hands an entry directly gets the signed entry back.
 *
 * The XDR is read and written here without a parser library, the same way the
 * co-sign hashes are: only the shapes below, anything else refused.
 */

export interface Sep43AuthEntrySigner {
  /** The wallet's Stellar address; read when the signer is used, so a login after creating it counts. */
  readonly address: string;
  signAuthEntry(
    authEntry: string,
    opts?: { networkPassphrase?: string; address?: string },
  ): Promise<{ signedAuthEntry: string; signerAddress: string }>;
}

export interface AuthEntrySignerOptions {
  /**
   * Where a directly handed entry's signature expires: an absolute ledger. A
   * preimage needs none, since its expiration is part of what is signed.
   */
  validUntilLedger?: () => Promise<number> | number;
}

export interface AuthEntrySignerDeps {
  address: () => string | undefined;
  networkPassphrase: () => string;
  sign: (entryXdr: string, options: { validUntilLedger: number }) => Promise<SignAuthEntryOutcome>;
}

const ENVELOPE_TYPE_SOROBAN_AUTHORIZATION = 9;
const SOROBAN_CREDENTIALS_ADDRESS = 1;
const SC_ADDRESS_TYPE_ACCOUNT = 0;
const PUBLIC_KEY_TYPE_ED25519 = 0;
const SCV_VOID = 1;
const SCV_BYTES = 13;
const SCV_SYMBOL = 15;
const SCV_VEC = 16;
const SCV_MAP = 17;

function u32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) throw new Error('auth entry: unexpected end');
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function u32Bytes(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Standard padded base64, the encoding XDR and SEP-43 travel in. */
function bytesToBase64(bytes: Uint8Array): string {
  const b64 = base64urlEncode(bytes).replace(/-/g, '+').replace(/_/g, '/');
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
}

/** Whether the payload is an ENVELOPE_TYPE_SOROBAN_AUTHORIZATION preimage rather than an entry. */
export function isAuthPreimage(payloadBase64: string): boolean {
  const bytes = base64ToBytes(payloadBase64);
  // An entry starts with its credentials type (0 or 1), never 9.
  return bytes.length > 48 && u32(bytes, 0) === ENVELOPE_TYPE_SOROBAN_AUTHORIZATION;
}

/**
 * The unsigned address-credentials entry a preimage describes, for `account`,
 * with the network id it was built for and the expiration it binds.
 */
export function entryFromAuthPreimage(
  preimageBase64: string,
  account: string,
): { entryXdr: string; networkId: Uint8Array; validUntilLedger: number } {
  const preimage = base64ToBytes(preimageBase64);
  if (preimage.length <= 48 || u32(preimage, 0) !== ENVELOPE_TYPE_SOROBAN_AUTHORIZATION) {
    throw new Error('not a Soroban authorization preimage');
  }
  const accountBytes = stellarAccountBytes(account);
  if (!accountBytes) throw new Error(`${account} is not a Stellar account address`);
  const networkId = preimage.subarray(4, 36);
  // int64 nonce + uint32 signatureExpirationLedger, then the invocation to the end.
  const nonceAndExpiration = preimage.subarray(36, 48);
  const invocation = preimage.subarray(48);
  const entry = concat(
    u32Bytes(SOROBAN_CREDENTIALS_ADDRESS),
    u32Bytes(SC_ADDRESS_TYPE_ACCOUNT),
    u32Bytes(PUBLIC_KEY_TYPE_ED25519),
    accountBytes,
    nonceAndExpiration,
    u32Bytes(SCV_VOID),
    invocation,
  );
  return { entryXdr: bytesToBase64(entry), networkId, validUntilLedger: u32(preimage, 44) };
}

/** A symbol ScVal on the wire: type, length, bytes, padding to 4. */
function readSymbol(bytes: Uint8Array, offset: number): { value: string; next: number } {
  if (u32(bytes, offset) !== SCV_SYMBOL) throw new Error('auth entry: expected a symbol');
  const n = u32(bytes, offset + 4);
  const start = offset + 8;
  if (start + n > bytes.length) throw new Error('auth entry: unexpected end');
  return { value: new TextDecoder().decode(bytes.subarray(start, start + n)), next: start + n + ((4 - (n % 4)) % 4) };
}

/** A bytes ScVal on the wire: type, length, bytes, padding to 4. */
function readBytes(bytes: Uint8Array, offset: number): { value: Uint8Array; next: number } {
  if (u32(bytes, offset) !== SCV_BYTES) throw new Error('auth entry: expected bytes');
  const n = u32(bytes, offset + 4);
  const start = offset + 8;
  if (start + n > bytes.length) throw new Error('auth entry: unexpected end');
  return { value: bytes.subarray(start, start + n), next: start + n + ((4 - (n % 4)) % 4) };
}

/**
 * The account's ed25519 signature out of a signed address-credentials entry
 * and the expiration it signed: the signature is a one-element vec holding the
 * map `{ public_key: bytes(32), signature: bytes(64) }`, the shape
 * stellar-sdk's `authorizeEntry` writes.
 */
export function signatureOfSignedEntry(signedEntryBase64: string): { signature: Uint8Array; validUntilLedger: number } {
  const entry = base64ToBytes(signedEntryBase64);
  if (u32(entry, 0) !== SOROBAN_CREDENTIALS_ADDRESS) throw new Error('the signed entry has no address credentials');
  const addressType = u32(entry, 4);
  // Account: type + key type + 32 bytes. Contract: type + 32 bytes.
  let offset = addressType === SC_ADDRESS_TYPE_ACCOUNT ? 44 : 40;
  const validUntilLedger = u32(entry, offset + 8);
  offset += 12;
  if (u32(entry, offset) !== SCV_VEC || u32(entry, offset + 4) !== 1 || u32(entry, offset + 8) !== 1) {
    throw new Error('the signed entry does not carry one signature');
  }
  offset += 12;
  if (u32(entry, offset) !== SCV_MAP || u32(entry, offset + 4) !== 1) throw new Error('the signature is not a map');
  const count = u32(entry, offset + 8);
  offset += 12;
  let signature: Uint8Array | null = null;
  for (let i = 0; i < count; i++) {
    const key = readSymbol(entry, offset);
    const val = readBytes(entry, key.next);
    if (key.value === 'signature') signature = val.value;
    offset = val.next;
  }
  if (!signature || signature.length !== 64) throw new Error('the signed entry carries no ed25519 signature');
  return { signature, validUntilLedger };
}

function outcomeError(outcome: Exclude<SignAuthEntryOutcome, { status: 'signed' }>): Error {
  if (outcome.status === 'cosign_pending') {
    return new Error(`the co-signed wallet has not approved the auth entry yet (request ${outcome.request.id})`);
  }
  return new Error(`Pollar did not sign the auth entry: ${outcome.code ?? outcome.details ?? 'unknown error'}`);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function createAuthEntrySigner(deps: AuthEntrySignerDeps, options: AuthEntrySignerOptions = {}): Sep43AuthEntrySigner {
  const address = () => {
    const a = deps.address();
    if (!a) throw new Error('no Pollar wallet is connected: log in before signing');
    return a;
  };
  return {
    get address() {
      return address();
    },
    async signAuthEntry(authEntry, opts) {
      const account = address();
      if (opts?.address && opts.address !== account) {
        throw new Error(`asked to sign for ${opts.address}, but the connected wallet is ${account}`);
      }
      const passphrase = deps.networkPassphrase();
      if (opts?.networkPassphrase && opts.networkPassphrase !== passphrase) {
        throw new Error("the auth entry is for another network than the client's");
      }

      if (isAuthPreimage(authEntry)) {
        const { entryXdr, networkId, validUntilLedger } = entryFromAuthPreimage(authEntry, account);
        if (!sameBytes(networkId, await networkIdOf(passphrase))) {
          throw new Error("the auth entry is for another network than the client's");
        }
        const outcome = await deps.sign(entryXdr, { validUntilLedger });
        if (outcome.status !== 'signed') throw outcomeError(outcome);
        const signed = signatureOfSignedEntry(outcome.signedAuthEntry);
        // The expiration is inside the hash the caller verifies: another one is a signature over something else.
        if (signed.validUntilLedger !== validUntilLedger) {
          throw new Error(`the entry was signed to expire at ledger ${signed.validUntilLedger}, not ${validUntilLedger}`);
        }
        return { signedAuthEntry: bytesToBase64(signed.signature), signerAddress: account };
      }

      if (!options.validUntilLedger) {
        throw new Error('signing an entry (not a preimage) needs the validUntilLedger option on the signer');
      }
      const outcome = await deps.sign(authEntry, { validUntilLedger: await options.validUntilLedger() });
      if (outcome.status !== 'signed') throw outcomeError(outcome);
      return { signedAuthEntry: outcome.signedAuthEntry, signerAddress: account };
    },
  };
}
