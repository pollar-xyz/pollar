// Moving custodial wallets to Turnkey from the device's side (X7.8): the device
// offers its key as the sub-org's first credential, votes the derivation of an
// account the move needs, and reads the quorum back afterwards.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CosignManager } from '../src/cosign/manager';

const DEVICE = '02' + 'ab'.repeat(32);

const wallet = (chain: string, required: boolean) => ({
  chain,
  address: `${chain}-address`,
  required,
  status: required ? 'NONE' : 'DONE',
  addressChanges: chain !== 'STELLAR',
  newAddress: null,
  error: null,
});

function harness(answers: Array<Record<string, unknown>>, initial?: Record<string, unknown>) {
  const posts: Array<{ path: string; body: unknown }> = [];
  const order: string[] = [];
  const manager = new CosignManager({
    api: {
      GET: async () => ({ data: { content: initial ?? answers[0] } }),
      POST: async (path: string, init: { body: unknown }) => {
        posts.push({ path, body: init.body });
        order.push(`POST ${(init.body as { chain: string }).chain}`);
        return { data: { content: answers.shift() } };
      },
    } as never,
    keyManager: {} as never,
    logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined } as never,
    networkPassphrase: () => 'Public Global Stellar Network ; September 2015',
    onRequest: () => undefined,
  });
  const patch = manager as unknown as Record<string, unknown>;
  patch.publicKeyHex = async () => DEVICE;
  patch.inspectQuorum = async () => {
    order.push('inspectQuorum');
    return { ok: true };
  };
  patch.pending = async () => {
    order.push('pending');
    return [];
  };
  return { manager, posts, order };
}

const done = { required: false, toCustody: 'COSIGNED', choice: false, wallets: [wallet('STELLAR', false)] };

test('the move sends this device key, the chain and the pick, then reads the quorum back', async () => {
  const { manager, posts, order } = harness([done]);
  await manager.migrateWallet('SELF_CUSTODY');
  assert.deepEqual(posts, [
    { path: '/cosign/custody/migration', body: { devicePublicKey: DEVICE, chain: 'STELLAR', custody: 'SELF_CUSTODY' } },
  ]);
  assert.deepEqual(order, ['POST STELLAR', 'inspectQuorum']);
});

test('an account that has to be derived first is voted as setup, then the move runs again', async () => {
  const { manager, order } = harness([{ ...done, awaitingAccount: true }, done]);
  await manager.migrateWallet(undefined, { chain: 'SOLANA' });
  assert.deepEqual(order, ['POST SOLANA', 'pending', 'POST SOLANA', 'inspectQuorum']);
});

test('every wallet that has to move does, Stellar first, and the others are left alone', async () => {
  const initial = {
    required: true,
    toCustody: 'COSIGNED',
    choice: false,
    wallets: [wallet('POLYGON', true), wallet('SOLANA', false), wallet('STELLAR', true)],
  };
  const { manager, order } = harness([initial, done], initial);
  await manager.migrateWallets();
  assert.deepEqual(
    order.filter((o) => o.startsWith('POST')),
    ['POST STELLAR', 'POST POLYGON'],
  );
});
