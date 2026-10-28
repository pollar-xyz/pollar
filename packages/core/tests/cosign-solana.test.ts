// The device's reading of a Solana co-sign request: a CCTP burn or a transfer.
// Pure: no network, no keys. The transactions are serialized here by hand in
// Solana's wire format (compact-u16 lengths, v0 message).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  associatedTokenAddress,
  base58Of,
  checkSolanaRequest,
  decodeSolanaTransaction,
  SOLANA_MAX_FEE_LAMPORTS,
  solanaMaxFeeLamports,
  TOKEN_MESSENGER_MINTER_V2,
} from '../src/cosign/solana';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(address: string): Uint8Array {
  let n = 0n;
  for (const ch of address) n = n * 58n + BigInt(BASE58.indexOf(ch));
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

const key = (seed: number) => base58Of(Uint8Array.from({ length: 32 }, (_, i) => (seed * 7 + i) % 256));

const USER = key(1);
const GAS = key(2);
const EVENT = key(3);
const OTHER = key(4);
const SYSTEM = '11111111111111111111111111111111';
const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
const DISC = [215, 60, 61, 46, 114, 55, 128, 176];
const RECIPIENT = '22'.repeat(32);

function le(value: bigint, bytes: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < bytes; i++) out.push(Number((value >> BigInt(8 * i)) & 0xffn));
  return out;
}

function burnData(amount: bigint, domain: number, recipientHex: string): number[] {
  const recipient = Array.from(recipientHex.match(/../g)!, (h) => parseInt(h, 16));
  return [
    ...DISC,
    ...le(amount, 8),
    ...le(BigInt(domain), 4),
    ...recipient,
    ...new Array(32).fill(9),
    ...le(0n, 8),
    ...le(2000n, 4),
  ];
}

interface Ix {
  program: string;
  accounts: string[];
  data: number[];
}

