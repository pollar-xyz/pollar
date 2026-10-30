import { base64urlDecode } from '../lib/base64url';
import type { RampSignatureAction } from '../types';

/**
 * Who a Stellar ramp transaction spends from, read straight from its XDR so
 * core needs no Stellar library. It reads the envelope up to the operations
 * and each operation's source; a body is skipped only for the operation types
 * a ramp step sends (payments, path payments, trustlines, account creation,
 * data entries), and the last operation's body is never read, so a Soroban
 * call (always alone in its transaction) needs no parsing. Anything else is
 * refused: an unread operation could hide another source.
 */
export interface StellarTransactionSources {
  /** The transaction's source account, as its ed25519 key. */
  source: Uint8Array;
  feeBump: boolean;
  sequenceIsZero: boolean;
  /** Each operation's type and source key; `null` when it uses the transaction's. */
  operations: Array<{ type: number; source: Uint8Array | null }>;
}

const MANAGE_DATA = 10;

class XdrReader {
  private offset = 0;
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private need(n: number) {
    if (this.offset + n > this.bytes.length) throw new Error('truncated XDR');
  }
  u32(): number {
    this.need(4);
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }
  bool(): boolean {
    const value = this.u32();
    if (value > 1) throw new Error('bad XDR bool');
    return value === 1;
  }
  bytes32(): Uint8Array {
    this.need(32);
    const out = this.bytes.slice(this.offset, this.offset + 32);
    this.offset += 32;
    return out;
  }
  isZero(n: number): boolean {
    this.need(n);
    const zero = this.bytes.subarray(this.offset, this.offset + n).every((byte) => byte === 0);
    this.offset += n;
    return zero;
  }
  skip(n: number) {
    this.need(n);
    this.offset += n;
  }
  /** opaque<max> or string<max>: a length, the bytes, padding to four. */
  variable(max: number) {
    const length = this.u32();
    if (length > max) throw new Error('XDR field too long');
    this.skip(length + ((4 - (length % 4)) % 4));
  }
}

function muxedAccount(r: XdrReader): Uint8Array {
  const type = r.u32();
  if (type === 0) return r.bytes32();
  if (type === 0x100) {
    r.skip(8);
    return r.bytes32();
  }
  throw new Error('unknown account type');
}

function accountId(r: XdrReader) {
  if (r.u32() !== 0) throw new Error('unknown public key type');
  r.skip(32);
}

function asset(r: XdrReader) {
  const type = r.u32();
  if (type === 0) return;
  if (type === 1 || type === 2) {
    r.skip(type === 1 ? 4 : 12);
    accountId(r);
    return;
  }
  throw new Error('unknown asset type');
}

function assetPath(r: XdrReader) {
  const length = r.u32();
  if (length > 5) throw new Error('path too long');
  for (let i = 0; i < length; i++) asset(r);
}

function preconditions(r: XdrReader) {
  const type = r.u32();
  if (type === 0) return;
  if (type === 1) return r.skip(16);
  if (type !== 2) throw new Error('unknown preconditions');
  if (r.bool()) r.skip(16); // time bounds
  if (r.bool()) r.skip(8); // ledger bounds
  if (r.bool()) r.skip(8); // minimum sequence number
  r.skip(8 + 4); // minimum sequence age and ledger gap
  const signers = r.u32();
  if (signers > 2) throw new Error('too many extra signers');
  for (let i = 0; i < signers; i++) {
    const type = r.u32();
    if (type > 3) throw new Error('unknown signer key');
    r.skip(32);
    if (type === 3) r.variable(64);
  }
}

function memo(r: XdrReader) {
  const type = r.u32();
  if (type === 0) return;
  if (type === 1) return r.variable(28);
  if (type === 2) return r.skip(8);
  if (type === 3 || type === 4) return r.skip(32);
  throw new Error('unknown memo type');
}

