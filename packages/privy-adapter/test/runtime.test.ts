import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account, Asset, BASE_FEE, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';
import { buildPrivyAdapter, type PrivyRuntime } from '../src/runtime.ts';
import { PrivyAdapterUnsupportedError } from '../src/environment.ts';

// These tests exercise the framework-agnostic core (`buildPrivyAdapter`) with a
// MOCK PrivyRuntime — no Privy SDK, no app id, no browser. The mock stands in for
// what the web/RN bridge would attach; a real Stellar keypair plays the role of
// Privy's `signRawHash`, so we can prove the adapter emits a cryptographically
// valid Stellar signature without any Privy infrastructure.

const PASSPHRASE = Networks.TESTNET;
const kp = Keypair.random();

function buildTxXdr(): string {
  // Fresh Account each call so the sequence number never collides.
  const account = new Account(kp.publicKey(), '0');
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' }))
    .setTimeout(30)
    .build();
  return tx.toXDR();
}

/** A mock runtime whose `signRawHash` signs the tx hash with `kp` (ed25519). */
function mockRuntime(overrides: Partial<PrivyRuntime> = {}): PrivyRuntime {
  return {
    sendEmailCode: async () => {},
    verifyEmailCode: async () => {},
    loginWithOAuth: async () => {},
    ensureStellarWallet: async () => kp.publicKey(),
    signRawHash: async (_address, hashHex) => kp.sign(Buffer.from(hashHex, 'hex')).toString('hex'),
    getAddress: () => kp.publicKey(),
    logout: async () => {},
    ...overrides,
  };
}

test('adapter metadata + auth options', () => {
  const adapter = buildPrivyAdapter({ appId: 'app', loginMethods: ['email', 'google', 'github'] });
  assert.equal(adapter.type, 'privy');
  assert.equal(adapter.custody, 'external');
  assert.deepEqual(adapter.meta, { label: 'Privy' });
  assert.deepEqual(adapter.getAuthOptions(), ['email', 'google', 'github']);
});

test('meta is overridable via config', () => {
  const adapter = buildPrivyAdapter({ appId: 'app', loginMethods: ['email'], meta: { label: 'Sign in', iconUrl: 'x' } });
  assert.deepEqual(adapter.meta, { label: 'Sign in', iconUrl: 'x' });
});

test('signTransaction produces a valid Stellar signature via the runtime', async () => {
  const adapter = buildPrivyAdapter({ appId: 'app', loginMethods: ['email'] });
  adapter._attachRuntime(mockRuntime());

  const { signedTxXdr } = await adapter.signTransaction(buildTxXdr(), { networkPassphrase: PASSPHRASE });

  const signed = TransactionBuilder.fromXDR(signedTxXdr, PASSPHRASE) as Transaction;
  assert.equal(signed.signatures.length, 1);
  const sig = signed.signatures[0]!;
  // The decorated signature must verify against the original tx hash + keypair,
  // and carry the keypair's hint — i.e. it is exactly what `tx.sign(kp)` yields.
  assert.ok(kp.verify(signed.hash(), sig.signature()), 'signature verifies against the tx hash');
  assert.deepEqual(sig.hint(), kp.signatureHint(), 'decorated signature carries the keypair hint');
});

test('signTransaction requires a networkPassphrase', async () => {
  const adapter = buildPrivyAdapter({ appId: 'app', loginMethods: ['email'] });
  adapter._attachRuntime(mockRuntime());
  await assert.rejects(() => adapter.signTransaction(buildTxXdr()), /networkPassphrase/);
});

test('signTransaction rejects fee-bump transactions', async () => {
  const adapter = buildPrivyAdapter({ appId: 'app', loginMethods: ['email'] });
  adapter._attachRuntime(mockRuntime());

  const inner = TransactionBuilder.fromXDR(buildTxXdr(), PASSPHRASE) as Transaction;
  inner.sign(kp);
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(kp, (Number(BASE_FEE) * 2).toString(), inner, PASSPHRASE);

  await assert.rejects(() => adapter.signTransaction(feeBump.toXDR(), { networkPassphrase: PASSPHRASE }), /fee-bump/);
});

test('signAuthEntry is not supported for external wallets', async () => {
  const adapter = buildPrivyAdapter({ appId: 'app', loginMethods: ['email'] });
  adapter._attachRuntime(mockRuntime());
  await assert.rejects(() => adapter.signAuthEntry('AAAA'), /not supported/);
});

test('interactive + lifecycle methods delegate to the runtime', async () => {
  const calls: string[] = [];
  const adapter = buildPrivyAdapter({ appId: 'app', loginMethods: ['email', 'google'] });
  adapter._attachRuntime(
    mockRuntime({
      sendEmailCode: async (e) => void calls.push(`send:${e}`),
      verifyEmailCode: async (c) => void calls.push(`verify:${c}`),
      loginWithOAuth: async (p) => void calls.push(`oauth:${p}`),
      ensureStellarWallet: async () => {
        calls.push('ensure');
        return kp.publicKey();
      },
      logout: async () => void calls.push('logout'),
    }),
  );

  await adapter.sendEmailCode('a@b.com');
  await adapter.verifyEmailCode('123456');
  await adapter.loginWithOAuth('google');
  const { address } = await adapter.connect();
  assert.equal(await adapter.getPublicKey(), kp.publicKey());
  await adapter.disconnect();

  assert.deepEqual(calls, ['send:a@b.com', 'verify:123456', 'oauth:google', 'ensure', 'logout']);
  assert.equal(address, kp.publicKey());
});

test('getPublicKey is null before a runtime attaches', async () => {
  const adapter = buildPrivyAdapter({ appId: 'app', loginMethods: ['email'] });
  assert.equal(await adapter.getPublicKey(), null);
});

test('throws PrivyAdapterUnsupportedError when no runtime ever attaches', async () => {
  // No bridge mounts (e.g. Angular/Vue). The method waits for the attach timeout
  // and then fails clearly. ~5s by design — the only slow test here.
  const adapter = buildPrivyAdapter({ appId: 'app', loginMethods: ['email'] });
  await assert.rejects(
    () => adapter.signTransaction(buildTxXdr(), { networkPassphrase: PASSPHRASE }),
    PrivyAdapterUnsupportedError,
  );
});
