import type { CosignRequest } from '../types';
import { transactionBodyOf } from './stellar-hash';

/**
 * Which co-sign requests are setup of the wallet the device holds the key for
 * (its account creation, a trustline, an account on a new chain), read from
 * the transaction itself, so an app can present them as setup without trusting
 * the server's label: a payment cannot pass as a trustline. Every request still
 * needs the user's vote. The XDR is read here without a parser library, the
 * same way the transaction hash is: field by field, and any shape this reader
 * does not know is "not recognized", never guessed.
 */

export type SetupRecognition =
  | { ok: true; kind: 'account_create' | 'change_trust' | 'add_accounts' }
  | { ok: false; reason: string };

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STRKEY_ACCOUNT_VERSION = 6 << 3;
const STRKEY_CONTRACT_VERSION = 2 << 3;

function crc16xmodem(bytes: number[]): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** A G-address (`account`) or C-address (`contract`) from its 32 raw bytes. */
export function encodeStellarAddress(kind: 'account' | 'contract', key: Uint8Array): string {
  const payload = [kind === 'account' ? STRKEY_ACCOUNT_VERSION : STRKEY_CONTRACT_VERSION, ...key];
  const crc = crc16xmodem(payload);
  const bytes = [...payload, crc & 0xff, (crc >>> 8) & 0xff];
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** The 32 raw bytes of a Stellar G-address, or null when the string is not one (version byte and checksum checked). */
export function stellarAccountBytes(address: string): Uint8Array | null {
  if (!/^G[A-Z2-7]{55}$/.test(address)) return null;
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of address) {
    value = ((value << 5) | BASE32.indexOf(ch)) & 0x1fff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (out.length !== 35 || out[0] !== STRKEY_ACCOUNT_VERSION) return null;
  const crc = crc16xmodem(out.slice(0, 33));
  if ((crc & 0xff) !== out[33] || ((crc >>> 8) & 0xff) !== out[34]) return null;
  return Uint8Array.from(out.slice(1, 33));
}

class XdrReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  u32(): number {
    const b = this.bytes;
    const o = this.offset;
    if (o + 4 > b.length) throw new Error('xdr: unexpected end');
    this.offset += 4;
    return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
  }

  skip(n: number): void {
    if (this.offset + n > this.bytes.length) throw new Error('xdr: unexpected end');
    this.offset += n;
  }

  take(n: number): Uint8Array {
    if (this.offset + n > this.bytes.length) throw new Error('xdr: unexpected end');
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  /** A variable-length opaque or string: 4-byte length, bytes, padding to 4. */
  opaque(): Uint8Array {
    const n = this.u32();
    const out = this.take(n);
    this.skip((4 - (n % 4)) % 4);
    return out;
  }

  /** `PublicKey`: only ed25519 exists. */
  accountId(): Uint8Array {
    if (this.u32() !== 0) throw new Error('xdr: unknown public key type');
    return this.take(32);
  }

  /** `MuxedAccount`: a plain ed25519 key, or an id-prefixed one. */
  muxedAccount(): Uint8Array {
    const type = this.u32();
    if (type === 0) return this.take(32);
    if (type === 0x100) {
      this.skip(8);
      return this.take(32);
    }
    throw new Error('xdr: unknown muxed account type');
  }
}

const OP_CREATE_ACCOUNT = 0;
const OP_CHANGE_TRUST = 6;
const OP_BEGIN_SPONSORING = 16;
const OP_END_SPONSORING = 17;

interface ParsedOp {
  type: number;
  source: Uint8Array | null;
  destination?: Uint8Array;
  sponsored?: Uint8Array;
}

/** The source and operations of a v1 transaction envelope; throws on anything this reader does not know. */
function parseTransaction(envelopeXdrBase64: string): { source: Uint8Array; ops: ParsedOp[] } {
  const r = new XdrReader(transactionBodyOf(envelopeXdrBase64));
  const source = r.muxedAccount();
  r.u32(); // fee
  r.skip(8); // sequence number
  const cond = r.u32();
  if (cond === 1) r.skip(16);
  else if (cond === 2) {
    if (r.u32() === 1) r.skip(16); // time bounds
    if (r.u32() === 1) r.skip(8); // ledger bounds
    if (r.u32() === 1) r.skip(8); // min sequence number
    r.skip(8); // min sequence age
    r.u32(); // min sequence ledger gap
    const signers = r.u32();
    for (let i = 0; i < signers; i++) {
      const type = r.u32();
      r.take(32);
      if (type === 3) r.opaque();
      else if (type > 3) throw new Error('xdr: unknown signer key type');
    }
  } else if (cond !== 0) throw new Error('xdr: unknown preconditions');
  const memo = r.u32();
  if (memo === 1) r.opaque();
  else if (memo === 2) r.skip(8);
  else if (memo === 3 || memo === 4) r.take(32);
  else if (memo !== 0) throw new Error('xdr: unknown memo type');

  const count = r.u32();
  const ops: ParsedOp[] = [];
  for (let i = 0; i < count; i++) {
    const opSource = r.u32() === 1 ? r.muxedAccount() : null;
    const type = r.u32();
    if (type === OP_CREATE_ACCOUNT) {
      const destination = r.accountId();
      r.skip(8);
      ops.push({ type, source: opSource, destination });
    } else if (type === OP_CHANGE_TRUST) {
      const asset = r.u32();
      if (asset === 1) {
        r.take(4);
        r.accountId();
      } else if (asset === 2) {
        r.take(12);
        r.accountId();
      } else if (asset !== 0) throw new Error('xdr: unsupported change_trust asset');
      r.skip(8);
      ops.push({ type, source: opSource });
    } else if (type === OP_BEGIN_SPONSORING) {
      ops.push({ type, source: opSource, sponsored: r.accountId() });
    } else if (type === OP_END_SPONSORING) {
      ops.push({ type, source: opSource });
    } else {
      throw new Error(`xdr: operation type ${type} is not a setup operation`);
    }
  }
  return { source, ops };
}

function same(a: Uint8Array | null | undefined, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Whether a request Pollar opened on its own is setup of this wallet: the
 * wallet's own Stellar account creation, a trustline on it (both possibly
 * sponsored, so wrapped in begin/end sponsoring operations whose sponsored
 * account is this one), or an account derived for a chain the app enabled
 * later. Every operation must be one of those and name this account.
 */
export function recognizedSetupRequest(request: CosignRequest): SetupRecognition {
  if (request.status !== 'PENDING') return { ok: false, reason: 'not pending' };
  if (request.kind === 'ACCOUNT') {
    return request.intent === 'add_accounts'
      ? { ok: true, kind: 'add_accounts' }
      : { ok: false, reason: 'an account request with an unexpected intent' };
  }
  if (request.network !== 'STELLAR' || request.kind !== 'TX') return { ok: false, reason: 'not a Stellar setup transaction' };
  const setupKind =
    request.intent === 'account_create' || request.operation === 'create_account'
      ? ('account_create' as const)
      : request.operation === 'change_trust'
        ? ('change_trust' as const)
        : null;
  if (!setupKind) return { ok: false, reason: 'not a setup operation' };
  // A wallet that moved from Pollar's custody keeps its own address, and the
  // Turnkey key only signs for it: the setup is checked against the account.
  const me = stellarAccountBytes(request.account ?? request.signWith);
  if (!me) return { ok: false, reason: 'the account is not a Stellar address' };

  let parsed: ReturnType<typeof parseTransaction>;
  try {
    parsed = parseTransaction(request.unsignedPayload);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  let setupOps = 0;
  for (const op of parsed.ops) {
    if (op.type === OP_BEGIN_SPONSORING) {
      if (!same(op.sponsored, me)) return { ok: false, reason: 'sponsoring reserves for another account' };
    } else if (op.type === OP_END_SPONSORING) {
      // Closes the sponsorship; carries nothing to check.
    } else if (op.type === OP_CREATE_ACCOUNT) {
      if (!same(op.destination, me)) return { ok: false, reason: 'creating another account' };
      setupOps++;
    } else {
      if (!same(op.source ?? parsed.source, me)) return { ok: false, reason: 'a trustline on another account' };
      setupOps++;
    }
  }
  if (setupOps === 0) return { ok: false, reason: 'no setup operation in the transaction' };
  return { ok: true, kind: setupKind };
}
