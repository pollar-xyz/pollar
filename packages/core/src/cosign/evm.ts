import { keccak_256 } from '@noble/hashes/sha3';
import { hexToBytes, bytesToHex } from './encoding';

/**
 * The device's own reading of a Polygon co-sign request: the unsigned EIP-1559
 * transaction decoded by hand (RLP, no EVM library), and the call it makes
 * recognized against the few the platform ever asks a co-signed wallet to sign.
 * A shape this reader does not know is "not recognized", never guessed, and is
 * not approved.
 */

type RlpItem = Uint8Array | RlpItem[];

function readLength(bytes: Uint8Array, offset: number, lengthOfLength: number): number {
  if (offset + lengthOfLength > bytes.length) throw new Error('rlp: unexpected end');
  let length = 0;
  for (let i = 0; i < lengthOfLength; i++) length = length * 256 + bytes[offset + i]!;
  return length;
}

/** Decode one RLP item at `offset`; returns it and the offset just past it. */
function decodeAt(bytes: Uint8Array, offset: number): { item: RlpItem; next: number } {
  if (offset >= bytes.length) throw new Error('rlp: unexpected end');
  const prefix = bytes[offset]!;
  if (prefix < 0x80) return { item: bytes.subarray(offset, offset + 1), next: offset + 1 };
  if (prefix <= 0xb7) {
    const length = prefix - 0x80;
    const end = offset + 1 + length;
    if (end > bytes.length) throw new Error('rlp: string past the end');
    return { item: bytes.subarray(offset + 1, end), next: end };
  }
  if (prefix <= 0xbf) {
    const lengthOfLength = prefix - 0xb7;
    const length = readLength(bytes, offset + 1, lengthOfLength);
    const start = offset + 1 + lengthOfLength;
    if (start + length > bytes.length) throw new Error('rlp: string past the end');
    return { item: bytes.subarray(start, start + length), next: start + length };
  }
  let start: number;
  let length: number;
  if (prefix <= 0xf7) {
    length = prefix - 0xc0;
    start = offset + 1;
  } else {
    const lengthOfLength = prefix - 0xf7;
    length = readLength(bytes, offset + 1, lengthOfLength);
    start = offset + 1 + lengthOfLength;
  }
  const end = start + length;
  if (end > bytes.length) throw new Error('rlp: list past the end');
  const items: RlpItem[] = [];
  let cursor = start;
  while (cursor < end) {
    const { item, next } = decodeAt(bytes, cursor);
    items.push(item);
    cursor = next;
  }
  if (cursor !== end) throw new Error('rlp: list length mismatch');
  return { item: items, next: end };
}

function asBytes(item: RlpItem | undefined, field: string): Uint8Array {
  if (!(item instanceof Uint8Array)) throw new Error(`eip1559: ${field} is not a byte string`);
  return item;
}

function asBigInt(item: RlpItem | undefined, field: string): bigint {
  const bytes = asBytes(item, field);
  return bytes.length === 0 ? 0n : BigInt(`0x${bytesToHex(bytes)}`);
}

export interface UnsignedEip1559 {
  chainId: bigint;
  nonce: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gas: bigint;
  /** Lowercase 0x address; null for a contract creation, which nothing here asks for. */
  to: string | null;
  value: bigint;
  /** Lowercase 0x calldata. */
  data: string;
  accessListLength: number;
}

/** Decode an unsigned EIP-1559 transaction (`0x02 || rlp([...9 fields])`), with or without the 0x prefix. */
export function decodeUnsignedEip1559(hex: string): UnsignedEip1559 {
  const clean = hex.replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean)) throw new Error('eip1559: payload is not hex');
  const bytes = hexToBytes(clean);
  if (bytes[0] !== 0x02) throw new Error('eip1559: not a type-2 transaction');
  const { item, next } = decodeAt(bytes, 1);
  if (next !== bytes.length) throw new Error('eip1559: trailing bytes');
  if (!Array.isArray(item) || item.length !== 9) throw new Error('eip1559: expected 9 fields (an unsigned transaction)');
  const to = asBytes(item[5], 'to');
  if (to.length !== 0 && to.length !== 20) throw new Error('eip1559: to is not an address');
  const accessList = item[8];
  if (!Array.isArray(accessList)) throw new Error('eip1559: accessList is not a list');
  return {
    chainId: asBigInt(item[0], 'chainId'),
    nonce: asBigInt(item[1], 'nonce'),
    maxPriorityFeePerGas: asBigInt(item[2], 'maxPriorityFeePerGas'),
    maxFeePerGas: asBigInt(item[3], 'maxFeePerGas'),
    gas: asBigInt(item[4], 'gas'),
    to: to.length === 0 ? null : `0x${bytesToHex(to)}`,
    value: asBigInt(item[6], 'value'),
    data: `0x${bytesToHex(asBytes(item[7], 'data'))}`,
    accessListLength: accessList.length,
  };
}

