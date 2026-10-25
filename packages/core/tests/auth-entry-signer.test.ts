// client.stellar.authEntrySigner() is the SEP-43 signer stellar-sdk and x402 sign
// Soroban auth with. stellar-sdk hands it a preimage and wants the raw signature;
// Pollar signs the whole entry. These run the signer the way stellar-sdk does and
// check the signature stellar-sdk itself verifies.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Address, authorizeEntry, Keypair, nativeToScVal, Networks, xdr } from '@stellar/stellar-sdk';
import { completeAuthEntryStep, isAuthEntryAdapterStep } from '../src/adapter-steps';
import { createAuthEntrySigner, entryFromAuthPreimage, signatureOfSignedEntry } from '../src/stellar/auth-entry-signer';
import type { SignAuthEntryOutcome } from '../src/types';

const user = Keypair.random();
const USDC_SAC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
const PAY_TO = Keypair.random().publicKey();
const VALID_UNTIL = 1100;

/** The unsigned entry x402's ExactStellarScheme gets back from simulating a USDC transfer. */
function simulatedEntry(): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(user.publicKey()).toScAddress(),
        nonce: new xdr.Int64(7),
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(USDC_SAC).toScAddress(),
          functionName: 'transfer',
          args: [
            nativeToScVal(user.publicKey(), { type: 'address' }),
            nativeToScVal(PAY_TO, { type: 'address' }),
            nativeToScVal(10000n, { type: 'i128' }),
          ],
        }),
      ),
      subInvocations: [],
    }),
  });
}

/** What sdk-api does with the entry: sign it as the account, with the expiration asked for. */
function backend(calls: Array<{ entryXdr: string; validUntilLedger: number }>) {
  return async (entryXdr: string, options: { validUntilLedger: number }): Promise<SignAuthEntryOutcome> => {
    calls.push({ entryXdr, ...options });
    const signed = await authorizeEntry(
      xdr.SorobanAuthorizationEntry.fromXDR(entryXdr, 'base64'),
      user,
      options.validUntilLedger,
      Networks.PUBLIC,
    );
    return { status: 'signed', signedAuthEntry: signed.toXDR('base64') };
  };
}

function signerWith(sign: (entryXdr: string, o: { validUntilLedger: number }) => Promise<SignAuthEntryOutcome>) {
  return createAuthEntrySigner({ address: () => user.publicKey(), networkPassphrase: () => Networks.PUBLIC, sign });
}

test('stellar-sdk signs through the signer, and the signature it gets back verifies', async () => {
  const calls: Array<{ entryXdr: string; validUntilLedger: number }> = [];
  const signer = signerWith(backend(calls));
  // Exactly what AssembledTransaction.signAuthEntries does with a SEP-43 signer.
  const signed = await authorizeEntry(
    simulatedEntry(),
    async (preimage) => {
      const { signedAuthEntry } = await signer.signAuthEntry(preimage.toXDR('base64'), { address: user.publicKey() });
      return Buffer.from(signedAuthEntry, 'base64');
    },
    VALID_UNTIL,
    Networks.PUBLIC,
  );
  assert.equal(signed.credentials().address().signatureExpirationLedger(), VALID_UNTIL);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.validUntilLedger, VALID_UNTIL, 'the expiration the preimage binds is the one asked for');
  const sent = xdr.SorobanAuthorizationEntry.fromXDR(calls[0]!.entryXdr, 'base64');
  assert.equal(sent.rootInvocation().toXDR('base64'), simulatedEntry().rootInvocation().toXDR('base64'));
  assert.equal(sent.credentials().address().nonce().toString(), '7');
});

test('the entry rebuilt from a preimage is the entry the preimage came from', () => {
  const entry = simulatedEntry();
  entry.credentials().address().signatureExpirationLedger(VALID_UNTIL);
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: Buffer.alloc(32, 1),
      nonce: entry.credentials().address().nonce(),
      signatureExpirationLedger: VALID_UNTIL,
      invocation: entry.rootInvocation(),
    }),
  );
  const rebuilt = entryFromAuthPreimage(preimage.toXDR('base64'), user.publicKey());
  assert.equal(rebuilt.entryXdr, entry.toXDR('base64'));
  assert.equal(rebuilt.validUntilLedger, VALID_UNTIL);
});

