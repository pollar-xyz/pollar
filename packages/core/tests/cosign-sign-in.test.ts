// A provider's sign-in (SEP-10) is recognized from the transaction itself, never
// from the server's label: sequence 0 and data entries only, the first one this
// account's. Anything the network could accept, or that does more, is not one.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { recognizedSignInRequest } from '../src/cosign/recognize';
import type { CosignRequest } from '../src/types';

const anchor = Keypair.random();
const wallet = Keypair.random();
const turnkey = Keypair.random();

const challenge = (account = wallet.publicKey()) =>
  WebAuth.buildChallengeTx(anchor, account, 'anchor.invalid', 300, Networks.PUBLIC, 'auth.anchor.invalid');

const request = (unsignedPayload: string, extra: Record<string, unknown> = {}) =>
  ({
    id: 'sign-in',
    status: 'PENDING',
    kind: 'SEP10',
    network: 'STELLAR',
    intent: 'sign',
    operation: 'provider_sign_in',
    signWith: wallet.publicKey(),
    unsignedPayload,
    ...extra,
  }) as unknown as CosignRequest;

test("an anchor's challenge for this wallet is a sign-in, also when a migrated wallet's Turnkey key signs it", () => {
  assert.equal(recognizedSignInRequest(request(challenge())).ok, true);
  assert.equal(
    recognizedSignInRequest(request(challenge(), { signWith: turnkey.publicKey(), account: wallet.publicKey() })).ok,
    true,
  );
});

test('a challenge for another account, a request labelled otherwise or one already decided is not', () => {
  assert.equal(recognizedSignInRequest(request(challenge(Keypair.random().publicKey()))).ok, false);
  assert.equal(recognizedSignInRequest(request(challenge(), { kind: 'TX' })).ok, false);
  assert.equal(recognizedSignInRequest(request(challenge(), { status: 'APPROVED' })).ok, false);
});

test('a transaction the network could accept, or one that moves funds, is never a sign-in', () => {
  const payment = (sequence: string) =>
    new TransactionBuilder(new Account(wallet.publicKey(), sequence), { fee: '100', networkPassphrase: Networks.PUBLIC })
      .addOperation(Operation.payment({ destination: anchor.publicKey(), asset: Asset.native(), amount: '1' }))
      .setTimeout(300)
      .build()
      .toXDR();
  // A sequence of -1 builds a transaction with sequence 0: still a payment, still refused.
  assert.equal(recognizedSignInRequest(request(payment('-1'))).ok, false);
  assert.equal(recognizedSignInRequest(request(payment('41'))).ok, false);

  const data = new TransactionBuilder(new Account(wallet.publicKey(), '41'), { fee: '100', networkPassphrase: Networks.PUBLIC })
    .addOperation(Operation.manageData({ name: 'anchor.invalid auth', value: 'x'.repeat(48), source: wallet.publicKey() }))
    .setTimeout(300)
    .build()
    .toXDR();
  assert.equal(recognizedSignInRequest(request(data)).ok, false);
});
