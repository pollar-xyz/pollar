// Each chain signs with the wallet the user holds there: the adapter they
// connected only for the chain of the wallet they brought, the platform for a
// custodial or Turnkey wallet beside it, whatever adapter is attached.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PollarClient } from '../src/index';

type Probe = {
  _session: unknown;
  _walletAdapter: unknown;
  _api: { POST: (path: string, init: { body?: Record<string, unknown> }) => Promise<unknown> };
  _confirm: () => Promise<{ ok: boolean }>;
  signTx: PollarClient['signTx'];
  signSolanaTransaction: PollarClient['signSolanaTransaction'];
  getWallet: PollarClient['getWallet'];
};

const SOLANA_OWN = 'BEiJauJ3W1vytWHmfTdtRgR9wYZmV3Xo2BvhNHCgTYmy';
const STELLAR_OWN = 'GOWNSTELLARWALLET';
const STELLAR_TURNKEY = 'GTURNKEYSTELLAR';

/** An adapter that records what it was asked to sign; `chains` says what it can sign. */
function adapter(type: string, chains: Array<'STELLAR' | 'SOLANA'>, signed: string[]) {
  return {
    type,
    disconnect: async () => undefined,
    ...(chains.includes('STELLAR')
      ? {
          signTransaction: async (xdr: string, opts: { accountToSign?: string }) => {
            signed.push(`stellar ${xdr} as ${opts.accountToSign ?? '-'}`);
            return { signedTxXdr: `signed:${xdr}` };
          },
        }
      : {}),
    ...(chains.includes('SOLANA')
      ? {
          signSolanaTransaction: async (tx: Uint8Array) => {
            signed.push('solana');
            return tx;
          },
        }
      : {}),
  };
}

function client(session: unknown, attached: unknown) {
  const c = new PollarClient({ apiKey: 'pub_testnet_probe' } as never) as unknown as Probe;
  c._session = session;
  c._walletAdapter = attached;
  c._confirm = async () => ({ ok: true });
  const posted: Array<{ path: string; address?: unknown }> = [];
  c._api = {
    POST: async (path, init) => {
      posted.push({ path, address: init.body?.address });
      return { data: { success: true, content: { signedXdr: 'server-signed', idempotencyKey: 'k', sponsored: false } } };
    },
  };
  return { c, posted };
}

/** Signed in with Phantom (SIWS): `wallet` has no address; Stellar is the Turnkey wallet created beside it. */
const solanaLogin = {
  wallet: { type: 'external', address: null, chain: 'STELLAR' },
  wallets: [
    { type: 'external', address: SOLANA_OWN, chain: 'SOLANA' },
    { type: 'internal', address: STELLAR_TURNKEY, chain: 'STELLAR' },
  ],
};

/** Signed in with Freighter: Stellar is their own; Solana is a Turnkey wallet beside it. */
const stellarLogin = {
  wallet: { type: 'external', address: STELLAR_OWN, chain: 'STELLAR' },
  wallets: [
    { type: 'external', address: STELLAR_OWN, chain: 'STELLAR' },
    { type: 'internal', address: 'SoLTurnkey1111111111111111111111111111111111', chain: 'SOLANA' },
  ],
};

test('a Solana wallet login signs Stellar through the platform with its Turnkey wallet, never with the Solana adapter', async () => {
  const signed: string[] = [];
  const { c, posted } = client(solanaLogin, adapter('phantom', ['SOLANA'], signed));
  const outcome = await c.signTx('AAAA');
  assert.equal(outcome.status, 'signed');
  assert.deepEqual(posted, [{ path: '/tx/sign', address: STELLAR_TURNKEY }]);
  assert.deepEqual(signed, []);
  assert.equal(c.getWallet()?.address, STELLAR_TURNKEY);
  assert.equal(c.getWallet()?.custody, 'internal');
});

test('a Solana wallet login whose adapter is not attached still signs Stellar; only Solana asks to reconnect', async () => {
  const { c, posted } = client(solanaLogin, null);
  assert.equal((await c.signTx('AAAA')).status, 'signed');
  assert.deepEqual(posted, [{ path: '/tx/sign', address: STELLAR_TURNKEY }]);
  await assert.rejects(c.signSolanaTransaction('AAAA'), /Reconnect your wallet/);
});

test('a Solana wallet login signs Solana with the connected adapter', async () => {
  const signed: string[] = [];
  const { c } = client(solanaLogin, adapter('phantom', ['SOLANA'], signed));
  await c.signSolanaTransaction('AAAA');
  assert.deepEqual(signed, ['solana']);
});

test('a Stellar wallet login signs Stellar with the connected adapter, as the wallet the user brought', async () => {
  const signed: string[] = [];
  const { c, posted } = client(stellarLogin, adapter('freighter', ['STELLAR'], signed));
  const outcome = await c.signTx('AAAA');
  assert.equal(outcome.status, 'signed');
  assert.deepEqual(signed, [`stellar AAAA as ${STELLAR_OWN}`]);
  assert.deepEqual(posted, []);
});

test('a Stellar wallet login without its adapter asks to reconnect instead of signing on the server', async () => {
  const { c, posted } = client(stellarLogin, null);
  const outcome = await c.signTx('AAAA');
  assert.equal(outcome.status, 'error');
  assert.match((outcome as { details?: string }).details ?? '', /Reconnect your wallet/);
  assert.deepEqual(posted, []);
});

test('a Solana wallet login with no Stellar wallet yet is told it has none, not handed to the Solana adapter', async () => {
  const signed: string[] = [];
  const { c, posted } = client(
    { wallet: solanaLogin.wallet, wallets: [solanaLogin.wallets[0]] },
    adapter('phantom', ['SOLANA'], signed),
  );
  const outcome = await c.signTx('AAAA');
  assert.equal(outcome.status, 'error');
  assert.equal((outcome as { code?: string }).code, 'SDK_WALLET_REQUIRED');
  assert.deepEqual(signed, []);
  assert.deepEqual(posted, []);
  assert.equal(c.getWallet(), null);
});

test('an email login keeps signing Stellar on the server whatever adapter is registered', async () => {
  const signed: string[] = [];
  const { c, posted } = client(
    { wallet: { type: 'internal', address: STELLAR_TURNKEY, chain: 'STELLAR' } },
    adapter('freighter', ['STELLAR'], signed),
  );
  assert.equal((await c.signTx('AAAA')).status, 'signed');
  assert.deepEqual(posted, [{ path: '/tx/sign', address: STELLAR_TURNKEY }]);
  assert.deepEqual(signed, []);
});
