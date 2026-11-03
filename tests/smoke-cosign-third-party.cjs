// @pollar smoke test: what a co-signed device reads before it votes on the
// requests of Earn on Solana, cross-chain swaps, ramp sales paid by the app's
// fee wallet and atomic EVM batches. Each shape is accepted as built and
// refused once tampered with.
//
// - EVM_AUTHORIZATION: the EIP-7702 tuple delegates to Simple7702Account on
//   this network's chain, and its digest is recomputed here.
// - An EVM batch is the wallet calling itself with executeBatch, exactly the
//   calls the request states.
// - An Earn transaction and a `multichain` swap are a third party's: paid by
//   the account the request names, signed by the user and that payer alone,
//   nothing at the top level moving funds anywhere but into the protocol.
// - A ramp sale built by the provider and paid by the app's fee wallet is still
//   the one token transfer the request states.
//
// The EVM vectors are viem 2.52's output (hashAuthorization, encodeFunctionData,
// serializeTransaction). Run with `node tests/smoke-cosign-third-party.cjs`
// after the build; no network is needed.

const path = require('node:path');
const crypto = require('node:crypto');
const { ed25519 } = require('@noble/curves/ed25519');

globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.fetch = async () => new Response(JSON.stringify({ success: true, content: {} }), { status: 200 });

const sdk = require(path.resolve(__dirname, '../packages/core/dist/index.js'));

