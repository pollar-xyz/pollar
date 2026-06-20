import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account, Asset, BASE_FEE, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import type { Operation as StellarOperation, Transaction } from '@stellar/stellar-sdk';
import { validateTxOperations } from '../src/stellar.ts';

// The operation allowlist is the only place per-operation policy can be enforced
// (Privy `rawSign` only ever sees the tx hash), so these tests exercise the gate
// the way `/wallets/sign` calls it: a parsed Transaction + the configured policy.
//
// `validateTxOperations` returning `{ ok: true }` is what lets the route proceed
// to signing (HTTP 200); `{ ok: false }` is what the route maps to
// `TX_OPERATION_NOT_ALLOWED` / HTTP 403.

const source = Keypair.random();
const issuer = Keypair.random();
const counterparty = Keypair.random();

const buildTx = (ops: StellarOperation[]): Transaction => {
  // Fresh Account each build so the sequence number never collides.
  const account = new Account(source.publicKey(), '0');
  const builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET });
  for (const op of ops) builder.addOperation(op);
  return builder.setTimeout(30).build();
};

const changeTrust = () => Operation.changeTrust({ asset: new Asset('USDC', issuer.publicKey()) });
const payment = () => Operation.payment({ destination: counterparty.publicKey(), asset: Asset.native(), amount: '1' });
const beginSponsoring = () => Operation.beginSponsoringFutureReserves({ sponsoredId: counterparty.publicKey() });
const endSponsoring = () => Operation.endSponsoringFutureReserves({ source: counterparty.publicKey() });

const TRUSTLINES = { restrictToTrustlines: true } as const;

test('restrictToTrustlines: a single changeTrust is allowed (would sign, 200)', () => {
  const result = validateTxOperations(buildTx([changeTrust()]), TRUSTLINES);
  assert.equal(result.ok, true);
});

test('restrictToTrustlines: changeTrust wrapped in the sponsorship sandwich is allowed (200)', () => {
  const tx = buildTx([beginSponsoring(), changeTrust(), endSponsoring()]);
  const result = validateTxOperations(tx, TRUSTLINES);
  assert.equal(result.ok, true);
});

test('restrictToTrustlines: a payment is rejected (403 TX_OPERATION_NOT_ALLOWED)', () => {
  const result = validateTxOperations(buildTx([payment()]), TRUSTLINES);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /payment/);
});

test('restrictToTrustlines: changeTrust mixed with a payment is rejected (403)', () => {
  const result = validateTxOperations(buildTx([changeTrust(), payment()]), TRUSTLINES);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /payment/);
});

test('restrictToTrustlines: sponsorship sandwich without any changeTrust is rejected (403)', () => {
  // Every op is in the trustline preset, but the changeTrust requirement fails.
  const result = validateTxOperations(buildTx([beginSponsoring(), endSponsoring()]), TRUSTLINES);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /changeTrust/);
});

test('no policy configured: any non-fee-bump op is allowed (legacy behavior)', () => {
  assert.equal(validateTxOperations(buildTx([payment()]), {}).ok, true);
  assert.equal(validateTxOperations(buildTx([payment()]), { allowedOperations: undefined }).ok, true);
});

test('allowedOperations allowlist: listed ops pass, unlisted ops fail', () => {
  const policy = { allowedOperations: ['changeTrust'] };
  assert.equal(validateTxOperations(buildTx([changeTrust()]), policy).ok, true);

  const rejected = validateTxOperations(buildTx([payment()]), policy);
  assert.equal(rejected.ok, false);
  assert.match(rejected.reason ?? '', /payment/);
});

test('precedence: allowedOperations and restrictToTrustlines union, changeTrust still required', () => {
  // Union means a payment is now allowed alongside the trustline preset...
  const policy = { allowedOperations: ['payment'], restrictToTrustlines: true };
  assert.equal(validateTxOperations(buildTx([changeTrust(), payment()]), policy).ok, true);

  // ...but the restrictToTrustlines changeTrust requirement still applies.
  const noTrustline = validateTxOperations(buildTx([payment()]), policy);
  assert.equal(noTrustline.ok, false);
  assert.match(noTrustline.reason ?? '', /changeTrust/);
});