test('the signature is read out of the signed entry stellar-sdk writes', async () => {
  const signed = await authorizeEntry(simulatedEntry(), user, VALID_UNTIL, Networks.PUBLIC);
  const out = signatureOfSignedEntry(signed.toXDR('base64'));
  assert.equal(out.validUntilLedger, VALID_UNTIL);
  assert.equal(out.signature.length, 64);
});

test('a preimage for another network is refused before anything is signed', async () => {
  const calls: Array<{ entryXdr: string; validUntilLedger: number }> = [];
  const signer = signerWith(backend(calls));
  await assert.rejects(
    authorizeEntry(
      simulatedEntry(),
      async (preimage) => Buffer.from((await signer.signAuthEntry(preimage.toXDR('base64'))).signedAuthEntry, 'base64'),
      VALID_UNTIL,
      Networks.TESTNET,
    ),
    /another network/,
  );
  assert.equal(calls.length, 0);
});

test('an entry signed to another expiration is refused: its signature would cover another hash', async () => {
  const signer = signerWith(async (entryXdr, options) => {
    const signed = await authorizeEntry(
      xdr.SorobanAuthorizationEntry.fromXDR(entryXdr, 'base64'),
      user,
      options.validUntilLedger - 10,
      Networks.PUBLIC,
    );
    return { status: 'signed', signedAuthEntry: signed.toXDR('base64') };
  });
  await assert.rejects(
    authorizeEntry(
      simulatedEntry(),
      async (preimage) => Buffer.from((await signer.signAuthEntry(preimage.toXDR('base64'))).signedAuthEntry, 'base64'),
      VALID_UNTIL,
      Networks.PUBLIC,
    ),
    /expire at ledger/,
  );
});

test('a refusal or a pending vote reaches the caller as an error, never as a signature', async () => {
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(Networks.PUBLIC))),
      nonce: new xdr.Int64(7),
      signatureExpirationLedger: VALID_UNTIL,
      invocation: simulatedEntry().rootInvocation(),
    }),
  ).toXDR('base64');
  const refused = signerWith(async () => ({ status: 'error', code: 'SOROBAN_AUTH_FUNCTION_NOT_ALLOWED' }));
  await assert.rejects(refused.signAuthEntry(preimage), /SOROBAN_AUTH_FUNCTION_NOT_ALLOWED/);
  const pending = signerWith(async () => ({ status: 'cosign_pending', request: { id: 'req-9' } as never }));
  await assert.rejects(pending.signAuthEntry(preimage), /not approved .*req-9/);
});

test('an entry handed directly is signed with the expiration the signer computes', async () => {
  const calls: Array<{ entryXdr: string; validUntilLedger: number }> = [];
  const signer = createAuthEntrySigner(
    { address: () => user.publicKey(), networkPassphrase: () => Networks.PUBLIC, sign: backend(calls) },
    { validUntilLedger: async () => VALID_UNTIL + 5 },
  );
  const out = await signer.signAuthEntry(simulatedEntry().toXDR('base64'));
  assert.equal(calls[0]!.validUntilLedger, VALID_UNTIL + 5);
  assert.equal(
    xdr.SorobanAuthorizationEntry.fromXDR(out.signedAuthEntry, 'base64').credentials().address().signatureExpirationLedger(),
    VALID_UNTIL + 5,
  );
  await assert.rejects(signerWith(backend([])).signAuthEntry(simulatedEntry().toXDR('base64')), /validUntilLedger option/);
});

test('an auth-entry adapter step is signed, then completed with the signed entry', async () => {
  const step = {
    unsignedAuthEntry: 'AAAA',
    validUntilLedger: VALID_UNTIL,
    complete: async (signedAuthEntry: string) => ({ paidWith: signedAuthEntry }),
  };
  assert.ok(isAuthEntryAdapterStep(step));
  assert.ok(!isAuthEntryAdapterStep({ unsignedTransaction: 'AAAA' }));
  const done = await completeAuthEntryStep(step, async () => ({ status: 'signed', signedAuthEntry: 'SIGNED' }));
  assert.deepEqual(done, { status: 'completed', result: { paidWith: 'SIGNED' } });
  let completed = false;
  const pending = await completeAuthEntryStep({ ...step, complete: async () => (completed = true) }, async () => ({
    status: 'cosign_pending',
    request: { id: 'req-1' } as never,
  }));
  assert.equal(pending.status, 'cosign_pending');
  assert.equal(completed, false, 'nothing is completed without a signature');
});
