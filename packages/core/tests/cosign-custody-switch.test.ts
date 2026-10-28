// A custody switch is a series of Turnkey activities the device stamps. The
// device checks each one keeps the wallet the user's before stamping it, and
// switchCustody walks the steps sdk-api hands back until the switch is done.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCustodySwitchStep } from '../src/cosign/custody';
import { CosignManager } from '../src/cosign/manager';

const USER = 'tk-user';
const quorum = (threshold: number, userIds: string[]) => ({
  path: '/public/v1/submit/update_root_quorum',
  type: 'ACTIVITY_TYPE_UPDATE_ROOT_QUORUM',
  parameters: { threshold, userIds },
});

test('toward self-custody the quorum may only become the user alone', () => {
  assert.equal(checkCustodySwitchStep(quorum(1, [USER]), 'SELF_CUSTODY', USER).ok, true);
  assert.equal(checkCustodySwitchStep(quorum(1, ['tk-other']), 'SELF_CUSTODY', USER).ok, false);
  assert.equal(checkCustodySwitchStep(quorum(1, [USER, 'tk-other']), 'SELF_CUSTODY', USER).ok, false);
  assert.equal(checkCustodySwitchStep(quorum(2, [USER, 'tk-other']), 'SELF_CUSTODY', USER).ok, false);
});

test('toward self-custody only other users are deleted', () => {
  const del = (userIds: string[]) => ({
    path: '/public/v1/submit/delete_users',
    type: 'ACTIVITY_TYPE_DELETE_USERS',
    parameters: { userIds },
  });
  assert.equal(checkCustodySwitchStep(del(['tk-approver']), 'SELF_CUSTODY', USER).ok, true);
  assert.equal(checkCustodySwitchStep(del([USER]), 'SELF_CUSTODY', USER).ok, false);
  assert.equal(checkCustodySwitchStep(del(['tk-approver']), 'COSIGNED', USER).ok, false);
});

test('toward co-signed: one approver with API keys only, user-only policies, a 2-of-2 that keeps the user', () => {
  const user = (extra: Record<string, unknown> = {}) => ({
    path: '/public/v1/submit/create_users',
    type: 'ACTIVITY_TYPE_CREATE_USERS_V4',
    parameters: {
      users: [
        {
          userName: 'pollar-approver-app',
          apiKeys: [{ apiKeyName: 'k', publicKey: '02' + 'a1'.repeat(32), curveType: 'API_KEY_CURVE_P256' }],
          authenticators: [],
          oauthProviders: [],
          userTags: [],
          ...extra,
        },
      ],
    },
  });
  assert.equal(checkCustodySwitchStep(user(), 'COSIGNED', USER).ok, true);
  assert.equal(checkCustodySwitchStep(user({ oauthProviders: [{ providerName: 'google' }] }), 'COSIGNED', USER).ok, false);
  assert.equal(checkCustodySwitchStep(user(), 'SELF_CUSTODY', USER).ok, false);

  const policies = (consensus: string) => ({
    path: '/public/v1/submit/create_policies',
    type: 'ACTIVITY_TYPE_CREATE_POLICIES',
    parameters: { policies: [{ policyName: 'p', effect: 'EFFECT_ALLOW', consensus, condition: 'c' }] },
  });
  assert.equal(checkCustodySwitchStep(policies(`approvers.any(user, user.id == '${USER}')`), 'COSIGNED', USER).ok, true);
  assert.equal(checkCustodySwitchStep(policies(`approvers.any(user, user.id == 'tk-approver')`), 'COSIGNED', USER).ok, false);

  assert.equal(checkCustodySwitchStep(quorum(2, [USER, 'tk-approver']), 'COSIGNED', USER).ok, true);
  assert.equal(checkCustodySwitchStep(quorum(2, ['tk-a', 'tk-b']), 'COSIGNED', USER).ok, false);
  assert.equal(checkCustodySwitchStep(quorum(1, [USER, 'tk-approver']), 'COSIGNED', USER).ok, false);
});

function managerWith(states: unknown[], posts: Array<{ path: string; body?: unknown }>) {
  let next = 0;
  const manager = new CosignManager({
    api: {
      GET: async () => ({
        data: { content: { subOrgId: 'sub-1', endUserId: USER, custody: 'SELF_CUSTODY', quorumState: null, devices: [] } },
      }),
      POST: async (path: string, init?: { body?: unknown }) => {
        posts.push({ path, body: init?.body });
        if (path === '/cosign/custody/next') return { data: { content: states[next++] } };
        if (path === '/cosign/custody/step')
          return {
            data: {
              content: { status: 200, body: { activity: { status: 'ACTIVITY_STATUS_COMPLETED' } }, next: states[next++] },
            },
          };
        return { data: { content: { quorumState: 'VERIFIED' } } };
      },
    } as never,
    keyManager: {} as never,
    logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined } as never,
    networkPassphrase: () => 'Test SDF Network ; September 2015',
    onRequest: () => undefined,
  });
  const m = manager as unknown as { stamp: (b: string) => Promise<string>; inspectQuorum: () => Promise<unknown> };
  m.stamp = async () => 'stamp';
  m.inspectQuorum = async () => ({ ok: true, custody: 'SELF_CUSTODY', threshold: 1, rootUsers: 1, deviceRegistered: true });
  return manager;
}

const pending = (step: unknown) => ({ subOrgId: 'sub-1', endUserId: USER, done: false, custody: 'COSIGNED', step });
const done = { subOrgId: 'sub-1', endUserId: USER, done: true, custody: 'SELF_CUSTODY' };

test('switchCustody stamps each step for the sub-org and stops once sdk-api says done', async () => {
  const posts: Array<{ path: string; body?: unknown }> = [];
  const del = {
    path: '/public/v1/submit/delete_users',
    type: 'ACTIVITY_TYPE_DELETE_USERS',
    parameters: { userIds: ['tk-approver'] },
  };
  const report = await managerWith([pending(quorum(1, [USER])), pending(del), done], posts).switchCustody('SELF_CUSTODY');
  assert.equal((report as { ok: boolean }).ok, true);
  const steps = posts.filter((p) => p.path === '/cosign/custody/step');
  assert.equal(steps.length, 2);
  const first = steps[0]!.body as { to: string; path: string; body: string };
  assert.equal(first.to, 'SELF_CUSTODY');
  const stamped = JSON.parse(first.body) as Record<string, unknown>;
  assert.equal(stamped.organizationId, 'sub-1');
  assert.deepEqual(stamped.parameters, { threshold: 1, userIds: [USER] });
});

test('switchCustody stamps nothing when a step fails the device check', async () => {
  const posts: Array<{ path: string; body?: unknown }> = [];
  await assert.rejects(
    managerWith([pending(quorum(1, ['tk-other']))], posts).switchCustody('SELF_CUSTODY'),
    (e: unknown) => (e as { code?: string }).code === 'SDK_COSIGN_VERIFICATION_FAILED',
  );
  assert.equal(posts.filter((p) => p.path === '/cosign/custody/step').length, 0);
});
