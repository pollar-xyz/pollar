// A co-sign request the device already voted must not be offered for approval
// again: not by a late copy reaching the store, not by an approval that finds
// it proposed. Pure: the manager runs against a stubbed API and stubbed votes.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CosignManager } from '../src/cosign/manager';
import { isStaleCosignCopy } from '../src/cosign/stale';
import { PollarApiError, type CosignRequest } from '../src/types';

const setup = {
  id: 'add-solana',
  status: 'PENDING',
  kind: 'ACCOUNT',
  network: 'SOLANA',
  intent: 'add_accounts',
  signWith: 'x',
  unsignedPayload: '',
  activityId: null,
} as unknown as CosignRequest;

const proposed = { ...setup, activityId: 'act-1' } as CosignRequest;
const approved = { ...setup, status: 'APPROVED', activityId: 'act-1' } as CosignRequest;

const logger = { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined } as never;

function managerWith(get: () => CosignRequest, onRequest: (r: CosignRequest) => void = () => undefined) {
  const reads: Array<{ sync: boolean }> = [];
  const manager = new CosignManager({
    api: {
      GET: async (path: string, init?: { params?: { query?: { sync?: string } } }) => {
        if (path === '/cosign/requests') return { data: { content: { requests: [setup] } } };
        reads.push({ sync: init?.params?.query?.sync === '1' });
        return { data: { content: { request: get() } } };
      },
    } as never,
    keyManager: {} as never,
    logger,
    networkPassphrase: () => 'Test SDF Network ; September 2015',
    onRequest,
  });
  return { manager, reads };
}

test('a copy from before the proposal is stale once the proposal was seen', () => {
  const seen = { settled: new Set<string>(), proposed: new Set(['add-solana']) };
  assert.equal(isStaleCosignCopy(setup, seen), true);
  // The proposed copy itself, and the final one, still update the store.
  assert.equal(isStaleCosignCopy(proposed, seen), false);
  assert.equal(isStaleCosignCopy(approved, seen), false);
  // A request never proposed by this client is shown as it comes.
  assert.equal(isStaleCosignCopy(setup, { settled: new Set(), proposed: new Set() }), false);
  // A pending copy of a settled request is stale with or without its activity.
  assert.equal(isStaleCosignCopy(proposed, { settled: new Set(['add-solana']), proposed: new Set() }), true);
});

test('approving a request someone else already proposed reads its outcome instead of failing', async () => {
  const { manager, reads } = managerWith(() => approved);
  const m = manager as unknown as Record<string, unknown>;
  m.verify = async () => ({ ok: true, proposal: { path: '/public/v1/submit/create_wallet_accounts', body: {} } });
  m.relay = async () => {
    throw new PollarApiError('SDK_COSIGN_REQUEST_NOT_PENDING', {});
  };

  const result = await manager.approve(setup);

  assert.equal(result.status, 'APPROVED');
  assert.deepEqual(reads, [{ sync: true }]);
});

test('any other relay failure still fails the approval', async () => {
  const { manager } = managerWith(() => approved);
  const m = manager as unknown as Record<string, unknown>;
  m.verify = async () => ({ ok: true, proposal: { path: '/public/v1/submit/create_wallet_accounts', body: {} } });
  m.relay = async () => {
    throw new PollarApiError('SDK_COSIGN_UPSTREAM_ERROR', {});
  };

  await assert.rejects(manager.approve(setup), (err: unknown) => (err as PollarApiError).code === 'SDK_COSIGN_UPSTREAM_ERROR');
});

test('a proposed request is read back until Turnkey settles it, and the store learns the outcome', async () => {
  const seen: string[] = [];
  const { manager, reads } = managerWith(
    () => approved,
    (r) => seen.push(r.status),
  );

  const result = await manager.settle(proposed);

  assert.equal(result.status, 'APPROVED');
  assert.deepEqual(reads, [{ sync: true }]);
  assert.deepEqual(seen, ['APPROVED']);
});
