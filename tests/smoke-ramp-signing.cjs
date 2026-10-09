const assert = require('node:assert/strict');
const { Account, Keypair, Networks, Operation, Asset, TransactionBuilder } = require('@stellar/stellar-base');
const wallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const other = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const server = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();
function payment(source, operationSource) {
  return new TransactionBuilder(new Account(source, '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(
      Operation.payment({
        destination: server,
        asset: Asset.native(),
        amount: '1',
        ...(operationSource ? { source: operationSource } : {}),
      }),
    )
    .setTimeout(30)
    .build();
}
function challenge(source) {
  return new TransactionBuilder(new Account(server, '-1'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.manageData({ name: 'fixture auth', value: Buffer.alloc(48).toString('base64'), source }))
    .addOperation(Operation.manageData({ name: 'web_auth_domain', value: 'fixture.invalid', source: server }))
    .setTimeout(30)
    .build()
    .toXDR();
}
const matchingPayment = payment(wallet);
const cases = [
  ['payment', 'withdrawal_payment', matchingPayment.toXDR(), true],
  ['other transaction source', 'withdrawal_payment', payment(other).toXDR(), false],
  ['other operation source', 'withdrawal_payment', payment(wallet, other).toXDR(), false],
  [
    'fee bump',
    'onramp_claim',
    TransactionBuilder.buildFeeBumpTransaction(server, '100', matchingPayment, Networks.TESTNET).toXDR(),
    true,
  ],
  [
    'fee bump with other inner source',
    'onramp_claim',
    TransactionBuilder.buildFeeBumpTransaction(server, '100', payment(other), Networks.TESTNET).toXDR(),
    false,
  ],
  ['SEP-10', 'authentication', challenge(wallet), true],
  ['SEP-10 for another wallet', 'authentication', challenge(other), false],
  ['payment disguised as authentication', 'authentication', matchingPayment.toXDR(), false],
  ['malformed envelope', 'withdrawal_payment', 'invalid-xdr', false],
];
(async () => {
  for (const entry of ['index.js', 'index.rn.js']) {
    const { PollarClient } = require('../packages/core/dist/' + entry);
    const client = new PollarClient({ apiKey: 'fixture', logLevel: 'silent' });
    client.destroy();
    let signs = 0,
      continuations = 0;
    client.getWallet = () => ({ address: wallet, chain: 'STELLAR' });
    client.getNetwork = () => 'testnet';
    client.signTx = async () => {
      signs++;
      return { status: 'signed', signedXdr: 'signed' };
    };
    client.continueRamp = async () => {
      continuations++;
      return {};
    };
    const originalBuffer = globalThis.Buffer;
    // Native does not provide a global Buffer or self. The bundled parser must stand alone.
    if (entry === 'index.rn.js') globalThis.Buffer = undefined;
    try {
      for (const [name, purpose, value, allowed] of cases) {
        const snapshot = {
          txId: 'fixture',
          status: 'pending',
          transactionVersion: 1,
          nextAction: {
            kind: 'sign_transaction',
            actionId: name,
            chain: 'STELLAR',
            network: 'testnet',
            purpose,
            payload: { encoding: 'xdr', value },
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
        };
        client.getRampTransaction = async () => snapshot;
        const before = signs;
        if (allowed) await client.signRampAction(snapshot.txId, snapshot);
        else await assert.rejects(client.signRampAction(snapshot.txId, snapshot), /wallet account required/, name);
        assert.equal(signs, before + Number(allowed), name);
      }
      assert.equal(signs, 3);
      assert.equal(continuations, 3);
      const current = await client.getRampTransaction();
      const valid = { ...current, nextAction: { ...current.nextAction, payload: { encoding: 'xdr', value: cases[0][2] } } };
      client.getRampTransaction = async () => valid;
      client.signTx = async () => ({ status: 'error', details: 'Wallet declined the request' });
      await assert.rejects(client.signRampAction(valid.txId, valid), /Wallet declined the request/);
      assert.equal(continuations, 3);
      let walletReads = 0;
      client.getWallet = () => ({ address: ++walletReads === 1 ? wallet : other, chain: 'STELLAR' });
      await assert.rejects(client.signRampAction(valid.txId, valid), /connected wallet changed/);
      client.getWallet = () => ({ address: wallet, chain: 'STELLAR' });
      client.getNetwork = () => 'mainnet';
      await assert.rejects(client.signRampAction(valid.txId, valid), /wallet and network required/);
    } finally {
      globalThis.Buffer = originalBuffer;
    }
  }
  console.log(
    'Ramp Stellar signing: account binding, SEP-10, fee bumps, cancellation details and native Buffer independence passed.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
