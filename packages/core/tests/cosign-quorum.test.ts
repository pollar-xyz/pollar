// inspectQuorum judges the sub-org by the wallet's custody: a co-signed wallet
// is two root users at threshold 2, a self-custody wallet the user alone at
// threshold 1, and this device must be among the user's credentials either way.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CosignManager } from '../src/cosign/manager';

const DEVICE = '02' + 'ab'.repeat(32);
const OTHER = '02' + 'cd'.repeat(32);

function managerFor(custody: 'COSIGNED' | 'SELF_CUSTODY', org: { threshold: number; userIds: string[]; deviceKey?: string }) {
  const users = org.userIds.map((userId) => ({
    userId,
    apiKeys: [{ credential: { publicKey: userId === 'tk-user' ? (org.deviceKey ?? DEVICE) : OTHER } }],
  }));
  const manager = new CosignManager({
    api: {
      GET: async () => ({
        data: { content: { subOrgId: 'sub-org-1', endUserId: 'tk-user', custody, quorumState: null, devices: [] } },
      }),
      POST: async (path: string) =>
        path === '/cosign/relay'
          ? { data: { content: { status: 200, body: { organizationData: { rootQuorum: org, users } } } } }
          : { data: { content: { quorumState: 'VERIFIED' } } },
    } as never,
    keyManager: {} as never,
    logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined } as never,
    networkPassphrase: () => 'Test SDF Network ; September 2015',
    onRequest: () => undefined,
  });
  const m = manager as unknown as { stamp: (body: string) => Promise<string>; publicKeyHex: () => Promise<string> };
  m.stamp = async () => 'stamp';
  m.publicKeyHex = async () => DEVICE;
  return manager;
}

test('a co-signed wallet is a 2-of-2 with this device registered', async () => {
  const report = await managerFor('COSIGNED', { threshold: 2, userIds: ['tk-user', 'tk-approver'] }).inspectQuorum({
    report: false,
  });
  assert.deepEqual(report, { ok: true, custody: 'COSIGNED', threshold: 2, rootUsers: 2, deviceRegistered: true });
});

test('a self-custody wallet is a 1-of-1 with this device registered', async () => {
  const report = await managerFor('SELF_CUSTODY', { threshold: 1, userIds: ['tk-user'] }).inspectQuorum({ report: false });
  assert.deepEqual(report, { ok: true, custody: 'SELF_CUSTODY', threshold: 1, rootUsers: 1, deviceRegistered: true });
});

test('a self-custody wallet that gained a second root user is broken', async () => {
  const report = await managerFor('SELF_CUSTODY', { threshold: 1, userIds: ['tk-user', 'tk-approver'] }).inspectQuorum({
    report: false,
  });
  assert.equal(report.ok, false);
  assert.match((report as { reason: string }).reason, /1-of-1/);
});

test('a co-signed wallet whose threshold dropped to 1 is broken', async () => {
  const report = await managerFor('COSIGNED', { threshold: 1, userIds: ['tk-user', 'tk-approver'] }).inspectQuorum({
    report: false,
  });
  assert.equal(report.ok, false);
  assert.match((report as { reason: string }).reason, /2-of-2/);
});

test('a device Turnkey does not list on the user is not registered, whatever the quorum', async () => {
  const report = await managerFor('SELF_CUSTODY', { threshold: 1, userIds: ['tk-user'], deviceKey: OTHER }).inspectQuorum({
    report: false,
  });
  assert.equal(report.ok, false);
  assert.equal(report.deviceRegistered, false);
});