/** A v0 transaction with `signers` empty signature slots, no lookup tables. */
function serialize(opts: { payer: string; instructions: Ix[]; signers?: number }): string {
  const keys = [opts.payer];
  for (const ix of opts.instructions) for (const k of [...ix.accounts, ix.program]) if (!keys.includes(k)) keys.push(k);
  const signers = opts.signers ?? 3;
  const bytes: number[] = [signers, ...new Array(64 * signers).fill(0)];
  bytes.push(0x80, signers, 0, 1); // v0, header
  bytes.push(keys.length);
  for (const k of keys) bytes.push(...base58Decode(k));
  bytes.push(...new Array(32).fill(5)); // blockhash
  bytes.push(opts.instructions.length);
  for (const ix of opts.instructions) {
    bytes.push(keys.indexOf(ix.program), ix.accounts.length, ...ix.accounts.map((a) => keys.indexOf(a)));
    if (ix.data.length > 127) bytes.push((ix.data.length & 0x7f) | 0x80, ix.data.length >> 7);
    else bytes.push(ix.data.length);
    bytes.push(...ix.data);
  }
  bytes.push(0); // no lookup tables
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const burnIx = (
  overrides: { owner?: string; rentPayer?: string; amount?: bigint; domain?: number; recipient?: string } = {},
): Ix => ({
  program: TOKEN_MESSENGER_MINTER_V2,
  accounts: [
    overrides.owner ?? USER,
    overrides.rentPayer ?? GAS,
    key(10),
    key(11),
    key(12),
    key(13),
    key(14),
    key(15),
    key(16),
    key(17),
    key(18),
    EVENT,
  ],
  data: burnData(overrides.amount ?? 1_500_000n, overrides.domain ?? 7, overrides.recipient ?? RECIPIENT),
});
const budgetIx: Ix = { program: COMPUTE_BUDGET, accounts: [], data: [3, ...le(1n, 8)] };

const request = (payload: string, details: Record<string, unknown> = {}) => ({
  operation: 'cctp_burn',
  signWith: USER,
  details: { amount: '1500000', destinationDomain: 7, mintRecipient: `0x${RECIPIENT}`, feePayer: GAS, ...details },
  payload,
});
const check = (r: ReturnType<typeof request>) => checkSolanaRequest(r.payload, r);

test('a serialized v0 transaction decodes into its fee payer and instructions', () => {
  const tx = decodeSolanaTransaction(serialize({ payer: GAS, instructions: [budgetIx, burnIx()] }));
  assert.equal(tx.feePayer, GAS);
  assert.deepEqual(
    tx.instructions.map((i) => i.program),
    [COMPUTE_BUDGET, TOKEN_MESSENGER_MINTER_V2],
  );
  assert.equal(tx.instructions[1]!.accounts[0], USER);
  assert.equal(tx.instructions[1]!.accounts[11], EVENT);
});

test('the burn the platform builds is recognized', () => {
  assert.deepEqual(check(request(serialize({ payer: GAS, instructions: [budgetIx, burnIx()] }))), { ok: true });
});

test('a burn that differs from what the request states is refused', () => {
  const cases: Array<[string, string, Record<string, unknown>?]> = [
    ['amount', serialize({ payer: GAS, instructions: [burnIx({ amount: 9_000_000n })] })],
    ['domain', serialize({ payer: GAS, instructions: [burnIx({ domain: 0 })] })],
    ['recipient', serialize({ payer: GAS, instructions: [burnIx({ recipient: '44'.repeat(32) })] })],
    ['signing account', serialize({ payer: GAS, instructions: [burnIx({ owner: OTHER })] })],
    ['paid', serialize({ payer: OTHER, instructions: [burnIx({ rentPayer: OTHER })] })],
    ['paid', serialize({ payer: GAS, instructions: [burnIx({ rentPayer: OTHER })] })],
  ];
  for (const [reason, payload] of cases) {
    const result = check(request(payload));
    assert.equal(result.ok, false, reason);
    assert.match((result as { reason: string }).reason, new RegExp(reason), reason);
  }
});

test('anything beside the burn is refused, and a burn is never hidden in another request', () => {
  const transfer: Ix = { program: SYSTEM, accounts: [GAS, OTHER], data: [2, 0, 0, 0, ...le(1n, 8)] };
  const extra = check(request(serialize({ payer: GAS, instructions: [burnIx(), transfer] })));
  assert.equal(extra.ok, false);
  assert.match((extra as { reason: string }).reason, /another program/);

  const two = check(request(serialize({ payer: GAS, instructions: [burnIx(), burnIx()] })));
  assert.equal(two.ok, false);

  const hidden = checkSolanaRequest(serialize({ payer: GAS, instructions: [burnIx()] }), {
    operation: 'transfer',
    signWith: USER,
  });
  assert.equal(hidden.ok, false);
  assert.match((hidden as { reason: string }).reason, /does not declare/);

  const plain = checkSolanaRequest(serialize({ payer: USER, instructions: [transfer] }), {
    operation: 'transfer',
    signWith: USER,
  });
  assert.equal(plain.ok, false, 'a transfer whose request states nothing is not approved');
});

test('a payload this reader does not know is not recognized', () => {
  assert.equal(check(request('00')).ok, false);
  const withLookups = serialize({ payer: GAS, instructions: [burnIx()] }).slice(0, -2) + '01';
  assert.equal(check(request(withLookups)).ok, false);
});

// A transfer as the custody service compiles it: priority fee, then the SOL
// transfer or the recipient's ATA (idempotent) and a transferChecked, then a memo.
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const DEST = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const DEST_ATA = associatedTokenAddress(DEST, USDC);
const memoIx: Ix = { program: MEMO, accounts: [], data: [...new TextEncoder().encode('tag-42')] };
const solIx = (o: { from?: string; to?: string; lamports?: bigint; disc?: number } = {}): Ix => ({
  program: SYSTEM,
  accounts: [o.from ?? USER, o.to ?? DEST],
  data: [...le(BigInt(o.disc ?? 2), 4), ...le(o.lamports ?? 250_000_000n, 8)],
});
const createAtaIx = (o: { ata?: string; owner?: string; mint?: string } = {}): Ix => ({
  program: ATA_PROGRAM,
  accounts: [GAS, o.ata ?? DEST_ATA, o.owner ?? DEST, o.mint ?? USDC, SYSTEM, TOKEN],
  data: [1],
});
const transferCheckedIx = (
  o: { authority?: string; mint?: string; to?: string; amount?: bigint; decimals?: number } = {},
): Ix => ({
  program: TOKEN,
  accounts: [associatedTokenAddress(USER, USDC), o.mint ?? USDC, o.to ?? DEST_ATA, o.authority ?? USER],
  data: [12, ...le(o.amount ?? 1_500_000n, 8), o.decimals ?? 6],
});
const transferRequest = (instructions: Ix[], details: Record<string, unknown> = {}, payer = GAS) =>
  checkSolanaRequest(serialize({ payer, instructions }), {
    operation: 'transfer',
    signWith: USER,
    details: { destination: DEST, amount: '1500000', mint: USDC, decimals: 6, symbol: 'USDC', ...details },
  });
const solDetails = { amount: '250000000', mint: null, decimals: 9, symbol: 'SOL' };

test('the associated token address is the PDA the token program derives', () => {
  // Computed with @solana/spl-token's getAssociatedTokenAddressSync.
  assert.equal(DEST_ATA, 'FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B');
});

test('the transfers the platform builds are recognized', () => {
  assert.deepEqual(transferRequest([budgetIx, solIx(), memoIx], solDetails, USER), { ok: true });
  assert.deepEqual(transferRequest([budgetIx, createAtaIx(), transferCheckedIx(), memoIx]), { ok: true });
  assert.deepEqual(transferRequest([transferCheckedIx()], { decimals: undefined, symbol: undefined }), { ok: true });
});

test('a SOL transfer that differs from what the request states is refused', () => {
  const cases: Array<[string, Ix[]]> = [
    ['destination', [solIx({ to: OTHER })]],
    ['amount', [solIx({ lamports: 250_000_001n })]],
    ['signing account', [solIx({ from: OTHER })]],
    ['not a transfer', [solIx({ disc: 0 })]],
    ['expected one transfer, found 2', [solIx(), solIx()]],
    ['expected one transfer, found 0', [budgetIx, memoIx]],
  ];
  for (const [reason, instructions] of cases) {
    const result = transferRequest(instructions, solDetails);
    assert.equal(result.ok, false, reason);
    assert.match((result as { reason: string }).reason, new RegExp(reason), reason);
  }
});

test('a token transfer that differs from what the request states is refused', () => {
  const cases: Array<[string, Ix[]]> = [
    ['destination', [transferCheckedIx({ to: associatedTokenAddress(OTHER, USDC) })]],
    ['amount', [transferCheckedIx({ amount: 1_500_001n })]],
    ['token', [transferCheckedIx({ mint: key(20) })]],
    ['signing account', [transferCheckedIx({ authority: OTHER })]],
    ['decimals', [transferCheckedIx({ decimals: 9 })]],
    [
      "recipient's token account",
      [createAtaIx({ owner: OTHER, ata: associatedTokenAddress(OTHER, USDC) }), transferCheckedIx()],
    ],
    ["recipient's token account", [createAtaIx({ mint: key(20) }), transferCheckedIx()]],
    ['expected one transfer, found 2', [transferCheckedIx(), transferCheckedIx()]],
    ['which a transfer never carries', [solIx(), transferCheckedIx()]],
    ['which a transfer never carries', [transferCheckedIx(), { program: key(30), accounts: [USER], data: [] }]],
  ];
  for (const [reason, instructions] of cases) {
    const result = transferRequest(instructions);
    assert.equal(result.ok, false, reason);
    assert.match((result as { reason: string }).reason, new RegExp(reason), reason);
  }
  const approve: Ix = { ...transferCheckedIx(), data: [4, ...le(1n, 8)] };
  assert.match((transferRequest([approve]) as { reason: string }).reason, /not a transferChecked/);
});

test('a transfer request that does not state its transfer, or a payload this reader does not know, is refused', () => {
  assert.equal(transferRequest([transferCheckedIx()], { destination: undefined }).ok, false);
  assert.equal(transferRequest([transferCheckedIx()], { amount: 1500000 }).ok, false);
  assert.equal(checkSolanaRequest('00', { operation: 'transfer', signWith: USER, details: {} }).ok, false);
});

const priceIx = (microLamports: bigint): Ix => ({ program: COMPUTE_BUDGET, accounts: [], data: [3, ...le(microLamports, 8)] });
const limitIx = (units: bigint): Ix => ({ program: COMPUTE_BUDGET, accounts: [], data: [2, ...le(units, 4)] });

test('the fee a transaction can reach is the base fee per signature plus the priority fee at its unit limit', () => {
  // 3 signatures, 1 lamport per unit, 200k units: 15k + 200k.
  const limited = decodeSolanaTransaction(
    serialize({ payer: USER, instructions: [limitIx(200_000n), priceIx(1_000_000n), solIx()] }),
  );
  assert.deepEqual(solanaMaxFeeLamports(limited), { ok: true, lamports: 215_000n });
  // No limit: 200k units per instruction that is not a compute budget one.
  const unlimited = decodeSolanaTransaction(serialize({ payer: USER, instructions: [priceIx(1_000_000n), solIx(), memoIx] }));
  assert.deepEqual(solanaMaxFeeLamports(unlimited), { ok: true, lamports: 415_000n });
});

test('a transfer or a burn whose priority fee can pass the cap is refused', () => {
  const inflated = priceIx(10_000_000_000n);
  assert.match(
    (transferRequest([inflated, solIx(), memoIx], solDetails, USER) as { reason: string }).reason,
    new RegExp(`above the ${SOLANA_MAX_FEE_LAMPORTS} cap`),
  );
  assert.match(
    (transferRequest([limitIx(1_400_000n), priceIx(1_000_000n), createAtaIx(), transferCheckedIx()]) as { reason: string })
      .reason,
    /above the .* cap/,
  );
  assert.match(
    (check(request(serialize({ payer: GAS, instructions: [inflated, burnIx()] }))) as { reason: string }).reason,
    /above the .* cap/,
  );
});

test('compute budget instructions beyond one unit limit and one unit price are refused', () => {
  const heapFrame: Ix = { program: COMPUTE_BUDGET, accounts: [], data: [1, ...le(65_536n, 4)] };
  for (const extra of [heapFrame, priceIx(1n)]) {
    const result = transferRequest([budgetIx, extra, solIx()], solDetails, USER);
    assert.match((result as { reason: string }).reason, /compute budget instruction/);
  }
});
