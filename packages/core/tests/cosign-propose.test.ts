// The device proposes each co-signed activity and Pollar's approver votes
// second: approve() relays the Turnkey request built from the verified payload,
// tagged with the request id, and reject() closes the request through sdk-api.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CosignManager } from '../src/cosign/manager';
import type { CosignRequest } from '../src/types';

const accountRequest = {
  id: 'add-polygon',
  status: 'PENDING',
  kind: 'ACCOUNT',
  network: 'POLYGON',
  intent: 'add_accounts',
  subOrgId: 'sub-org-1',
  signWith: '',
  payloadHash: '',
  refreshable: false,
  activityId: null,
  fingerprint: null,
  unsignedPayload: JSON.stringify({
    walletId: 'wallet-1',
    accounts: [
      {
        curve: 'CURVE_SECP256K1',
        pathFormat: 'PATH_FORMAT_BIP32',
        path: "m/44'/60'/0'/0/0",
        addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
        name: 'polygon',
      },
    ],
  }),
} as unknown as CosignRequest;

/** `status`: what sdk-api answers when the request is read. */
function managerWith(calls: Array<{ path: string; body?: unknown }>, status = 'APPROVED') {
  const manager = new CosignManager({
    api: {
      GET: async () => ({ data: { content: { request: { ...accountRequest, status } } } }),
      POST: async (path: string, init?: { body?: unknown }) => {
        calls.push({ path, body: init?.body });
        return { data: { content: { status: 200, body: {}, request: { ...accountRequest, status: 'APPROVED' } } } };
      },
    } as never,
    keyManager: {} as never,
    logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined } as never,
    networkPassphrase: () => 'Test SDF Network ; September 2015',
    onRequest: () => undefined,
  });
  (manager as unknown as { stamp: (body: string) => Promise<string> }).stamp = async () => 'stamp';
  return manager;
}

test('approve proposes the verified derivation with the request id, without the account labels', async () => {
  const calls: Array<{ path: string; body?: unknown }> = [];
  const result = await managerWith(calls).approve(accountRequest);

  assert.equal(result.status, 'APPROVED');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.path, '/cosign/relay');
  const sent = calls[0]!.body as { path: string; body: string; requestId?: string };
  assert.equal(sent.path, '/public/v1/submit/create_wallet_accounts');
  assert.equal(sent.requestId, 'add-polygon');
  const turnkey = JSON.parse(sent.body);
  assert.equal(turnkey.type, 'ACTIVITY_TYPE_CREATE_WALLET_ACCOUNTS');
  assert.equal(turnkey.organizationId, 'sub-org-1');
  assert.deepEqual(turnkey.parameters, {
    walletId: 'wallet-1',
    accounts: [
      {
        curve: 'CURVE_SECP256K1',
        pathFormat: 'PATH_FORMAT_BIP32',
        path: "m/44'/60'/0'/0/0",
        addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
      },
    ],
  });
});

test('approve on a request already proposed only reads it back', async () => {
  const calls: Array<{ path: string; body?: unknown }> = [];
  const result = await managerWith(calls).approve({ ...accountRequest, activityId: 'act-1' } as CosignRequest);
  assert.equal(result.status, 'APPROVED');
  assert.equal(calls.length, 0, 'nothing is proposed twice');
});

test('reject closes the request through sdk-api and stamps nothing', async () => {
  const calls: Array<{ path: string; body?: unknown }> = [];
  await managerWith(calls, 'PENDING').reject(accountRequest);
  assert.deepEqual(
    calls.map((c) => c.path),
    ['/cosign/requests/{id}/cancel'],
  );
});

test('reject reads the request first: one that settled meanwhile is not cancelled', async () => {
  const calls: Array<{ path: string; body?: unknown }> = [];
  await assert.rejects(
    managerWith(calls, 'APPROVED').reject(accountRequest),
    (err: unknown) => (err as { code?: string }).code === 'SDK_COSIGN_REQUEST_NOT_PENDING',
  );
  assert.equal(calls.length, 0);
});

test('an unreadable derivation is not proposed', async () => {
  const calls: Array<{ path: string; body?: unknown }> = [];
  await assert.rejects(
    managerWith(calls).approve({ ...accountRequest, unsignedPayload: '{}' } as CosignRequest),
    (err: unknown) => (err as { code?: string }).code === 'SDK_COSIGN_VERIFICATION_FAILED',
  );
  assert.equal(calls.length, 0);
});