/** The calls a co-signed Polygon wallet is ever asked to make, by 4-byte selector. */
const KNOWN_SELECTORS: Record<string, { kind: EvmCallKind; minArgsWords: number }> = {
  // ERC-20 transfer(address,uint256)
  '0xa9059cbb': { kind: 'erc20_transfer', minArgsWords: 2 },
  // ERC-20 approve(address,uint256)
  '0x095ea7b3': { kind: 'erc20_approve', minArgsWords: 2 },
  // Uniswap V3 SwapRouter02 exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))
  '0x04e45aaf': { kind: 'swap_exact_input_single', minArgsWords: 7 },
  // CCTP V2 TokenMessengerV2 depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)
  '0x8e0250ee': { kind: 'cctp_deposit_for_burn', minArgsWords: 7 },
  // CCTP V2 TokenMessengerV2 depositForBurnWithHook(uint256,uint32,bytes32,address,bytes32,uint256,uint32,bytes)
  '0x779b432d': { kind: 'cctp_deposit_for_burn_with_hook', minArgsWords: 8 },
};

export type EvmCallKind =
  | 'native_transfer'
  | 'erc20_transfer'
  | 'erc20_approve'
  | 'swap_exact_input_single'
  | 'cctp_deposit_for_burn'
  | 'cctp_deposit_for_burn_with_hook';

export type EvmCallRecognition = { ok: true; kind: EvmCallKind } | { ok: false; reason: string };

/** Which known call a transaction makes, or why it is not one. */
export function recognizeEvmCall(tx: Pick<UnsignedEip1559, 'to' | 'value' | 'data'>): EvmCallRecognition {
  if (!tx.to) return { ok: false, reason: 'a contract creation is never asked of a co-signed wallet' };
  if (tx.data === '0x') return { ok: true, kind: 'native_transfer' };
  // A contract call that also moves POL is not one of the platform's.
  if (tx.value !== 0n) return { ok: false, reason: 'a contract call that also sends POL is not recognized' };
  const selector = tx.data.slice(0, 10);
  const known = KNOWN_SELECTORS[selector];
  if (!known) return { ok: false, reason: `the call ${selector} is not one this device recognizes` };
  const argsHex = tx.data.length - 10;
  if (argsHex % 64 !== 0 || argsHex / 64 < known.minArgsWords) {
    return { ok: false, reason: `the ${known.kind} arguments are malformed` };
  }
  return { ok: true, kind: known.kind };
}

/** Polygon's chain id for the app's network: mainnet, or Amoy for testnet. */
export function polygonChainIdFor(networkPassphrase: string): bigint {
  return networkPassphrase.startsWith('Public Global Stellar Network') ? 137n : 80002n;
}

export type EvmRequestCheck =
  | { ok: true; kind: EvmCallKind | 'execute_batch'; tx: UnsignedEip1559 }
  | { ok: false; reason: string };

/**
 * Check a Polygon request's payload on its own terms: it decodes as an unsigned
 * EIP-1559 transaction for this network's chain, it makes a call this device
 * recognizes, and its destination, value and calldata are exactly the ones the
 * request says it carries (`details.to`, `details.value`, `details.data`), so
 * what the user is shown is what gets signed.
 */