let pass = 0;
let fail = 0;
function check(label, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  OK    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`, extra ?? '');
  }
}

// --- EVM vectors ----------------------------------------------------------------
const DELEGATE = '0x4Cd241E8d1510e30b2076397afc7508Ae59C66c9';
const WALLET = '0xAae901C9cC8A88611C041BB4C1EEE81a895CB943';
const USDC_POLYGON = '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582';
const VAULT = '0x1111111111111111111111111111111111111111';
const AUTH_DIGEST = '951b47589f52f71c1a1a84e44e0e9fdbb4a718879d0772f17ebc2d04b01b5e48';
const AUTH_DIGEST_NONCE_0 = 'c88114164f34eda3e483a8a3e602791eee8984177a0c356ec104c49060bf3bf2';
const APPROVE =
  '0x095ea7b30000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000016e360';
const DEPOSIT = '0xb6b55f2500000000000000000000000000000000000000000000000000000000000f4240abcd';
const BATCH_DATA =
  '0x34fcd5be000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000012000000000000000000000000041e94eb019c0762f9bfcf9fb1e58725bfb0e7582000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000044095ea7b30000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000016e360000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000026b6b55f2500000000000000000000000000000000000000000000000000000000000f4240abcd0000000000000000000000000000000000000000000000000000';
// An unsigned EIP-1559 transaction on Amoy (80002): WALLET calls itself with BATCH_DATA.
const BATCH_TX = `0x02f9025383013882038506fc23ac00850ba43b7400830493e094aae901c9cc8a88611c041bb4c1eee81a895cb94380b90224${BATCH_DATA.slice(2)}c0`;
const BATCH_CALLS = [
  { to: USDC_POLYGON, value: '0', data: APPROVE },
  { to: VAULT, value: '0', data: DEPOSIT },
];

// --- Solana wire builder ----------------------------------------------------------
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}
function b58decode(address) {
  let n = 0n;
  for (const ch of address) n = n * 58n + BigInt(BASE58.indexOf(ch));
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}
/** A fresh address that is not on any list. */
const key = (seed) => b58encode(crypto.createHash('sha256').update(seed).digest());

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

function ata(owner, mint) {
  const seeds = [b58decode(owner), b58decode(TOKEN_PROGRAM), b58decode(mint)];
  for (let bump = 255; bump >= 0; bump--) {
    const hash = crypto
      .createHash('sha256')
      .update(Buffer.concat([...seeds, Buffer.from([bump]), b58decode(ATA_PROGRAM), Buffer.from('ProgramDerivedAddress')]))
      .digest();
    try {
      ed25519.Point.fromHex(hash);
    } catch {
      return b58encode(hash);
    }
  }
  throw new Error('no ata');
}

const compact = (n) => {
  const out = [];
  let rest = n;
  do {
    const low = rest & 0x7f;
    rest >>= 7;
    out.push(rest ? low | 0x80 : low);
  } while (rest);
  return out;
};
const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const u64 = (n) => {
  const out = [];
  let v = BigInt(n);
  for (let i = 0; i < 8; i++) {
    out.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return out;
};

/**
 * An unsigned v0 transaction. `keys` are in message order (writable signers,
 * readonly signers, writable, readonly); each instruction names its program and
 * accounts by address.
 */
function solanaTx({ signers, readonlyUnsigned, keys, instructions, lookups = [] }) {
  const index = (address) => {
    const i = keys.indexOf(address);
    if (i < 0) throw new Error(`not a key: ${address}`);
    return i;
  };
  const bytes = [
    ...compact(signers),
    ...new Array(signers * 64).fill(0),
    0x80,
    signers,
    0,
    readonlyUnsigned,
    ...compact(keys.length),
    ...keys.flatMap((k) => [...b58decode(k)]),
    ...new Array(32).fill(7),
    ...compact(instructions.length),
    ...instructions.flatMap((ix) => [
      index(ix.program),
      ...compact(ix.accounts.length),
      ...ix.accounts.map(index),
      ...compact(ix.data.length),
      ...ix.data,
    ]),
    ...compact(lookups.length),
    ...lookups.flatMap((t) => [...b58decode(t.table), ...compact(t.writable.length), ...t.writable, ...compact(0)]),
  ];
  return Buffer.from(bytes).toString('hex');
}

const KAMINO_SOL_DEPOSIT =
  'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAKELIjEUw80bLre65s7T9F2BL12sfYOidS/LtzzMP3VuE1aZPzkd0xhjTxPOC+EBhwpBPcOejvNaPkqEfk+9Wf4X214S0kIrFUmK3+JM6/eQvCEEh11CaNJbZmMYZH9FtTzoE3TkfHUg/M/lQSDRx8ZHMtxF3isUnReGx3L5IVISyD4oCOWDbZgcVCqko1sXH5RrFhSgblv4UPwQk0Ng2tYI2hk0Qk/CKBkLqtxahX2AkhEJnKw1miNZ0Hvnt9vtAraAMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACMlyWPTiSJ8bs9ECkUjg2DC1oTmdr/EIQEjnvY2+n4WQbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpAnemr5czm3rIjRiSyQRG9QACMJJm9i5TwRgkSYIAAAAEsqyxEljM42gsQYuocv89+RECcS8VrxK2vmmzQ1sACHoo6fT2sbRZ+3pnz11iUH7iaDbqdPSoWOWoQDUII1OK2LAQF2PT5R8SbmFW3oXejGEwWbhEaNDaP+iioiUcxwEqy7rHSTbiUiI68uJLjWgBxwwON1pf6bQG+5rFmRObKuCKrgSxbJpbu+wgw2sEZwRuHkBMxKqXYzT7ilBZ3KFVUyR45QiRp9Ron5HYv2LTD2V7Y9oppcOfqAY7bGMb0yQOBgAFAkBCDwAHAgABDAIAAAB4+CUAAAAAAAgGAAEAFQcJAQEJAQEBEQoEAgAABw0AAAAAnWC3GwAAAAD9CwYAAAMLFgcodamwRcUXD6LpPaeoJImBZqVWSs7Mr81afq5UuOqRRGdnBDEn3QIb8QsJAAAEFwcHAxYHCvsK50wbC59gAAALCwAABAwQEQUXDRYHCYg/D7rTmKikAAsGEBcLCwsOCALaiutPyRlmCwIXBAghhJPkl8BIWQsRAAQXDBAVEhMUAQsJCRgFEQ0Q2OC/G8yXZq9AQg8AAAAAAAkDAQAAAQkPAFF7InZlcnNpb24iOjAsImFjdGlvbiI6MCwiYW1vdW50QmVmb3JlRmVlcyI6IjEwMDAwMDAiLCJhbW91bnRBZnRlckZlZXMiOiIxMDAwMDAwIn0PADN7InZlcnNpb24iOjEsImFjdGlvbklkIjoiNmFlYTJhNmRjOTYyYzM3NjI4ODBjZGNkIn0B0/JvJLSWE/N93vfUYNjIAMOt4Of84iU5s/N1oXkRml4FPllg1dwEjwQCBQ==';

const KAMINO_USDC_DEPOSIT =
  'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAIDrIjEUw80bLre65s7T9F2BL12sfYOidS/LtzzMP3VuE15VPe4enSY5nyJHyfS68hnaCwrCLJd+EmIckGwcV3UIK14S0kIrFUmK3+JM6/eQvCEEh11CaNJbZmMYZH9FtTzoE3TkfHUg/M/lQSDRx8ZHMtxF3isUnReGx3L5IVISyD4oCOWDbZgcVCqko1sXH5RrFhSgblv4UPwQk0Ng2tYI1RZ2+LheVe0T1VrHstxaJ00vVg3aQp+otDh1eacLw0oQMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FkCd6avlzObesiNGJLJBEb1AAIwkmb2LlPBGCRJggAAAASyrLESWMzjaCxBi6hy/z35EQJxLxWvEra+abNDWwAIeijp9PaxtFn7emfPXWJQfuJoNup09KhY5ahANQgjU4rYsBAXY9PlHxJuYVbehd6MYTBZuERo0No/6KKiJRzHASrLusdJNuJSIjry4kuNaAHHDA43Wl/ptAb7msWZE5sq4IquBLFsmlu77CDDawRnBG4eQEzEqpdjNPuKUFncoVWCcX9h5Kx3si0m15E9WW1HQzoBsR+YOXwBNKSRwRiAvgsGAAUCQEIPAAcGAAEAExQVAQEIBAIAABQNAAAAAJ1gtxsAAAAA/QkGAAADCRYUKHWpsEXFFw+iPkKgLzlVXzJKWzDx7wtQXmQYEfGABBcdH2l0bI8cgtEJCQAABBcUFAMWFAr7CudMGwufYAAACQsAAAQKDg8FFwsWFAmIPw+605iopAAJBg4XCQkJDAgC2orrT8kZZgkCFwQIIYST5JfASFkJEQAEFwoOExAREgEJFRUYBQ8LENjgvxvMl2avQEIPAAAAAAANAFF7InZlcnNpb24iOjAsImFjdGlvbiI6MCwiYW1vdW50QmVmb3JlRmVlcyI6IjEwMDAwMDAiLCJhbW91bnRBZnRlckZlZXMiOiIxMDAwMDAwIn0NADN7InZlcnNpb24iOjEsImFjdGlvbklkIjoiNmFlYTJhNmRjOTYyYzM3NjI4ODBjZGY0In0B0/JvJLSWE/N93vfUYNjIAMOt4Of84iU5s/N1oXkRml4FlpeERIUGnggHBAIF';

const USER = key('user');
const SPONSOR = key('sponsor');
const PROTOCOL = key('protocol');
const VAULT_ACCOUNT = key('vault-account');
const ATTACKER = key('attacker');
const USER_USDC = ata(USER, USDC_MINT);
const USER_WSOL = ata(USER, WSOL_MINT);
const limit = { program: COMPUTE_BUDGET, accounts: [], data: [2, ...u32(200_000)] };
const price = { program: COMPUTE_BUDGET, accounts: [], data: [3, ...u64(1_000)] };
const protocolCall = { program: PROTOCOL, accounts: [USER, USER_USDC, VAULT_ACCOUNT], data: [9, 9, 9] };

function request(overrides) {
  return {
    id: 'req',
    kind: 'TX',
    status: 'PENDING',
    subOrgId: 'sub-org',
    activityId: null,
    fingerprint: null,
    intent: 'sign_and_send',
    refreshable: true,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    ...overrides,
  };
}

(async () => {
  const client = new sdk.PollarClient({
    apiKey: 'pk_smoke_cosign_third_party',
    storage: sdk.createMemoryAdapter(),
    baseUrl: 'https://x.test',
    stellarNetwork: 'testnet',
    logLevel: 'silent',
  });
  await client.ready();
  const verify = (r) => client.cosign.verify(request(r));

  console.log('\n-- 1. The EIP-7702 delegation --');
  const auth = {
    network: 'POLYGON',
    kind: 'EVM_AUTHORIZATION',
    signWith: WALLET,
    unsignedPayload: JSON.stringify({ chainId: 80002, address: DELEGATE, nonce: 7 }),
    payloadHash: AUTH_DIGEST,
    operation: 'evm_delegation',
    details: { chainId: 80002, address: DELEGATE, nonce: 7 },
  };
  const authOk = await verify(auth);
  check(
    'a delegation to Simple7702Account on Amoy is proposed as its digest, unhashed',
    authOk.ok &&
      authOk.proposal.path === '/public/v1/submit/sign_raw_payload' &&
      authOk.proposal.body.type === 'ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2' &&
      authOk.proposal.body.parameters.payload === AUTH_DIGEST &&
      authOk.proposal.body.parameters.hashFunction === 'HASH_FUNCTION_NO_OP' &&
      authOk.proposal.body.parameters.encoding === 'PAYLOAD_ENCODING_HEXADECIMAL' &&
      authOk.proposal.body.parameters.signWith === WALLET,
    authOk,
  );
  const nonceZero = await verify({
    ...auth,
    unsignedPayload: JSON.stringify({ chainId: 80002, address: DELEGATE, nonce: 0 }),
    payloadHash: AUTH_DIGEST_NONCE_0,
  });
  check('nonce 0 encodes as the empty string, as viem does', nonceZero.ok, nonceZero);
  check(
    'a 0x-prefixed payload hash compares the same',
    (await verify({ ...auth, payloadHash: `0x${AUTH_DIGEST}` })).ok === true,
  );
  const otherDelegate = await verify({
    ...auth,
    unsignedPayload: JSON.stringify({ chainId: 80002, address: VAULT, nonce: 7 }),
  });
  check(
    'a delegation to another contract is refused',
    !otherDelegate.ok && /delegate/.test(otherDelegate.reason),
    otherDelegate,
  );
  check(
    'a delegation on another chain is refused',
    !(await verify({ ...auth, unsignedPayload: JSON.stringify({ chainId: 137, address: DELEGATE, nonce: 7 }) })).ok,
  );
  check(
    'a delegation on chain 0 (valid on every chain) is refused',
    !(await verify({ ...auth, unsignedPayload: JSON.stringify({ chainId: 0, address: DELEGATE, nonce: 7 }) })).ok,
  );
  check('a digest that is not the tuple is refused', !(await verify({ ...auth, payloadHash: AUTH_DIGEST_NONCE_0 })).ok);
  check(
    'another nonce under the same digest is refused',
    !(await verify({ ...auth, unsignedPayload: JSON.stringify({ chainId: 80002, address: DELEGATE, nonce: 8 }) })).ok,
  );
  check('an unreadable tuple is refused', !(await verify({ ...auth, unsignedPayload: 'not json' })).ok);

  console.log('\n-- 2. An atomic EVM batch --');
  const batch = {
    network: 'POLYGON',
    signWith: WALLET,
    unsignedPayload: BATCH_TX,
    payloadHash: '00',
    operation: 'earn_deposit',
    details: { calls: BATCH_CALLS, to: WALLET.toLowerCase(), value: '0', data: BATCH_DATA },
  };
  const batchOk = await verify(batch);
  check(
    'a self-call to executeBatch with the stated calls is proposed as the transaction',
    batchOk.ok &&
      batchOk.proposal.path === '/public/v1/submit/sign_transaction' &&
      batchOk.proposal.body.parameters.type === 'TRANSACTION_TYPE_ETHEREUM' &&
      batchOk.proposal.body.parameters.unsignedTransaction === BATCH_TX.slice(2),
    batchOk,
  );
  const otherAmount = await verify({
    ...batch,
    details: { ...batch.details, calls: [{ ...BATCH_CALLS[0], data: APPROVE.replace(/16e360$/, '16e361') }, BATCH_CALLS[1]] },
  });
  check('a batch whose calls are not the stated ones is refused', !otherAmount.ok, otherAmount);
  check(
    'a batch stating fewer calls than it makes is refused',
    !(await verify({ ...batch, details: { ...batch.details, calls: [BATCH_CALLS[0]] } })).ok,
  );
  check(
    'a batch call to the wallet itself is refused',
    !(
      await verify({ ...batch, details: { ...batch.details, calls: [{ to: WALLET, value: '0', data: '0x' }, BATCH_CALLS[1]] } })
    ).ok,
  );
  check(
    'a batch call to the delegate is refused',
    !(await verify({ ...batch, details: { ...batch.details, calls: [{ to: DELEGATE, value: '0', data: '0x' }] } })).ok,
  );
  const notSelf = await verify({ ...batch, signWith: VAULT });
  check('a batch that is not the signing wallet calling itself is refused', !notSelf.ok, notSelf);
  check(
    'a batch without stated calls is refused',
    !(await verify({ ...batch, details: { to: WALLET.toLowerCase(), value: '0', data: BATCH_DATA } })).ok,
  );

  console.log('\n-- 3. Earn on Solana: the provider compiled it, the wallet pays its own fee --');
  const earnKeys = [USER, USER_USDC, VAULT_ACCOUNT, PROTOCOL, COMPUTE_BUDGET];
  const earnTx = (instructions, extra = {}) =>
    solanaTx({ signers: 1, readonlyUnsigned: 2, keys: earnKeys, instructions, ...extra });
  const earn = {
    network: 'SOLANA',
    signWith: USER,
    unsignedPayload: earnTx([limit, price, protocolCall]),
    payloadHash: '00',
    operation: 'earn_deposit',
    details: { action: 'deposit', amount: '1.5', assetCode: 'USDC', mint: USDC_MINT, feePayer: USER, sponsored: false },
  };
  const earnOk = await verify(earn);
  check(
    'a deposit calling the protocol from the user alone is proposed',
    earnOk.ok && earnOk.proposal.body.parameters.type === 'TRANSACTION_TYPE_SOLANA',
    earnOk,
  );
  check(
    'a withdrawal of the same shape is proposed',
    (await verify({ ...earn, operation: 'earn_withdraw', details: { ...earn.details, action: 'withdraw' } })).ok === true,
  );
  const lookupTables = await verify({
    ...earn,
    unsignedPayload: earnTx([limit, protocolCall], { lookups: [{ table: key('table'), writable: [1, 2] }] }),
  });
  check('lookup tables are read, not refused', lookupTables.ok, lookupTables);
  const drain = await verify({
    ...earn,
    unsignedPayload: solanaTx({
      signers: 1,
      readonlyUnsigned: 3,
      keys: [USER, ATTACKER, PROTOCOL, SYSTEM_PROGRAM, COMPUTE_BUDGET],
      instructions: [
        { program: PROTOCOL, accounts: [USER], data: [1] },
        { program: SYSTEM_PROGRAM, accounts: [USER, ATTACKER], data: [...u32(2), ...u64(5_000_000)] },
      ],
    }),
  });
  check('a SOL transfer to someone else beside the protocol is refused', !drain.ok, drain);
  const tokenOut = await verify({
    ...earn,
    unsignedPayload: solanaTx({
      signers: 1,
      readonlyUnsigned: 3,
      keys: [USER, USER_USDC, ATTACKER, USDC_MINT, PROTOCOL, TOKEN_PROGRAM],
      instructions: [
        { program: PROTOCOL, accounts: [USER], data: [1] },
        { program: TOKEN_PROGRAM, accounts: [USER_USDC, USDC_MINT, ATTACKER, USER], data: [12, ...u64(1_500_000), 6] },
      ],
    }),
  });
  check('a token transfer at the top level is refused', !tokenOut.ok, tokenOut);
  const thirdSigner = await verify({
    ...earn,
    unsignedPayload: solanaTx({
      signers: 2,
      readonlyUnsigned: 1,
      keys: [USER, ATTACKER, PROTOCOL],
      instructions: [{ program: PROTOCOL, accounts: [USER, ATTACKER], data: [1] }],
    }),
  });
  check('a deposit that needs another signer is refused', !thirdSigner.ok, thirdSigner);
  check(
    'an Earn transaction paid by another account is refused',
    !(await verify({ ...earn, details: { ...earn.details, feePayer: SPONSOR } })).ok,
  );
  check(
    'a transaction that calls no protocol is refused',
    !(await verify({ ...earn, unsignedPayload: earnTx([limit, price]) })).ok,
  );
  const expensive = await verify({
    ...earn,
    unsignedPayload: earnTx([limit, { program: COMPUTE_BUDGET, accounts: [], data: [3, ...u64(100_000_000)] }, protocolCall]),
  });
  check('a deposit whose fee can exceed the cap is refused', !expensive.ok, expensive);
  const wrapKeys = [USER, USER_WSOL, VAULT_ACCOUNT, PROTOCOL, SYSTEM_PROGRAM];
  const wrap = (lamports) =>
    solanaTx({
      signers: 1,
      readonlyUnsigned: 2,
      keys: wrapKeys,
      instructions: [
        { program: SYSTEM_PROGRAM, accounts: [USER, USER_WSOL], data: [...u32(2), ...u64(lamports)] },
        { program: PROTOCOL, accounts: [USER, USER_WSOL, VAULT_ACCOUNT], data: [1] },
      ],
    });
  const solDeposit = { ...earn, details: { ...earn.details, amount: '0.5', assetCode: 'SOL', mint: WSOL_MINT } };
  check(
    'a SOL deposit may wrap the amount it deposits',
    (await verify({ ...solDeposit, unsignedPayload: wrap(500_000_000) })).ok === true,
  );
  check(
    'a SOL deposit that wraps more than its amount is refused',
    !(await verify({ ...solDeposit, unsignedPayload: wrap(500_000_001) })).ok,
  );
  check(
    'a withdrawal that wraps SOL is refused',
    !(await verify({ ...solDeposit, operation: 'earn_withdraw', unsignedPayload: wrap(1) })).ok,
  );
  const wrapAndClose = (lamports, closeTo = USER) =>
    solanaTx({
      signers: 1,
      readonlyUnsigned: 3,
      keys: [USER, USER_WSOL, VAULT_ACCOUNT, PROTOCOL, SYSTEM_PROGRAM, TOKEN_PROGRAM],
      instructions: [
        { program: SYSTEM_PROGRAM, accounts: [USER, USER_WSOL], data: [...u32(2), ...u64(lamports)] },
        { program: PROTOCOL, accounts: [USER, USER_WSOL, VAULT_ACCOUNT], data: [1] },
        { program: TOKEN_PROGRAM, accounts: [USER_WSOL, closeTo, USER], data: [9] },
      ],
    });
  check(
    'a SOL deposit that closes its wrapped account back to the user may wrap up to 0.005 SOL of rent past its amount',
    (await verify({ ...solDeposit, unsignedPayload: wrapAndClose(505_000_000) })).ok === true,
  );
  check(
    'a surplus past 0.005 SOL is refused even when the wrapped account is closed',
    !(await verify({ ...solDeposit, unsignedPayload: wrapAndClose(505_000_001) })).ok,
  );
  check(
    'closing the wrapped account to someone else earns no surplus',
    !(await verify({ ...solDeposit, unsignedPayload: wrapAndClose(500_000_001, VAULT_ACCOUNT) })).ok,
  );
  // The Kamino SOL deposit Pods built on 2026-11-03 for 0.001 SOL: it wraps 2,488,440 lamports and closes the account.
  const kamino = Buffer.from(KAMINO_SOL_DEPOSIT, 'base64').toString('hex');
  const kaminoUser = 'CzNat3HpKWPiYc9BmitKodWmeW3S6yamE5USioonmXxQ';
  const kaminoRequest = {
    ...earn,
    signWith: kaminoUser,
    unsignedPayload: kamino,
    details: { action: 'deposit', amount: '0.001', assetCode: 'SOL', mint: WSOL_MINT, feePayer: kaminoUser, sponsored: false },
  };
  const kaminoOk = await verify(kaminoRequest);
  check('the real Kamino SOL deposit from Pods is proposed', kaminoOk.ok, kaminoOk);
  const kaminoUsdc = await verify({
    ...kaminoRequest,
    unsignedPayload: Buffer.from(KAMINO_USDC_DEPOSIT, 'base64').toString('hex'),
    details: { ...kaminoRequest.details, amount: '1', assetCode: 'USDC', mint: USDC_MINT },
  });
  check('the real Kamino USDC deposit from Pods is proposed', kaminoUsdc.ok, kaminoUsdc);
  check(
    'the same transaction presented as a withdrawal is refused: a withdrawal wraps no SOL',
    !(await verify({ ...kaminoRequest, operation: 'earn_withdraw', details: { ...kaminoRequest.details, action: 'withdraw' } }))
      .ok,
  );

  console.log('\n-- 4. A swap on the multichain venue, fee paid by the app --');
  const swapKeys = [SPONSOR, USER, USER_USDC, VAULT_ACCOUNT, PROTOCOL, COMPUTE_BUDGET];
  const swap = {
    network: 'SOLANA',
    signWith: USER,
    unsignedPayload: solanaTx({ signers: 2, readonlyUnsigned: 2, keys: swapKeys, instructions: [limit, protocolCall] }),
    payloadHash: '00',
    operation: 'swap',
    details: {
      provider: 'multichain',
      inputMint: USDC_MINT,
      outputMint: USDC_POLYGON,
      inAmount: '1500000',
      outAmount: '1490000',
      minOut: '1480000',
      feePayer: SPONSOR,
      sponsored: true,
      destinationChain: 'POLYGON',
      destinationAddress: WALLET,
    },
  };
  const swapOk = await verify(swap);
  check('a cross-chain swap through the venue, paid by the app, is proposed', swapOk.ok, swapOk);
  const asAggregator = await verify({ ...swap, details: { ...swap.details, provider: 'jupiter' } });
  check('the same transaction declared as a Jupiter swap is refused: it calls no known router', !asAggregator.ok, asAggregator);
  check(
    'a swap whose fee is paid by an account the request does not name is refused',
    !(await verify({ ...swap, details: { ...swap.details, feePayer: USER } })).ok,
  );
  check(
    'a swap without its amount is refused',
    !(await verify({ ...swap, details: { ...swap.details, inAmount: undefined } })).ok,
  );

  console.log('\n-- 5. A ramp sale the provider built, the app paying the fee --');
  const DESTINATION = key('provider-deposit');
  const destinationAta = ata(DESTINATION, USDC_MINT);
  const sale = (amount) =>
    solanaTx({
      signers: 2,
      readonlyUnsigned: 3,
      keys: [SPONSOR, USER, USER_USDC, destinationAta, USDC_MINT, TOKEN_PROGRAM, COMPUTE_BUDGET],
      instructions: [
        limit,
        price,
        { program: TOKEN_PROGRAM, accounts: [USER_USDC, USDC_MINT, destinationAta, USER], data: [12, ...u64(amount), 6] },
      ],
    });
  const saleRequest = {
    network: 'SOLANA',
    signWith: USER,
    unsignedPayload: sale(25_000_000),
    payloadHash: '00',
    operation: 'transfer',
    details: { destination: DESTINATION, amount: '25000000', mint: USDC_MINT, decimals: 6, symbol: 'USDC', sponsored: true },
  };
  const saleOk = await verify(saleRequest);
  check('the sale is read as the one transfer it states, with the sponsor first', saleOk.ok, saleOk);
  check('a sale moving another amount is refused', !(await verify({ ...saleRequest, unsignedPayload: sale(25_000_001) })).ok);
  check(
    'a sale to another destination is refused',
    !(await verify({ ...saleRequest, details: { ...saleRequest.details, destination: ATTACKER } })).ok,
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
