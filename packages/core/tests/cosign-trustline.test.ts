// A trustline on an embedded wallet is a signature like any other: the user
// confirms it first, a co-signed vote the client casts itself never flashes
// the prompt, and the request sdk-api opens for the next enabled asset is read
// as soon as the previous setup step lands.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PollarClient } from '../src/index';
import type { CosignRequest, CosignState } from '../src/types';

const USDC = { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' };

const trustlineRequest = {
  id: 'trust-usdc',
  status: 'PENDING',
  kind: 'TX',
  network: 'STELLAR',
  intent: 'sign_and_send',
  operation: 'change_trust',
  signWith: 'G',
  unsignedPayload: '',
  activityId: null,
} as unknown as CosignRequest;

type Probe = {
  _session: unknown;
  _api: { POST: (path: string, init: unknown) => Promise<unknown> };
  _confirm: (input: Record<string, unknown>) => Promise<{ ok: boolean; code?: string; details?: string }>;
  _settleCosign: (request: CosignRequest, ctx: unknown) => Promise<unknown>;
  _noteCosignRequest: (request: CosignRequest) => void;
  cosign: { pending: () => Promise<CosignRequest[]> };
  onCosignStateChange: (cb: (state: CosignState) => void) => () => void;
  setTrustline: PollarClient['setTrustline'];
};

function embeddedClient(config: Record<string, unknown> = {}) {
  const client = new PollarClient({ apiKey: 'pub_testnet_probe', ...config } as never) as unknown as Probe;
  client._session = { wallet: { type: 'internal', address: 'GUSER' } };
  const posted: string[] = [];
  const asked: Array<Record<string, unknown>> = [];
  let pendingReads = 0;
  client._confirm = async (input) => {
    asked.push(input);
    return { ok: true };
  };
  client.cosign.pending = async () => {
    pendingReads++;
    return [];
  };
  return { client, posted, asked, pendingReads: () => pendingReads };
}

test('a trustline on an embedded wallet is put to the user before the server is called', async () => {
  const { client, posted, asked } = embeddedClient();
  client._api = {
    POST: async (path) => {
      posted.push(path);
      return { data: { code: 'SDK_WALLET_TRUSTLINE' } };
    },
  };

  assert.deepEqual(await client.setTrustline(USDC), { status: 'success' });
  assert.equal(asked.length, 1);
  assert.equal(asked[0]?.operation, 'change_trust');
  assert.deepEqual(posted, ['/wallet/assets/trustline']);
});

test('a declined trustline never reaches the server', async () => {
  const { client, posted } = embeddedClient();
  client._confirm = async () => ({
    ok: false,
    code: 'SDK_CONFIRMATION_DECLINED',
    details: 'the user declined the transaction',
  });
  client._api = {
    POST: async (path) => {
      posted.push(path);
      return { data: { code: 'SDK_WALLET_TRUSTLINE' } };
    },
  };

  const outcome = await client.setTrustline(USDC);

  assert.equal(outcome.status, 'error');
  assert.equal((outcome as { code?: string }).code, 'SDK_CONFIRMATION_DECLINED');
  assert.deepEqual(posted, []);
});

test('the co-signed request a trustline answers with is voted by the client, never offered in the prompt', async () => {
  const { client } = embeddedClient();
  client._api = {
    POST: async () => ({
      data: { code: 'SDK_COSIGN_PENDING', content: { pendingSignature: { kind: 'cosign', request: trustlineRequest } } },
    }),
  };
  const offered: string[][] = [];
  client.onCosignStateChange((state) => offered.push(state.pending.map((r) => r.id)));
  const settled: string[] = [];
  client._settleCosign = async (request) => {
    settled.push(request.id);
    return { status: 'success' };
  };

  await client.setTrustline(USDC);

  assert.deepEqual(settled, ['trust-usdc']);
  assert.ok(
    offered.every((ids) => !ids.includes('trust-usdc')),
    'the request never entered the pending list',
  );
});

test('an app that votes itself still gets the request in the pending list', async () => {
  const { client } = embeddedClient({ cosignManual: true });
  client._api = {
    POST: async () => ({
      data: { code: 'SDK_COSIGN_PENDING', content: { pendingSignature: { kind: 'cosign', request: trustlineRequest } } },
    }),
  };
  const offered: string[][] = [];
  client.onCosignStateChange((state) => offered.push(state.pending.map((r) => r.id)));

  const outcome = await client.setTrustline(USDC);

  assert.equal(outcome.status, 'cosign_pending');
  assert.ok(offered.some((ids) => ids.includes('trust-usdc')));
});

const landed = (over: Record<string, unknown>) =>
  ({
    ...trustlineRequest,
    status: 'APPROVED',
    submit: { hash: 'h', status: 'SUCCESS' },
    ...over,
  }) as unknown as CosignRequest;

test('a created account or an added trustline reads the next setup request once', async () => {
  const { client, pendingReads } = embeddedClient();

  client._noteCosignRequest(landed({ id: 'acct', intent: 'account_create', operation: 'create_account' }));
  client._noteCosignRequest(landed({ id: 'trust-usdc' }));
  // The same final copy arriving again (a later read) reads nothing more.
  client._noteCosignRequest(landed({ id: 'trust-usdc' }));

  assert.equal(pendingReads(), 2);
});

test('nothing is read after a failed setup step, any other send, or for an app that votes itself', async () => {
  const { client, pendingReads } = embeddedClient();
  client._noteCosignRequest(landed({ id: 'failed', submit: { hash: 'h', status: 'FAILED' } }));
  client._noteCosignRequest(landed({ id: 'rejected', status: 'REJECTED', submit: undefined }));
  client._noteCosignRequest(landed({ id: 'payment', operation: 'payment' }));
  assert.equal(pendingReads(), 0);

  const manual = embeddedClient({ cosignManual: true });
  manual.client._noteCosignRequest(landed({ id: 'trust-usdc' }));
  assert.equal(manual.pendingReads(), 0);
});

// An adapter that signs without a UI of its own (an embedded Privy wallet)
// signs whatever reaches it, so the wallet's own setup asks before it too.
function externalClient(confirm: { ok: boolean; code?: string; details?: string }) {
  const client = new PollarClient({ apiKey: 'pub_testnet_probe' } as never) as unknown as Probe & {
    _walletAdapter: unknown;
    createAccount: PollarClient['createAccount'];
    submitTx: (xdr: string) => Promise<unknown>;
  };
  client._session = { wallet: { type: 'external', address: 'GUSER' } };
  const signed: string[] = [];
  const submitted: string[] = [];
  const asked: Array<Record<string, unknown>> = [];
  client._walletAdapter = {
    type: 'probe',
    signTransaction: async (xdr: string) => {
      signed.push(xdr);
      return { signedTxXdr: `${xdr}+user` };
    },
  };
  client._api = {
    POST: async (path) =>
      path === '/wallet/account/create/build'
        ? { data: { success: true, content: { sponsorSignedXdr: 'ACCOUNT_XDR' } } }
        : { data: { success: true, content: { sponsorSignedXdr: 'TRUST_XDR' } } },
  };
  client._confirm = async (input) => {
    asked.push(input);
    return confirm;
  };
  client.submitTx = async (xdr) => {
    submitted.push(xdr);
    return { status: 'success', hash: 'h' };
  };
  return { client, signed, submitted, asked };
}

const declined = { ok: false, code: 'SDK_CONFIRMATION_DECLINED', details: 'the user declined the transaction' };

test("an external wallet's trustline and account creation ask before the adapter signs", async () => {
  const { client, signed, submitted, asked } = externalClient({ ok: true });

  assert.equal((await client.setTrustline(USDC)).status, 'success');
  assert.equal((await client.createAccount()).status, 'success');

  assert.deepEqual(
    asked.map((a) => a.unsignedXdr),
    ['TRUST_XDR', 'ACCOUNT_XDR'],
  );
  assert.deepEqual(signed, ['TRUST_XDR', 'ACCOUNT_XDR']);
  assert.deepEqual(submitted, ['TRUST_XDR+user', 'ACCOUNT_XDR+user']);
});

test('a declined external setup step is never signed nor sent, and says it was declined', async () => {
  const { client, signed, submitted } = externalClient(declined);

  const trust = await client.setTrustline(USDC);
  const account = await client.createAccount();

  assert.equal((trust as { code?: string }).code, 'SDK_CONFIRMATION_DECLINED');
  assert.equal((account as { code?: string }).code, 'SDK_CONFIRMATION_DECLINED');
  assert.deepEqual(signed, []);
  assert.deepEqual(submitted, []);
});
