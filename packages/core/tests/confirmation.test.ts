// When the SDK asks the user before a signature: the dashboard setting, the
// app's code (the stricter wins), what a signature is worth in USD, and the
// window a confirmed signature opens.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PollarClient } from '../src/index';
import {
  ConfirmationWindow,
  effectivePolicy,
  policyOfApp,
  stricterPolicy,
  type UsdPrice,
  usdValueOf,
} from '../src/lib/confirmation';

const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const SOL_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const prices: UsdPrice[] = [
  { chain: 'STELLAR', asset: 'native', usd: '0.25' },
  { chain: 'STELLAR', asset: `USDC:${USDC_ISSUER}`, usd: '1' },
  { chain: 'SOLANA', asset: 'native', decimals: 9, usd: '150' },
  { chain: 'SOLANA', asset: SOL_USDC, decimals: 6, usd: '1' },
];

const window5m = { window: { seconds: 300, maxUsd: 50 } };

test('an app with no setting, or one that cannot be read, asks for every signature', () => {
  assert.equal(policyOfApp(null), 'prompt');
  assert.equal(policyOfApp({ mode: 'PROMPT', windowSeconds: 300, maxUsd: '50' }), 'prompt');
  assert.equal(policyOfApp({ mode: 'WINDOW', windowSeconds: 300, maxUsd: 'nope' }), 'prompt');
  assert.deepEqual(policyOfApp({ mode: 'WINDOW', windowSeconds: 300, maxUsd: '50' }), window5m);
  assert.equal(policyOfApp({ mode: 'AUTO', windowSeconds: 300, maxUsd: '50' }), 'auto');
});

test('the stricter policy wins; two windows keep the shorter time and the lower total', () => {
  assert.equal(stricterPolicy('auto', 'prompt'), 'prompt');
  assert.deepEqual(stricterPolicy('auto', window5m), window5m);
  assert.equal(stricterPolicy(window5m, 'prompt'), 'prompt');
  assert.deepEqual(stricterPolicy(window5m, { window: { seconds: 600, maxUsd: 20 } }), {
    window: { seconds: 300, maxUsd: 20 },
  });
});

test('unset in code, the dashboard decides; set, the code can only make it stricter', () => {
  const appWindow = { mode: 'WINDOW', windowSeconds: 300, maxUsd: '50' } as const;
  assert.deepEqual(effectivePolicy(undefined, appWindow), window5m);
  assert.equal(effectivePolicy(undefined, null), 'prompt');
  assert.deepEqual(effectivePolicy('auto', appWindow), window5m);
  assert.equal(effectivePolicy('prompt', { mode: 'AUTO', windowSeconds: 300, maxUsd: '50' }), 'prompt');
});

test('a payment the SDK builds is valued in USD; anything else is not', () => {
  const stellar = (amount: string, asset: unknown) =>
    usdValueOf({ kind: 'build_sign_submit', network: 'STELLAR', operation: 'payment', details: { amount, asset } }, prices);
  assert.equal(stellar('10', { type: 'native' }), 2.5);
  assert.equal(stellar('12.5', { type: 'credit_alphanum4', code: 'USDC', issuer: USDC_ISSUER }), 12.5);
  assert.equal(stellar('1', { type: 'credit_alphanum4', code: 'EURC', issuer: USDC_ISSUER }), null);

  const solana = (amount: string, mint?: string) =>
    usdValueOf({ kind: 'build_sign_submit', network: 'SOLANA', operation: 'payment', details: { amount, mint } }, prices);
  assert.equal(solana('100000000'), 15);
  assert.equal(solana('2500000', SOL_USDC), 2.5);
  assert.equal(solana('1.5'), null);

  // Polygon has no price here, a raw transaction names no value, a swap is not a payment.
  assert.equal(
    usdValueOf({ kind: 'build_sign_submit', network: 'POLYGON', operation: 'payment', details: { amount: '1' } }, prices),
    null,
  );
  assert.equal(usdValueOf({ kind: 'sign', network: 'STELLAR' }, prices), null);
  assert.equal(
    usdValueOf({ kind: 'build_sign_submit', network: 'STELLAR', operation: 'swap', details: { amount: '1' } }, prices),
    null,
  );
});

test('the window signs what fits until it closes, and asks for what it cannot value', () => {
  const w = new ConfirmationWindow();
  assert.equal(w.isOpen(300, 0), false);
  w.open(0);
  assert.equal(w.isOpen(300, 299_999), true);
  assert.equal(w.take(30, 50), true);
  assert.equal(w.take(30, 50), false, 'the total, not each signature, is capped');
  assert.equal(w.take(20, 50), true);
  assert.equal(w.take(null, 50), false);
  assert.equal(w.isOpen(300, 300_000), false, 'closes after its seconds');
  w.open(400_000);
  assert.equal(w.take(50, 50), true, 'a new confirmation starts a new total');
  w.close();
  assert.equal(w.isOpen(300, 400_001), false);
});

// The client end to end, without a network: the dashboard setting and the
// prices are stubbed, and a subscriber stands in for the prompt.
type Probe = {
  getAppConfig: () => Promise<unknown>;
  _usdPrices: () => Promise<UsdPrice[]>;
  _rampSigning: number;
  _confirm: (input: Record<string, unknown>) => Promise<{ ok: boolean; code?: string }>;
  onConfirmationRequest: (cb: (pending: Array<{ confirm: () => void }>) => void) => () => void;
};
function clientWith(app: Record<string, unknown>, confirmation?: unknown): { client: Probe; asked: () => number } {
  const client = new PollarClient({
    apiKey: 'pub_testnet_probe',
    ...(confirmation ? { confirmation } : {}),
  } as never) as unknown as Probe;
  client.getAppConfig = async () => ({ application: { signConfirmation: app } });
  client._usdPrices = async () => prices;
  let asked = 0;
  client.onConfirmationRequest((pending) => {
    if (pending[0]) {
      asked++;
      pending[0].confirm();
    }
  });
  return { client, asked: () => asked };
}
const payXlm = (amount: string) => ({
  kind: 'build_sign_submit',
  network: 'STELLAR',
  operation: 'payment',
  details: { destination: 'G', amount, asset: { type: 'native' } },
});

test('a ramp leg asks even when the app and its code both say auto', async () => {
  const { client, asked } = clientWith({ mode: 'AUTO', windowSeconds: 300, maxUsd: '50' }, 'auto');
  assert.deepEqual(await client._confirm({ kind: 'sign', network: 'STELLAR' }), { ok: true });
  assert.equal(asked(), 0);
  client._rampSigning = 1;
  assert.equal((await client._confirm({ kind: 'sign', network: 'STELLAR' })).ok, true);
  assert.equal(asked(), 1, 'the ramp leg was put to the user');
});

test('a confirmed payment opens the window: the next ones up to the total sign without asking', async () => {
  const { client, asked } = clientWith({ mode: 'WINDOW', windowSeconds: 300, maxUsd: '50' });
  await client._confirm(payXlm('400')); // 100 USD: asked, and opens the window
  await client._confirm(payXlm('120')); // 30 USD: fits
  await client._confirm(payXlm('120')); // 30 more: over 50, asked, and a new window
  await client._confirm({ kind: 'sign', network: 'STELLAR' }); // no value: asked
  assert.equal(asked(), 3);
});

test('a code that sets prompt asks every time, whatever the dashboard window', async () => {
  const { client, asked } = clientWith({ mode: 'WINDOW', windowSeconds: 300, maxUsd: '50' }, 'prompt');
  await client._confirm(payXlm('4'));
  await client._confirm(payXlm('4'));
  assert.equal(asked(), 2);
});