export function checkEvmRequest(
  payload: string,
  details: Record<string, unknown> | undefined,
  expectedChainId: bigint,
  signWith?: string,
): EvmRequestCheck {
  let tx: UnsignedEip1559;
  try {
    tx = decodeUnsignedEip1559(payload);
  } catch (err) {
    return { ok: false, reason: `the transaction is not readable: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (tx.chainId !== expectedChainId) {
    return { ok: false, reason: `the transaction is for chain ${tx.chainId}, not ${expectedChainId}` };
  }
  if (tx.accessListLength !== 0) return { ok: false, reason: 'an access list is never part of a platform transaction' };
  const recognized =
    tx.data.startsWith(EXECUTE_BATCH_SELECTOR) || details?.calls !== undefined
      ? checkExecuteBatch(tx, details, signWith)
      : recognizeEvmCall(tx);
  if (!recognized.ok) return recognized;

  const to = typeof details?.to === 'string' ? details.to.toLowerCase() : null;
  const data = typeof details?.data === 'string' ? details.data.toLowerCase() : null;
  const value = typeof details?.value === 'string' && /^\d+$/.test(details.value) ? BigInt(details.value) : null;
  if (to === null || data === null || value === null) {
    return { ok: false, reason: 'the request does not state the call it carries' };
  }
  if (tx.to !== to || tx.data !== data || tx.value !== value) {
    return { ok: false, reason: 'the transaction does not make the call the request describes' };
  }
  return { ok: true, kind: recognized.kind, tx };
}

/**
 * eth-infinitism Simple7702Account (account-abstraction v0.8), the one code a
 * co-signed Polygon wallet delegates to for atomic batches. An authorization
 * naming any other address hands the wallet's account to that code.
 */
export const BATCH_DELEGATE = '0x4cd241e8d1510e30b2076397afc7508ae59c66c9';

/** The most calls one batch carries, custody's own cap. */
export const MAX_BATCH_CALLS = 16;

const EXECUTE_BATCH_SELECTOR = `0x${bytesToHex(
  keccak_256(new TextEncoder().encode('executeBatch((address,uint256,bytes)[])')).subarray(0, 4),
)}`;

export interface EvmBatchCall {
  /** Lowercase 0x address. */
  to: string;
  /** Wei, as a decimal string. */
  value: string;
  /** Lowercase 0x calldata. */
  data: string;
}

const word = (value: bigint) => value.toString(16).padStart(64, '0');

/** `executeBatch(Call[])` calldata in the ABI's canonical encoding, the one custody compiles. */
export function encodeExecuteBatch(calls: readonly EvmBatchCall[]): string {
  const heads: string[] = [];
  const tails: string[] = [];
  let offset = BigInt(32 * calls.length);
  for (const call of calls) {
    const data = call.data.replace(/^0x/i, '').toLowerCase();
    const length = data.length / 2;
    const padded = data.padEnd(Math.ceil(length / 32) * 64, '0');
    const tuple = `${word(BigInt(call.to))}${word(BigInt(call.value))}${word(96n)}${word(BigInt(length))}${padded}`;
    heads.push(word(offset));
    tails.push(tuple);
    offset += BigInt(tuple.length / 2);
  }
  return `${EXECUTE_BATCH_SELECTOR}${word(32n)}${word(BigInt(calls.length))}${heads.join('')}${tails.join('')}`;
}

/** The calls a request states (`details.calls`), normalized; null when they are not well formed. */
function statedCalls(value: unknown): EvmBatchCall[] | null {
  if (!Array.isArray(value)) return null;
  const calls: EvmBatchCall[] = [];
  for (const raw of value) {
    const call = raw as { to?: unknown; value?: unknown; data?: unknown } | null;
    if (!call || typeof call.to !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(call.to)) return null;
    if (typeof call.value !== 'string' || !/^\d+$/.test(call.value)) return null;
    if (typeof call.data !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(call.data)) return null;
    calls.push({ to: call.to.toLowerCase(), value: BigInt(call.value).toString(), data: call.data.toLowerCase() });
  }
  return calls;
}

/**
 * An atomic batch: the wallet calls itself (its delegated code) with
 * `executeBatch`, sends no POL with the call, and the calldata is exactly the
 * calls the request states (`details.calls`), so the user is shown each call
 * that runs. No call may target the wallet or the delegate, which would reach
 * the account's own entry points around the checks on each call.
 */
function checkExecuteBatch(
  tx: Pick<UnsignedEip1559, 'to' | 'value' | 'data'>,
  details: Record<string, unknown> | undefined,
  signWith: string | undefined,
): { ok: true; kind: 'execute_batch' } | { ok: false; reason: string } {
  const wallet = signWith?.toLowerCase();
  if (!wallet || tx.to !== wallet) return { ok: false, reason: 'a batch is a call of the wallet to itself' };
  if (!tx.data.startsWith(EXECUTE_BATCH_SELECTOR)) return { ok: false, reason: 'a self-call that is not executeBatch' };
  if (tx.value !== 0n) return { ok: false, reason: 'a batch call that also sends POL is not recognized' };
  const calls = statedCalls(details?.calls);
  if (!calls) return { ok: false, reason: 'the request does not state the calls of the batch' };
  if (calls.length === 0 || calls.length > MAX_BATCH_CALLS) {
    return { ok: false, reason: `a batch carries 1 to ${MAX_BATCH_CALLS} calls, not ${calls.length}` };
  }
  if (calls.some((call) => call.to === wallet || call.to === BATCH_DELEGATE)) {
    return { ok: false, reason: 'a batch call targets the wallet or its delegate' };
  }
  if (encodeExecuteBatch(calls) !== tx.data)
    return { ok: false, reason: 'the batch does not make the calls the request states' };
  return { ok: true, kind: 'execute_batch' };
}

function rlpLength(length: number, offset: number): Uint8Array {
  if (length < 56) return Uint8Array.of(offset + length);
  const bytes: number[] = [];
  for (let n = length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n % 256);
  return Uint8Array.of(offset + 55 + bytes.length, ...bytes);
}

function rlpString(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 1 && bytes[0]! < 0x80) return bytes;
  return Uint8Array.of(...rlpLength(bytes.length, 0x80), ...bytes);
}

/** A non-negative integer as RLP's minimal big-endian bytes (zero is the empty string). */
function rlpUint(value: bigint): Uint8Array {
  if (value === 0n) return rlpString(new Uint8Array(0));
  const hex = value.toString(16);
  return rlpString(hexToBytes(hex.length % 2 ? `0${hex}` : hex));
}

/** EIP-7702's authorization digest: keccak256(0x05 || rlp([chainId, address, nonce])), lowercase hex without 0x. */
export function evmAuthorizationDigest(tuple: { chainId: bigint; address: string; nonce: bigint }): string {
  const items = [rlpUint(tuple.chainId), rlpString(hexToBytes(tuple.address.replace(/^0x/i, ''))), rlpUint(tuple.nonce)];
  const body = items.reduce((total, item) => total + item.length, 0);
  const list = Uint8Array.of(...rlpLength(body, 0xc0), ...items.flatMap((item) => [...item]));
  return bytesToHex(keccak_256(Uint8Array.of(0x05, ...list)));
}

export type EvmAuthorizationCheck = { ok: true; digest: string } | { ok: false; reason: string; digest?: string };

/**
 * Check an `EVM_AUTHORIZATION` request: its payload is the EIP-7702 tuple
 * (`{ chainId, address, nonce }`), it delegates to the batch delegate and to
 * nothing else, it is for this network's chain (never chain 0, which would be
 * valid on every EVM chain), and the digest recomputed here is the one Pollar
 * asks to sign.
 */
export function checkEvmAuthorizationRequest(
  payload: string,
  payloadHash: string,
  expectedChainId: bigint,
): EvmAuthorizationCheck {
  let tuple: { chainId?: unknown; address?: unknown; nonce?: unknown };
  try {
    tuple = JSON.parse(payload) as typeof tuple;
  } catch {
    return { ok: false, reason: 'the authorization payload is not readable' };
  }
  const integer = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? BigInt(value)
      : typeof value === 'string' && /^\d+$/.test(value)
        ? BigInt(value)
        : null;
  const chainId = integer(tuple?.chainId);
  const nonce = integer(tuple?.nonce);
  const address = typeof tuple?.address === 'string' ? tuple.address.toLowerCase() : null;
  if (chainId === null || nonce === null || !address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return { ok: false, reason: 'the authorization payload is not an EIP-7702 tuple' };
  }
  if (address !== BATCH_DELEGATE)
    return { ok: false, reason: `the authorization delegates to ${address}, not the batch delegate` };
  if (chainId !== expectedChainId) {
    return { ok: false, reason: `the authorization is for chain ${chainId}, not ${expectedChainId}` };
  }
  const digest = evmAuthorizationDigest({ chainId, address, nonce });
  if (digest !== payloadHash.replace(/^0x/i, '').toLowerCase()) {
    return { ok: false, reason: 'the authorization does not hash to what Pollar asks to sign', digest };
  }
  return { ok: true, digest };
}
