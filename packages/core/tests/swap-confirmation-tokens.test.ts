// A Solana swap's confirmation names its tokens: the symbol and decimals of
// each mint, from the balances and app assets the client already holds.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PollarClient } from '../src/index';

type Probe = {
  _tokenOf: (address: string) => { symbol: string; decimals: number } | undefined;
  _walletBalanceState: unknown;
  _enabledAssetsState: unknown;
};

const client = () => new PollarClient({ apiKey: 'pub_testnet_probe' } as never) as unknown as Probe;

test('wrapped SOL reads as SOL with 9 decimals', () => {
  assert.deepEqual(client()._tokenOf('So11111111111111111111111111111111111111112'), { symbol: 'SOL', decimals: 9 });
});

test('a mint the wallet holds, or the app enabled, takes their code and decimals', () => {
  const c = client();
  c._walletBalanceState = {
    step: 'loaded',
    data: {
      balances: [{ chain: 'SOLANA', type: 'token', code: 'USDC', issuer: 'EPjF', decimals: 6, balance: '1', available: '1' }],
    },
  };
  c._enabledAssetsState = {
    step: 'loaded',
    data: { assets: [{ chain: 'POLYGON', code: 'USDT', issuer: '0xC2132D05', decimals: 6 }] },
  };
  assert.deepEqual(c._tokenOf('EPjF'), { symbol: 'USDC', decimals: 6 });
  assert.deepEqual(c._tokenOf('0xc2132d05'), { symbol: 'USDT', decimals: 6 }, 'a contract address matches in any case');
  assert.equal(c._tokenOf('unknown'), undefined);
});