/** Skips an operation body; only the types a ramp step sends are known. */
function skipBody(r: XdrReader, type: number) {
  switch (type) {
    case 0: // create account
      accountId(r);
      return r.skip(8);
    case 1: // payment
      muxedAccount(r);
      asset(r);
      return r.skip(8);
    case 2: // path payment strict receive
    case 13: // path payment strict send
      asset(r);
      r.skip(8);
      muxedAccount(r);
      asset(r);
      r.skip(8);
      return assetPath(r);
    case 6: {
      // change trust
      const line = r.u32();
      if (line === 3) {
        if (r.u32() !== 0) throw new Error('unknown pool type');
        asset(r);
        asset(r);
        r.skip(4);
      } else if (line === 1 || line === 2) {
        r.skip(line === 1 ? 4 : 12);
        accountId(r);
      } else if (line !== 0) throw new Error('unknown trust line asset');
      return r.skip(8);
    }
    case MANAGE_DATA:
      r.variable(64);
      if (r.bool()) r.variable(64);
      return;
    default:
      throw new Error(`operation type ${type} is not one a ramp step sends`);
  }
}

function operations(r: XdrReader): StellarTransactionSources['operations'] {
  const count = r.u32();
  if (count === 0 || count > 100) throw new Error('bad operation count');
  const read: StellarTransactionSources['operations'] = [];
  for (let i = 0; i < count; i++) {
    const source = r.bool() ? muxedAccount(r) : null;
    const type = r.u32();
    read.push({ type, source });
    if (i < count - 1) skipBody(r, type);
  }
  return read;
}

/** The sources of a base64 transaction envelope (v0, v1 or a fee bump around a v1). Throws on anything it cannot read. */
export function readStellarTransactionSources(envelope: string): StellarTransactionSources {
  const r = new XdrReader(base64urlDecode(envelope.trim().replace(/\+/g, '-').replace(/\//g, '_')));
  let type = r.u32();
  let feeBump = false;
  if (type === 5) {
    feeBump = true;
    muxedAccount(r); // the fee payer
    r.skip(8);
    type = r.u32();
    if (type !== 2) throw new Error('fee bump around a non-v1 transaction');
  }
  if (type === 2) {
    const source = muxedAccount(r);
    r.skip(4);
    const sequenceIsZero = r.isZero(8);
    preconditions(r);
    memo(r);
    return { source, feeBump, sequenceIsZero, operations: operations(r) };
  }
  if (type === 0) {
    const source = r.bytes32();
    r.skip(4);
    const sequenceIsZero = r.isZero(8);
    if (r.bool()) r.skip(16);
    memo(r);
    return { source, feeBump, sequenceIsZero, operations: operations(r) };
  }
  throw new Error('unknown envelope type');
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** CRC16-XModem, the checksum of a Stellar strkey. */
function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** The ed25519 key of a G... account address; throws on anything else or a bad checksum. */
export function stellarAccountKey(address: string): Uint8Array {
  if (!/^G[A-Z2-7]{55}$/.test(address)) throw new Error('not a Stellar account address');
  const out = new Uint8Array(35);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const char of address) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out[index++] = (value >> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  const crc = crc16(out.subarray(0, 33));
  if (out[0] !== 6 << 3 || out[33] !== (crc & 0xff) || out[34] !== crc >> 8) throw new Error('bad Stellar address');
  return out.slice(1, 33);
}

const sameKey = (a: Uint8Array | null, b: Uint8Array) => !!a && a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * Throws unless the Stellar ramp action spends only from `address`: every
 * operation of a payment or contract call runs as that account (inside a fee
 * bump the app adds, too). A SEP-10 login (`summary: 'authentication'`) is the
 * anchor's challenge instead: sequence zero, no fee bump, data entries only, the
 * first one from `address` and the rest from the anchor. Call it before the
 * wallet is asked to sign.
 */
export function assertRampStellarSigner(action: RampSignatureAction, address: string): void {
  const fail = () => new Error('This step is not for the connected Stellar account. Reconnect the wallet it was built for.');
  let account: Uint8Array;
  let tx: StellarTransactionSources;
  try {
    account = stellarAccountKey(address);
    tx = readStellarTransactionSources(action.payload.value);
  } catch {
    throw fail();
  }
  if (action.summary === 'authentication') {
    const [first, ...rest] = tx.operations;
    if (
      tx.feeBump ||
      !tx.sequenceIsZero ||
      first?.type !== MANAGE_DATA ||
      !sameKey(first.source, account) ||
      rest.some((op) => op.type !== MANAGE_DATA || (op.source !== null && !sameKey(op.source, tx.source)))
    )
      throw fail();
    return;
  }
  if (!sameKey(tx.source, account) || tx.operations.some((op) => !sameKey(op.source ?? tx.source, account))) throw fail();
}
