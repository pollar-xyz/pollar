// @pollar smoke test - assertRampStellarSigner reads a Stellar ramp transaction
// without a Stellar library and lets the user's wallet sign only what spends
// from the user's own account. The fixtures are built with @stellar/stellar-sdk,
// which the tests use and core does not.
//
// Run with `node tests/smoke-ramp-stellar-signing.cjs` after `npm run build`.
const assert = require('node:assert/strict');
const {
  Account,
  Asset,
  Keypair,
  Memo,
  MuxedAccount,
  Networks,
  Operation,
  TransactionBuilder,
  WebAuth,
  xdr,
} = require('@stellar/stellar-sdk');
const { assertRampStellarSigner } = require('../packages/core/dist/index.js');

const user = Keypair.random();
const other = Keypair.random();
const anchor = Keypair.random();
const usdc = new Asset('USDC', other.publicKey());
const network = Networks.TESTNET;

const build = (source, ops, { memo } = {}) => {
  const account = typeof source === 'string' ? new Account(source, '41') : source;
  let builder = new TransactionBuilder(account, { fee: '100', networkPassphrase: network });
  for (const op of ops) builder = builder.addOperation(op);
  if (memo) builder = builder.addMemo(memo);
  return builder.setTimeout(300).build();
};
const action = (envelope, summary = 'payment') => ({
  kind: 'SIGNATURE',
  actionId: 'a',
  legIndex: 0,
  chain: 'STELLAR',
  payload: { encoding: 'xdr', value: typeof envelope === 'string' ? envelope : envelope.toXDR() },
  summary,
  expiresAt: '2099-01-01T00:00:00Z',
});
const ok = (envelope, summary, address = user.publicKey()) => assertRampStellarSigner(action(envelope, summary), address);
const refused = (envelope, summary, address = user.publicKey()) =>
  assert.throws(() => ok(envelope, summary, address), /not for the connected Stellar account/);
const payment = (source) =>
  Operation.payment({ destination: anchor.publicKey(), asset: usdc, amount: '10', ...(source ? { source } : {}) });

// A payment from the user, with a text memo and time bounds: signs.
const pay = build(user.publicKey(), [payment()], { memo: Memo.text('order-123') });
ok(pay);
// From another account, or with one operation that runs as another account: refused.
refused(build(other.publicKey(), [payment()]));
refused(build(user.publicKey(), [payment(other.publicKey())]));
refused(pay, 'payment', other.publicKey());
// Several operations whose bodies are skipped on the way to the last one.
ok(
  build(user.publicKey(), [
    Operation.changeTrust({ asset: usdc }),
    Operation.pathPaymentStrictSend({
      sendAsset: Asset.native(),
      sendAmount: '1',
      destination: user.publicKey(),
      destAsset: usdc,
      destMin: '0.1',
      path: [usdc],
    }),
    Operation.createAccount({ destination: anchor.publicKey(), startingBalance: '1' }),
    Operation.manageData({ name: 'ref', value: 'x' }),
    payment(),
  ]),
);
refused(build(user.publicKey(), [Operation.changeTrust({ asset: usdc }), payment(other.publicKey())]));
// An operation a ramp step never sends cannot be skipped, so nothing after it can be read: refused.
refused(build(user.publicKey(), [Operation.setOptions({ homeDomain: 'x.test' }), payment()]));
// The app's fee bump around the user's payment, and a muxed source of the user's account: sign.
ok(TransactionBuilder.buildFeeBumpTransaction(other, '200', pay, network));
ok(build(new MuxedAccount(new Account(user.publicKey(), '41'), '7'), [payment()]));
// A Soroban call: one operation from the user; its body is never read.
ok(
  build(user.publicKey(), [
    Operation.invokeContractFunction({
      contract: 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE',
      function: 'approve',
      args: [],
    }),
  ]),
);
// The same transaction as a v0 envelope.
const tx = pay.toEnvelope().v1().tx();
const v0 = xdr.TransactionEnvelope.envelopeTypeTxV0(
  new xdr.TransactionV0Envelope({
    tx: new xdr.TransactionV0({
      sourceAccountEd25519: user.rawPublicKey(),
      fee: tx.fee(),
      seqNum: tx.seqNum(),
      timeBounds: tx.cond().timeBounds(),
      memo: tx.memo(),
      operations: tx.operations(),
      ext: new xdr.TransactionV0Ext(0),
    }),
    signatures: [],
  }),
).toXDR('base64');
ok(v0);

// A SEP-10 login: the anchor's challenge, first data entry from the user.
const challenge = WebAuth.buildChallengeTx(anchor, user.publicKey(), 'anchor.test', 300, network, 'auth.anchor.test');
ok(challenge, 'authentication');
refused(challenge, 'payment', user.publicKey()); // the anchor is its source: never a payment
refused(challenge, 'authentication', other.publicKey());
refused(pay, 'authentication');
const challengeTx = TransactionBuilder.fromXDR(challenge, network);
refused(TransactionBuilder.buildFeeBumpTransaction(other, '200', challengeTx, network), 'authentication');

// Unreadable input is refused, never let through.
refused('AAAA');
refused(pay.toXDR().slice(0, 60));
refused(pay, 'payment', `${user.publicKey().slice(0, 55)}A`);
refused(pay, 'payment', 'not-an-address');

console.log(
  'Ramp Stellar signing: sources read without a library; payments, fee bumps, muxed, Soroban, v0 and SEP-10 checked.',
);
