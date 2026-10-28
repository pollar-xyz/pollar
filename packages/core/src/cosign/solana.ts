import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from './encoding';

/**
 * The device's own reading of a Solana co-sign request: the unsigned
 * transaction decoded by hand (Solana's wire format, no Solana library), and
 * the CCTP burn or the SOL / SPL transfer it carries checked against what the
 * request says it is. A shape this reader does not know is "not recognized",
 * never guessed, and is not approved.
 */

/** Circle's CCTP V2 TokenMessengerMinter: the program a ramp's burn calls. */
export const TOKEN_MESSENGER_MINTER_V2 = 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe';
const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const MEMO_PROGRAMS = new Set(['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo']);
/** SystemProgram's Transfer, a little-endian u32 discriminator. */
const SYSTEM_TRANSFER = 2;
/** SPL Token's TransferChecked, a one-byte discriminator. */
const TOKEN_TRANSFER_CHECKED = 12;
/** sha256("global:deposit_for_burn")[0..8], from Circle's V2 IDL. */
const DEPOSIT_FOR_BURN = 'd73c3d2e723780b0';
/** Positions in deposit_for_burn's account list (the IDL's order). */
const OWNER = 0;
const EVENT_RENT_PAYER = 1;

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** A 32-byte public key as its base58 address. */
export function base58Of(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = BASE58[Number(n % 58n)]! + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

/** A base58 address as its 32 bytes; throws on anything that is not one. */
export function base58Decode(address: string): Uint8Array {
  let n = 0n;
  for (const ch of address) {
    const digit = BASE58.indexOf(ch);
    if (digit < 0) throw new Error('solana: not a base58 address');
    n = n * 58n + BigInt(digit);
  }
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  if (n !== 0n || base58Of(out) !== address) throw new Error('solana: not a 32-byte address');
  return out;
}

/**
 * The associated token account of `owner` for `mint` under the SPL Token
 * program: the program-derived address of [owner, token program, mint], found
 * the way the runtime does (highest bump whose hash is off the ed25519 curve).
 */
export function associatedTokenAddress(owner: string, mint: string): string {
  const seeds = [base58Decode(owner), base58Decode(TOKEN_PROGRAM), base58Decode(mint)];
  const program = base58Decode(ASSOCIATED_TOKEN_PROGRAM);
  const marker = new TextEncoder().encode('ProgramDerivedAddress');
  for (let bump = 255; bump >= 0; bump--) {
    const input = new Uint8Array(32 * 4 + 1 + marker.length);
    seeds.forEach((seed, i) => input.set(seed, 32 * i));
    input[96] = bump;
    input.set(program, 97);
    input.set(marker, 129);
    const candidate = sha256(input);
    try {
      ed25519.Point.fromHex(candidate);
    } catch {
      return base58Of(candidate);
    }
  }
  throw new Error('solana: no associated token address');
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  u8(): number {
    if (this.offset >= this.bytes.length) throw new Error('solana: unexpected end');
    return this.bytes[this.offset++]!;
  }

  /** Solana's compact-u16 (shortvec) length. */
  compactU16(): number {
    let value = 0;
    for (let shift = 0; shift < 21; shift += 7) {
      const byte = this.u8();
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error('solana: compact-u16 too long');
  }

  take(n: number): Uint8Array {
    if (this.offset + n > this.bytes.length) throw new Error('solana: unexpected end');
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  get done(): boolean {
    return this.offset === this.bytes.length;
  }
}

export interface DecodedSolanaInstruction {
  program: string;
  accounts: string[];
  data: Uint8Array;
}

export interface DecodedSolanaTransaction {
  /** The fee payer: the first account key. */
  feePayer: string;
  /** Signatures the message requires; each costs the base fee. */
  requiredSignatures: number;
  instructions: DecodedSolanaInstruction[];
}

/** A serialized (unsigned) legacy or v0 transaction. Address lookup tables are refused. */
export function decodeSolanaTransaction(hex: string): DecodedSolanaTransaction {
  const r = new Reader(hexToBytes(hex.replace(/^0x/i, '')));
  const signatures = r.compactU16();
  r.take(signatures * 64);

  const first = r.u8();
  const versioned = (first & 0x80) !== 0;
  if (versioned && (first & 0x7f) !== 0) throw new Error(`solana: message version ${first & 0x7f} is not supported`);
  const requiredSignatures = versioned ? r.u8() : first;
  r.u8(); // numReadonlySignedAccounts
  r.u8(); // numReadonlyUnsignedAccounts

  const keyCount = r.compactU16();
  const keys: string[] = [];
  for (let i = 0; i < keyCount; i++) keys.push(base58Of(r.take(32)));
  r.take(32); // recent blockhash

  const instructions: DecodedSolanaInstruction[] = [];
  const count = r.compactU16();
  for (let i = 0; i < count; i++) {
    const programIndex = r.u8();
    const accountCount = r.compactU16();
    const accounts: string[] = [];
    for (let a = 0; a < accountCount; a++) {
      const key = keys[r.u8()];
      if (!key) throw new Error('solana: account index out of range');
      accounts.push(key);
    }
    const data = r.take(r.compactU16());
    const program = keys[programIndex];
    if (!program) throw new Error('solana: program index out of range');
    instructions.push({ program, accounts, data });
  }
  const lookups = versioned ? r.compactU16() : 0;
  if (lookups !== 0) throw new Error('solana: address lookup tables are not supported');
  if (!r.done) throw new Error('solana: trailing bytes');
  const feePayer = keys[0];
  if (!feePayer) throw new Error('solana: no fee payer');
  return { feePayer, requiredSignatures, instructions };
}

function u64le(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = v * 256n + BigInt(bytes[i]!);
  return v;
}

function u32le(bytes: Uint8Array): number {
  return (bytes[0]! | (bytes[1]! << 8) | (bytes[2]! << 16) | (bytes[3]! << 24)) >>> 0;
}

const SET_COMPUTE_UNIT_LIMIT = 2;
const SET_COMPUTE_UNIT_PRICE = 3;
const LAMPORTS_PER_SIGNATURE = 5_000n;
const DEFAULT_UNITS_PER_INSTRUCTION = 200_000n;
const MAX_COMPUTE_UNITS = 1_400_000n;
/**
 * The most a request may cost in fees: custody's own cap
 * (SOLANA_MAX_TX_FEE_LAMPORTS, 0.001 SOL). The device enforces it again because
 * the compute unit price is set by whoever builds the transaction, and an
 * inflated one would pass every other check while the fee payer pays for it.
 */
export const SOLANA_MAX_FEE_LAMPORTS = 1_000_000n;

/**
 * The highest fee the transaction can be charged: the base fee per signature
 * plus the priority fee at its compute unit limit (the runtime default when no
 * limit is set). Compute budget instructions other than the limit and the price
 * are refused, as is setting either twice.
 */
export function solanaMaxFeeLamports(
  tx: DecodedSolanaTransaction,
): { ok: true; lamports: bigint } | { ok: false; reason: string } {
  let limit: bigint | null = null;
  let price: bigint | null = null;
  let others = 0n;
  for (const ix of tx.instructions) {
    if (ix.program !== COMPUTE_BUDGET) {
      others++;
      continue;
    }
    if (ix.data[0] === SET_COMPUTE_UNIT_LIMIT && ix.data.length === 5 && limit === null) {
      limit = BigInt(u32le(ix.data.subarray(1, 5)));
    } else if (ix.data[0] === SET_COMPUTE_UNIT_PRICE && ix.data.length === 9 && price === null) {
      price = u64le(ix.data.subarray(1, 9));
    } else {
      return { ok: false, reason: 'a compute budget instruction other than one unit limit and one unit price' };
    }
  }
  const units = limit ?? others * DEFAULT_UNITS_PER_INSTRUCTION;
  const capped = units < MAX_COMPUTE_UNITS ? units : MAX_COMPUTE_UNITS;
  // The price is in micro-lamports per unit, rounded up by the runtime.
  const priority = ((price ?? 0n) * capped + 999_999n) / 1_000_000n;
  return { ok: true, lamports: BigInt(tx.requiredSignatures) * LAMPORTS_PER_SIGNATURE + priority };
}

function checkSolanaFee(tx: DecodedSolanaTransaction): { ok: true } | { ok: false; reason: string } {
  const fee = solanaMaxFeeLamports(tx);
  if (!fee.ok) return fee;
  if (fee.lamports > SOLANA_MAX_FEE_LAMPORTS) {
    return { ok: false, reason: `the fee can reach ${fee.lamports} lamports, above the ${SOLANA_MAX_FEE_LAMPORTS} cap` };
  }
  return { ok: true };
}

const hex32 = (value: unknown) => (typeof value === 'string' ? value.replace(/^0x/i, '').toLowerCase() : null);

/**
 * Check a non-burn request: the transaction moves exactly what the request
 * states (`details.destination`, `details.amount` in base units, `details.mint`
 * or null for SOL) out of the signing account, and nothing else. Beside the one
 * transfer it may only set compute budget, attach a memo and, for a token,
 * create the recipient's associated token account.
 */
function checkSolanaTransfer(
  tx: DecodedSolanaTransaction,
  sender: string,
  details: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  const destination = typeof details.destination === 'string' ? details.destination : null;
  const amount = typeof details.amount === 'string' && /^\d+$/.test(details.amount) ? BigInt(details.amount) : null;
  const mint =
    details.mint === null || details.mint === undefined ? null : typeof details.mint === 'string' ? details.mint : '';
  if (destination === null || amount === null || mint === '') {
    return { ok: false, reason: 'the request does not state the transfer it carries' };
  }

  let destinationAccount = destination;
  if (mint !== null) {
    try {
      destinationAccount = associatedTokenAddress(destination, mint);
    } catch {
      return { ok: false, reason: 'the request does not state the transfer it carries' };
    }
  }

  let transfers = 0;
  for (const ix of tx.instructions) {
    if (ix.program === COMPUTE_BUDGET || MEMO_PROGRAMS.has(ix.program)) continue;
    if (ix.program === ASSOCIATED_TOKEN_PROGRAM) {
      // [payer, associated account, owner, mint, system program, token program]; Create or CreateIdempotent.
      const createsRecipient =
        mint !== null &&
        (ix.data.length === 0 || (ix.data.length === 1 && ix.data[0] === 1)) &&
        ix.accounts[1] === destinationAccount &&
        ix.accounts[2] === destination &&
        ix.accounts[3] === mint &&
        ix.accounts[5] === TOKEN_PROGRAM;
      if (!createsRecipient) return { ok: false, reason: "an account creation that is not the recipient's token account" };
      continue;
    }
    if (ix.program === SYSTEM_PROGRAM && mint === null) {
      if (ix.data.length !== 12 || u32le(ix.data.subarray(0, 4)) !== SYSTEM_TRANSFER) {
        return { ok: false, reason: 'a system instruction that is not a transfer' };
      }
      if (ix.accounts[0] !== sender) return { ok: false, reason: 'the transfer does not leave from the signing account' };
      if (ix.accounts[1] !== destination) return { ok: false, reason: 'the destination is not the one the request states' };
      if (u64le(ix.data.subarray(4, 12)) !== amount)
        return { ok: false, reason: 'the amount is not the one the request states' };
      transfers++;
      continue;
    }
    if (ix.program === TOKEN_PROGRAM && mint !== null) {
      // [source, mint, destination, authority]; data: discriminator, u64 amount, u8 decimals.
      if (ix.data.length !== 10 || ix.data[0] !== TOKEN_TRANSFER_CHECKED) {
        return { ok: false, reason: 'a token instruction that is not a transferChecked' };
      }
      if (ix.accounts[3] !== sender) return { ok: false, reason: 'the transfer does not leave from the signing account' };
      if (ix.accounts[1] !== mint) return { ok: false, reason: 'the token is not the one the request states' };
      if (ix.accounts[2] !== destinationAccount) {
        return { ok: false, reason: 'the destination is not the one the request states' };
      }
      if (u64le(ix.data.subarray(1, 9)) !== amount)
        return { ok: false, reason: 'the amount is not the one the request states' };
      if (typeof details.decimals === 'number' && ix.data[9] !== details.decimals) {
        return { ok: false, reason: 'the decimals are not the ones the request states' };
      }
      transfers++;
      continue;
    }
    return { ok: false, reason: `an instruction for ${ix.program}, which a transfer never carries` };
  }
  if (transfers !== 1) return { ok: false, reason: `expected one transfer, found ${transfers}` };
  return { ok: true };
}

/**
 * Check a Solana request before voting. A request declared as a CCTP burn
 * (`operation: 'cctp_burn'`) must hold exactly one deposit_for_burn and nothing
 * but compute-budget instructions beside it, burn from the signing account,
 * have the fee and the event account's rent paid by the account the request
 * names, and burn the amount to the domain and recipient the request states.
 * Any other request is a transfer: it must not call the token messenger (a burn
 * always says it is one), and it must move exactly what the request states.
 */
export function checkSolanaRequest(
  unsignedPayload: string,
  request: { operation?: string | undefined; details?: Record<string, unknown> | undefined; signWith: string },
): { ok: true } | { ok: false; reason: string } {
  if (request.operation !== 'cctp_burn') {
    let transfer: DecodedSolanaTransaction;
    try {
      transfer = decodeSolanaTransaction(unsignedPayload);
    } catch (err) {
      return { ok: false, reason: `the transaction is not readable: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (transfer.instructions.some((ix) => ix.program === TOKEN_MESSENGER_MINTER_V2)) {
      return { ok: false, reason: 'a CCTP burn the request does not declare' };
    }
    const fee = checkSolanaFee(transfer);
    if (!fee.ok) return fee;
    return checkSolanaTransfer(transfer, request.signWith, request.details ?? {});
  }

  let tx: DecodedSolanaTransaction;
  try {
    tx = decodeSolanaTransaction(unsignedPayload);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  const burns = tx.instructions.filter((ix) => ix.program === TOKEN_MESSENGER_MINTER_V2);

  if (tx.instructions.some((ix) => ix.program !== TOKEN_MESSENGER_MINTER_V2 && ix.program !== COMPUTE_BUDGET)) {
    return { ok: false, reason: 'the burn carries an instruction for another program' };
  }
  if (burns.length !== 1) return { ok: false, reason: `expected one deposit_for_burn, found ${burns.length}` };
  const fee = checkSolanaFee(tx);
  if (!fee.ok) return fee;
  const burn = burns[0]!;
  if (burn.data.length < 52 || bytesToHex(burn.data.subarray(0, 8)) !== DEPOSIT_FOR_BURN) {
    return { ok: false, reason: 'not a deposit_for_burn' };
  }
  if (burn.accounts[OWNER] !== request.signWith)
    return { ok: false, reason: 'the burn does not leave from the signing account' };

  const details = request.details ?? {};
  const payer = typeof details.feePayer === 'string' ? details.feePayer : null;
  if (!payer || tx.feePayer !== payer || burn.accounts[EVENT_RENT_PAYER] !== payer) {
    return { ok: false, reason: 'the fee or the event rent is not paid by the account the request names' };
  }
  const amount = u64le(burn.data.subarray(8, 16));
  const domain = u32le(burn.data.subarray(16, 20));
  const recipient = bytesToHex(burn.data.subarray(20, 52));
  if (String(amount) !== String(details.amount)) return { ok: false, reason: 'the amount is not the one the request states' };
  if (domain !== Number(details.destinationDomain))
    return { ok: false, reason: 'the destination domain is not the one the request states' };
  if (recipient !== hex32(details.mintRecipient))
    return { ok: false, reason: 'the mint recipient is not the one the request states' };
  return { ok: true };
}
