// signAuthEntry asks for the signature confirmation like any signature, and a
// token transfer counts its USD value against a window. These read the transfer
// out of the entry and derive the asset contract the way stellar-sdk does.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Address, Asset, Keypair, nativeToScVal, Networks, StrKey, xdr } from '@stellar/stellar-sdk';
import { encodeStellarAddress } from '../src/cosign/recognize';
import { usdValueOf } from '../src/lib/confirmation';
import { authEntryTransfer, formatStroops, stellarAssetContractId } from '../src/stellar/auth-entry-value';

const user = Keypair.random();
const PAY_TO = Keypair.random().publicKey();
const USDC = new Asset('USDC', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN');
const USDC_SAC = USDC.contractId(Networks.PUBLIC);

function invocation(fn: string, args: xdr.ScVal[], subs: xdr.SorobanAuthorizedInvocation[] = []) {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({ contractAddress: new Address(USDC_SAC).toScAddress(), functionName: fn, args }),
    ),
    subInvocations: subs,
  });
}

function entry(root: xdr.SorobanAuthorizedInvocation, signature = xdr.ScVal.scvVoid()): string {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(user.publicKey()).toScAddress(),
        nonce: new xdr.Int64(9),
        signatureExpirationLedger: 1100,
        signature,
      }),
    ),
    rootInvocation: root,
  }).toXDR('base64');
}

const transferArgs = (to: string, amount: bigint) => [
  nativeToScVal(user.publicKey(), { type: 'address' }),
  nativeToScVal(to, { type: 'address' }),
  nativeToScVal(amount, { type: 'i128' }),
];

test('the transfer an x402 entry authorizes is read: contract, destination and amount', () => {
  const t = authEntryTransfer(entry(invocation('transfer', transferArgs(PAY_TO, 500000n))));
  assert.ok(t);
  assert.equal(encodeStellarAddress('contract', t.contract), USDC_SAC);
  assert.equal(t.to, PAY_TO);
  assert.equal(t.amount, 500000n);
  assert.equal(formatStroops(t.amount), '0.05');
});

test('a transfer to a contract names the contract as the destination', () => {
  const t = authEntryTransfer(entry(invocation('transfer', transferArgs(USDC_SAC, 10_000_000n))));
  assert.equal(t?.to, USDC_SAC);
  assert.equal(formatStroops(t!.amount), '1');
});

test('anything that is not a lone transfer has no value to show', () => {
  assert.equal(authEntryTransfer(entry(invocation('approve', transferArgs(PAY_TO, 1n)))), null);
  const withSub = invocation('transfer', transferArgs(PAY_TO, 1n), [invocation('transfer', transferArgs(PAY_TO, 1n))]);
  assert.equal(authEntryTransfer(entry(withSub)), null);
  assert.equal(authEntryTransfer(entry(invocation('transfer', transferArgs(PAY_TO, 1n)), xdr.ScVal.scvVec([]))), null);
  assert.equal(authEntryTransfer('not xdr'), null);
});

test('the asset contract id is the one stellar-sdk derives, for alphanum4, alphanum12 and native', async () => {
  const cases: Array<[string, Asset]> = [
    [`USDC:${USDC.getIssuer()}`, USDC],
    [`LONGCODE1234:${USDC.getIssuer()}`, new Asset('LONGCODE1234', USDC.getIssuer())],
    ['native', Asset.native()],
  ];
  for (const [key, asset] of cases) {
    for (const network of [Networks.PUBLIC, Networks.TESTNET]) {
      const id = await stellarAssetContractId(key, network);
      assert.ok(id);
      assert.equal(encodeStellarAddress('contract', id), asset.contractId(network), key);
    }
  }
  assert.equal(await stellarAssetContractId('USDC:not-an-address', Networks.PUBLIC), null);
});

test('addresses encode the way stellar-sdk writes them', () => {
  const key = Keypair.random();
  assert.equal(encodeStellarAddress('account', key.rawPublicKey()), key.publicKey());
  assert.equal(encodeStellarAddress('contract', StrKey.decodeContract(USDC_SAC)), USDC_SAC);
});

test('an auth-entry transfer of a priced asset has a USD value; an unpriced one has none', () => {
  const prices = [{ chain: 'STELLAR' as const, asset: `USDC:${USDC.getIssuer()}`, usd: '1' }];
  const request = {
    kind: 'sign_auth_entry' as const,
    network: 'STELLAR' as const,
    operation: 'transfer',
    details: { amount: '0.05', assetKey: `USDC:${USDC.getIssuer()}` },
  };
  assert.equal(usdValueOf(request, prices), 0.05);
  assert.equal(usdValueOf({ ...request, details: { amount: '0.05', contract: USDC_SAC } }, prices), null);
  assert.equal(usdValueOf({ ...request, operation: 'invoke_contract' }, prices), null);
});
