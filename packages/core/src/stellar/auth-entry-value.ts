import { encodeStellarAddress, stellarAccountBytes } from '../cosign/recognize';
import { base64ToBytes, networkIdOf } from '../cosign/stellar-hash';
import { sha256 } from '../lib/sha256';

/**
 * What a Soroban authorization entry moves, read for the signature
 * confirmation: a token `transfer(from, to, amount)` at the root of the
 * invocation, with nothing below it. Any other shape (another function,
 * sub-invocations, a signed entry) is not a transfer the user can be shown a
 * value for, and the confirmation then always asks.
 *
 * Read field by field from the XDR, like the co-sign hashes, without a parser
 * library.
 */

export interface AuthEntryTransfer {
  /** The token contract's 32 raw bytes. */
  contract: Uint8Array;
  /** Where the tokens go: a G- or C-address. */
  to: string;
  /** In the token's smallest unit (7 decimals for a Stellar asset contract). */
  amount: bigint;
}

const SOROBAN_CREDENTIALS_SOURCE_ACCOUNT = 0;
const SOROBAN_CREDENTIALS_ADDRESS = 1;
const SC_ADDRESS_TYPE_ACCOUNT = 0;
const SC_ADDRESS_TYPE_CONTRACT = 1;
const SCV_VOID = 1;
const SCV_I128 = 10;
const SCV_ADDRESS = 18;
const SOROBAN_AUTHORIZED_FUNCTION_TYPE_CONTRACT_FN = 0;
const ENVELOPE_TYPE_CONTRACT_ID = 8;
const CONTRACT_ID_PREIMAGE_FROM_ASSET = 1;

class Reader {
  offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  u32(): number {
    const b = this.bytes;
    const o = this.offset;
    if (o + 4 > b.length) throw new Error('unexpected end');
    this.offset += 4;
    return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
  }

  take(n: number): Uint8Array {
    if (this.offset + n > this.bytes.length) throw new Error('unexpected end');
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  /** An `ScAddress`: the account or contract it names, or null for the other kinds. */
  scAddress(): { kind: 'account' | 'contract'; key: Uint8Array } | null {
    const type = this.u32();
    if (type === SC_ADDRESS_TYPE_ACCOUNT) {
      this.u32(); // PUBLIC_KEY_TYPE_ED25519
      return { kind: 'account', key: this.take(32) };
    }
    if (type === SC_ADDRESS_TYPE_CONTRACT) return { kind: 'contract', key: this.take(32) };
    return null;
  }

  string(): string {
    const n = this.u32();
    const out = new TextDecoder().decode(this.take(n));
    this.take((4 - (n % 4)) % 4);
    return out;
  }

  get done(): boolean {
    return this.offset === this.bytes.length;
  }
}

/** The transfer an unsigned entry authorizes, or null when it authorizes anything else. */
export function authEntryTransfer(entryXdrBase64: string): AuthEntryTransfer | null {
  try {
    const r = new Reader(base64ToBytes(entryXdrBase64));
    const credentials = r.u32();
    if (credentials === SOROBAN_CREDENTIALS_ADDRESS) {
      if (!r.scAddress()) return null;
      r.take(12); // nonce + signatureExpirationLedger
      if (r.u32() !== SCV_VOID) return null;
    } else if (credentials !== SOROBAN_CREDENTIALS_SOURCE_ACCOUNT) {
      return null;
    }
    if (r.u32() !== SOROBAN_AUTHORIZED_FUNCTION_TYPE_CONTRACT_FN) return null;
    const contract = r.scAddress();
    if (contract?.kind !== 'contract') return null;
    if (r.string() !== 'transfer' || r.u32() !== 3) return null;
    if (r.u32() !== SCV_ADDRESS || !r.scAddress()) return null; // from
    if (r.u32() !== SCV_ADDRESS) return null;
    const to = r.scAddress();
    if (!to || r.u32() !== SCV_I128) return null;
    const hi = r.take(8);
    const lo = r.take(8);
    if (r.u32() !== 0 || !r.done) return null; // sub-invocations
    let amount = 0n;
    for (const b of [...hi, ...lo]) amount = (amount << 8n) | BigInt(b);
    if (hi[0]! & 0x80) return null; // negative
    return { contract: contract.key, to: encodeStellarAddress(to.kind, to.key), amount };
  } catch {
    return null;
  }
}

function assetXdr(asset: string): Uint8Array | null {
  if (asset === 'native') return Uint8Array.of(0, 0, 0, 0);
  const [code, issuer] = asset.split(':');
  const issuerBytes = issuer ? stellarAccountBytes(issuer) : null;
  if (!code || !issuerBytes || !/^[A-Za-z0-9]{1,12}$/.test(code)) return null;
  const width = code.length <= 4 ? 4 : 12;
  const out = new Uint8Array(4 + width + 4 + 32);
  out.set([0, 0, 0, width === 4 ? 1 : 2], 0);
  out.set(new TextEncoder().encode(code), 4);
  out.set(issuerBytes, 4 + width + 4); // the PUBLIC_KEY_TYPE_ED25519 discriminant before it is 0
  return out;
}

/**
 * The contract id of a Stellar asset's contract (SAC) on a network: sha256 of
 * the `ENVELOPE_TYPE_CONTRACT_ID` preimage built from the asset. `asset` is
 * `'native'` or `CODE:ISSUER`, the way the USD prices name it.
 */
export async function stellarAssetContractId(asset: string, passphrase: string): Promise<Uint8Array | null> {
  const xdrAsset = assetXdr(asset);
  if (!xdrAsset) return null;
  const preimage = new Uint8Array(4 + 32 + 4 + xdrAsset.length);
  preimage.set([0, 0, 0, ENVELOPE_TYPE_CONTRACT_ID], 0);
  preimage.set(await networkIdOf(passphrase), 4);
  preimage.set([0, 0, 0, CONTRACT_ID_PREIMAGE_FROM_ASSET], 36);
  preimage.set(xdrAsset, 40);
  return sha256(preimage);
}

/** A token amount in its smallest unit as a decimal string, 7 decimals. */
export function formatStroops(amount: bigint): string {
  const whole = amount / 10_000_000n;
  const fraction = (amount % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
