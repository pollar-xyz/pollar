// A co-signed wallet authorizes a Soroban call (an x402 payment, a contract that
// pays the fee) by signing the entry's preimage hash. The device recomputes that
// hash from the entry itself, and it must be the one stellar-sdk signs.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Address, authorizeEntry, hash, Keypair, nativeToScVal, Networks, xdr } from '@stellar/stellar-sdk';
import { CosignManager } from '../src/cosign/manager';
import { stellarAuthEntryHashHex } from '../src/cosign/stellar-auth-entry';
import type { CosignRequest } from '../src/types';

const user = Keypair.random();
const PAY_TO = Keypair.random().publicKey();
const USDC_SAC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
const VALID_UNTIL = 1100;

function entry(opts: { address?: string; expiration?: number } = {}): xdr.SorobanAuthorizationEntry {
  const address = opts.address ?? user.publicKey();
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(address).toScAddress(),
        nonce: new xdr.Int64(42),
        signatureExpirationLedger: opts.expiration ?? VALID_UNTIL,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(USDC_SAC).toScAddress(),
          functionName: 'transfer',
          args: [
            nativeToScVal(address, { type: 'address' }),
            nativeToScVal(PAY_TO, { type: 'address' }),
            nativeToScVal(100000n, { type: 'i128' }),
          ],
        }),
      ),
      subInvocations: [],
    }),
  });
}

/** The hash stellar-sdk has the account sign for the entry. */
async function sdkHash(e: xdr.SorobanAuthorizationEntry, passphrase = Networks.PUBLIC): Promise<string> {
  let out = '';
  await authorizeEntry(
    e,
    async (preimage) => {
      const digest = hash(preimage.toXDR());
      out = digest.toString('hex');
      return user.sign(digest);
    },
    VALID_UNTIL,
    passphrase,
  );
  return out;
}

test('the device hashes an auth entry to exactly what stellar-sdk signs, per network', async () => {
  const e = entry();
  assert.equal(await stellarAuthEntryHashHex(e.toXDR('base64'), Networks.PUBLIC, user.publicKey()), await sdkHash(e));
  assert.equal(
    await stellarAuthEntryHashHex(e.toXDR('base64'), Networks.TESTNET, user.publicKey()),
    await sdkHash(e, Networks.TESTNET),
  );
});

test('the expiration is part of what is signed', async () => {
  const a = await stellarAuthEntryHashHex(entry().toXDR('base64'), Networks.PUBLIC, user.publicKey());
  const b = await stellarAuthEntryHashHex(
    entry({ expiration: VALID_UNTIL + 1 }).toXDR('base64'),
    Networks.PUBLIC,
    user.publicKey(),
  );
  assert.notEqual(a, b);
});

test('an entry for another account, already signed, or with source-account credentials is refused', async () => {
  await assert.rejects(
    stellarAuthEntryHashHex(
      entry({ address: Keypair.random().publicKey() }).toXDR('base64'),
      Networks.PUBLIC,
      user.publicKey(),
    ),
    /another account/,
  );
  const signed = await authorizeEntry(entry(), user, VALID_UNTIL, Networks.PUBLIC);
  await assert.rejects(stellarAuthEntryHashHex(signed.toXDR('base64'), Networks.PUBLIC, user.publicKey()), /already carries/);
  const sourceAccount = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: entry().rootInvocation(),
  });
  await assert.rejects(
    stellarAuthEntryHashHex(sourceAccount.toXDR('base64'), Networks.PUBLIC, user.publicKey()),
    /only address credentials/,
  );
});

function managerOn(passphrase: string) {
  return new CosignManager({
    api: {} as never,
    keyManager: {} as never,
    logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined } as never,
    networkPassphrase: () => passphrase,
    onRequest: () => undefined,
  });
}

async function authEntryRequest(payloadHash?: string): Promise<CosignRequest> {
  const e = entry();
  return {
    id: 'req-auth',
    status: 'PENDING',
    kind: 'AUTH_ENTRY',
    network: 'STELLAR',
    intent: 'sign',
    subOrgId: 'sub-org-1',
    signWith: user.publicKey(),
    account: user.publicKey(),
    unsignedPayload: e.toXDR('base64'),
    payloadHash: payloadHash ?? (await sdkHash(e)),
    refreshable: false,
    activityId: null,
    fingerprint: null,
  } as unknown as CosignRequest;
}

test('verify proposes the raw signature of the hash the device recomputed', async () => {
  const request = await authEntryRequest();
  const report = await managerOn(Networks.PUBLIC).verify(request);
  assert.ok(report.ok);
  assert.equal(report.proposal.path, '/public/v1/submit/sign_raw_payload');
  const parameters = (report.proposal.body as { parameters: Record<string, string> }).parameters;
  assert.equal(parameters.payload, request.payloadHash);
  assert.equal(parameters.signWith, user.publicKey());
  assert.equal(parameters.hashFunction, 'HASH_FUNCTION_NOT_APPLICABLE');
});

test('verify refuses an auth entry whose hash is not what Pollar asks to sign, or that is for another network', async () => {
  const forged = await managerOn(Networks.PUBLIC).verify(await authEntryRequest('00'.repeat(32)));
  assert.equal(forged.ok, false);
  const otherNetwork = await managerOn(Networks.TESTNET).verify(await authEntryRequest());
  assert.equal(otherNetwork.ok, false);
});
