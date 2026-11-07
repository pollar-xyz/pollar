// @pollar smoke test: Earn on Solana, Solana swaps that deliver to another
// chain, and how a ramp screen words a Pix code, a transfer reference, a Pix
// key and a verification the provider is reviewing.
//
// - Earn reads ask with `chain=SOLANA`, a busy provider (503) is asked again,
//   an external wallet signs the build and submits it under the build key, a
//   co-signed wallet's build is the co-sign request, a refusal is its code.
// - Swap options carry the destination chains; a quote and its build carry
//   `destinationChain`; an expired quote is refused before anything is built;
//   the status of a swap is read by its key.
//
// Run with `node tests/smoke-solana-earn-swap.cjs` after the build. Mocks
// `fetch`, `window` and `localStorage`, so no network is needed.

const path = require('node:path');

globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const sdk = require(path.resolve(__dirname, '../packages/core/dist/index.js'));

let pass = 0;
let fail = 0;
function check(label, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  OK    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`, extra ?? '');
  }
}

const SOLANA_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_POLYGON = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const UNSIGNED = 'aa'.repeat(8);

async function clientWith(wallets, apiKey, extra = {}) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  const apiKeyHash = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const storage = sdk.createMemoryAdapter();
  await storage.set(
    `pollar:${apiKeyHash}:session`,
    JSON.stringify({
      clientSessionId: 'cs',
      userId: 'u',
      status: 'CONSUMED',
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
      user: { ready: true },
      wallet: { type: 'external', provider: 'phantom', address: null, chain: 'STELLAR' },
      wallets,
    }),
  );
  const client = new sdk.PollarClient({ apiKey, storage, baseUrl: 'https://x.test', logLevel: 'silent', ...extra });
  await client.ready();
  return client;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

const opportunity = {
  chain: 'SOLANA',
  provider: 'aggregator',
  id: 'opp-usdc',
  name: 'USDC vault',
  kind: 'vault',
  asset: { code: 'USDC', address: USDC, decimals: 6 },
  apy: 3.96,
  actions: ['deposit', 'withdraw'],
  paused: false,
  metadata: { protocol: null },
};
const position = {
  chain: 'SOLANA',
  provider: 'aggregator',
  opportunityId: 'opp-usdc',
  address: SOLANA_WALLET,
  balance: '10.5',
  principal: '10',
  profit: '0.5',
  withdrawUnit: 'asset',
  withdrawable: '10.5',
  apy: 3.96,
  stale: false,
};
const earnBuild = {
  chain: 'SOLANA',
  action: 'deposit',
  opportunityId: 'opp-usdc',
  unsignedTransaction: UNSIGNED,
  idempotencyKey: 'k',
  recentBlockhash: 'hash',
  lastValidBlockHeight: 100,
  feeLamports: '5000',
  feePayer: SOLANA_WALLET,
  sponsored: false,
};
const crossQuote = {
  chain: 'SOLANA',
  provider: 'multichain',
  inputMint: USDC,
  outputMint: USDT_POLYGON,
  inAmount: '1500000',
  outAmount: '1490000',
  minOut: '1480000',
  priceImpactPct: null,
  route: { hops: [] },
  destinationChain: 'POLYGON',
  outputSymbol: 'USDT',
  outputDecimals: 6,
  feeBreakdown: {
    charges: [
      { kind: 'routing', amount: '5000', amountUsd: 0.005, asset: 'input', symbol: 'USDC', decimals: 6 },
      { kind: 'bridge_and_slippage', amount: null, amountUsd: 0.01, asset: null, symbol: null, decimals: null },
    ],
    totalFeesUsd: 0.015,
    bridgeAndSlippageUsd: 0.01,
  },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

(async () => {
  const calls = [];
  const answers = {};
  globalThis.fetch = async (req) => {
    const url = new URL(req.url);
    const body = req.method === 'GET' ? null : JSON.parse((await req.text()) || 'null');
    calls.push({ method: req.method, path: url.pathname, query: url.searchParams, body });
    if (url.pathname.endsWith('/applications/config')) {
      return json({
        success: true,
        content: { application: { signConfirmation: { mode: 'AUTO', windowSeconds: 0, maxUsd: '0' } } },
      });
    }
    for (const [suffix, answer] of Object.entries(answers)) if (url.pathname.endsWith(suffix)) return answer(url, body);
    if (url.pathname.endsWith('/tx/submit')) {
      return json({ success: true, code: 'SDK_TX_SUBMIT', content: { hash: 'sig-1', status: 'SUCCESS', summary: {} } });
    }
    return json({ success: true, content: {} });
  };

  const external = await clientWith(
    [{ type: 'external', provider: 'phantom', address: SOLANA_WALLET, chain: 'SOLANA' }],
    'pk_smoke_earn_swap_external',
  );
  const signedBy = [];
  external._walletAdapter = {
    type: 'phantom',
    signSolanaTransaction: async (bytes) => {
      signedBy.push([...bytes]);
      return Uint8Array.from([...bytes, 0xbb]);
    },
  };

  console.log('\n-- 1. Earn reads on Solana --');
  answers['/earn/providers'] = () =>
    json({ success: true, code: 'SDK_EARN_PROVIDERS', content: { chain: 'SOLANA', providers: ['aggregator'] } });
  let busy = 1;
  answers['/earn/opportunities'] = () =>
    busy-- > 0
      ? json({ success: false, code: 'SDK_EARN_BUILD_ERROR', message: 'busy' }, 503)
      : json({ success: true, code: 'SDK_EARN_OPPORTUNITIES', content: { opportunities: [opportunity] } });
  answers['/earn/position'] = () => json({ success: true, code: 'SDK_EARN_POSITION', content: position });
  calls.length = 0;
  const providers = await external.getSolanaEarnProviders();
  check('the providers come back', providers.join() === 'aggregator', providers);
  check('  asked for with ?chain=SOLANA', calls.at(-1).query.get('chain') === 'SOLANA', String(calls.at(-1).query));
  calls.length = 0;
  const opps = await external.getSolanaEarnOpportunities();
  check('a busy provider is asked again and the opportunities come back', opps.length === 1 && opps[0].apy === 3.96, opps);
  check(
    '  twice, both with ?chain=SOLANA',
    calls.filter((c) => c.path.endsWith('/earn/opportunities')).length === 2 && calls.at(-1).query.get('chain') === 'SOLANA',
  );
  const pos = await external.getSolanaEarnPosition('opp-usdc');
  check('the position carries profit and APY', pos.profit === '0.5' && pos.apy === 3.96, pos);
  check(
    '  read by chain and opportunity, without an address',
    calls.at(-1).query.get('chain') === 'SOLANA' &&
      calls.at(-1).query.get('opportunity') === 'opp-usdc' &&
      !calls.at(-1).query.has('address'),
    String(calls.at(-1).query),
  );
  busy = 5;
  const stillBusy = await external.getSolanaEarnOpportunities().catch((err) => err);
  check(
    'a provider busy every time throws its code',
    sdk.isPollarApiError(stillBusy) && stillBusy.code === 'SDK_EARN_BUILD_ERROR',
    stillBusy,
  );

  console.log('\n-- 2. An external wallet deposits --');
  let buildBusy = 1;
  answers['/earn/build'] = () =>
    buildBusy-- > 0
      ? json({ success: false, code: 'SDK_EARN_BUILD_ERROR' }, 503)
      : json({ success: true, code: 'SDK_EARN_BUILD', content: earnBuild });
  calls.length = 0;
  const deposited = await external.earnSolanaDeposit({ opportunity: 'opp-usdc', amount: '1.5', idempotencyKey: 'earn-key-1' });
  check('the deposit succeeds', deposited.status === 'success' && deposited.hash === 'sig-1', deposited);
  const builds = calls.filter((c) => c.path.endsWith('/earn/build'));
  check(
    'a busy build is sent again under the same key',
    builds.length === 2 && builds[0].body.idempotencyKey === builds[1].body.idempotencyKey,
  );
  check(
    'the build names the chain, the action, the opportunity, the amount and the key',
    builds[1].body.chain === 'SOLANA' &&
      builds[1].body.action === 'deposit' &&
      builds[1].body.opportunity === 'opp-usdc' &&
      builds[1].body.amount === '1.5' &&
      builds[1].body.idempotencyKey === 'earn-key-1',
    builds[1].body,
  );
  const submit = calls.find((c) => c.path.endsWith('/tx/submit'));
  check(
    'the signed transaction is submitted under the build key',
    signedBy.length === 1 &&
      submit &&
      submit.body.signedTransaction === `${UNSIGNED}bb` &&
      submit.body.idempotencyKey === 'earn-key-1',
    submit && submit.body,
  );
  answers['/earn/build'] = () =>
    json(
      {
        success: false,
        code: 'SDK_EARN_WALLET_UNSUPPORTED',
        message: 'Earn on Solana is not available for custodial wallets yet.',
      },
      422,
    );
  signedBy.length = 0;
  const refused = await external.earnSolanaWithdraw({ opportunity: 'opp-usdc', amount: '1' });
  check(
    'a refused build is its code with the SDK message, and nothing is signed',
    refused.status === 'error' &&
      refused.code === 'SDK_EARN_WALLET_UNSUPPORTED' &&
      /not available for this wallet/.test(refused.message ?? '') &&
      signedBy.length === 0,
    refused,
  );
  check(
    'the catalog words it in Portuguese too',
    /carteira/.test(sdk.authErrorMessage('SDK_EARN_WALLET_UNSUPPORTED', 'pt') ?? ''),
  );

  console.log('\n-- 3. A co-signed wallet: the build is the co-sign request --');
  const cosigned = await clientWith(
    [{ type: 'internal', address: SOLANA_WALLET, chain: 'SOLANA' }],
    'pk_smoke_earn_swap_cosign',
    { cosignManual: true },
  );
  const cosignRequest = {
    id: 'req-earn',
    kind: 'TX',
    network: 'SOLANA',
    status: 'PENDING',
    subOrgId: 'sub',
    activityId: null,
    fingerprint: null,
    signWith: SOLANA_WALLET,
    unsignedPayload: UNSIGNED,
    payloadHash: '00',
    refreshable: true,
    intent: 'sign_and_send',
    operation: 'earn_deposit',
    summary: 'Deposit 1.5 USDC',
    details: { action: 'deposit', amount: '1.5', mint: USDC, feePayer: SOLANA_WALLET, sponsored: false },
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  answers['/earn/build'] = () =>
    json(
      { success: true, code: 'SDK_COSIGN_PENDING', content: { pendingSignature: { kind: 'cosign', request: cosignRequest } } },
      202,
    );
  const pending = await cosigned.earnSolanaDeposit({ opportunity: 'opp-usdc', amount: '1.5' });
  check('the deposit waits on the device', pending.status === 'cosign_pending' && pending.request.id === 'req-earn', pending);

  console.log('\n-- 4. Swaps that deliver to another chain --');
  answers['/swap/config'] = () =>
    json({
      success: true,
      code: 'SDK_SWAP_CONFIG',
      content: { venues: ['jupiter', 'multichain'], destinationChains: ['POLYGON'] },
    });
  const options = await external.getSolanaSwapOptions();
  check(
    'the options carry the venues and the destination chains',
    options.venues.join() === 'jupiter,multichain' && options.destinationChains.join() === 'POLYGON',
    options,
  );
  answers['/swap/config'] = () => json({ success: true, code: 'SDK_SWAP_CONFIG', content: { venues: ['jupiter'] } });
  check('no destination chains is an empty list', (await external.getSolanaSwapOptions()).destinationChains.length === 0);
  answers['/swap/quote'] = () =>
    json({ success: true, code: 'SDK_SWAP_QUOTE', content: { quotes: [crossQuote], best: 'multichain' } });
  calls.length = 0;
  const quotes = await external.getSolanaSwapQuote({
    inputMint: USDC,
    outputMint: USDT_POLYGON,
    amount: '1500000',
    destinationChain: 'POLYGON',
  });
  check('the quote carries its fees and expiry', quotes[0].feeBreakdown.charges.length === 2 && !!quotes[0].expiresAt, quotes);
  check('  quoted with the destination chain', calls.at(-1).body.destinationChain === 'POLYGON', calls.at(-1).body);

  const expired = { ...crossQuote, expiresAt: new Date(Date.now() - 1_000).toISOString() };
  calls.length = 0;
  const late = await external.swapSolana(expired);
  check(
    'an expired quote is refused before anything is built',
    late.status === 'error' && late.code === 'SDK_SWAP_QUOTE_EXPIRED',
    late,
  );
  check('  without calling the build', !calls.some((c) => c.path.endsWith('/swap/build')));

  answers['/swap/build'] = () =>
    json({ success: true, code: 'SDK_TX_BUILT', content: { ...earnBuild, quote: crossQuote, sponsored: true } });
  calls.length = 0;
  signedBy.length = 0;
  const crossed = await external.swapSolana(crossQuote, { idempotencyKey: 'swap-key-1' });
  check('the swap lands on Solana', crossed.status === 'success', crossed);
  const swapBuild = calls.find((c) => c.path.endsWith('/swap/build'));
  check(
    'the build carries the venue, the destination chain and the key',
    swapBuild.body.provider === 'multichain' &&
      swapBuild.body.destinationChain === 'POLYGON' &&
      swapBuild.body.outputMint === USDT_POLYGON &&
      swapBuild.body.idempotencyKey === 'swap-key-1',
    swapBuild.body,
  );

  answers['/swap/status'] = (url) =>
    url.searchParams.get('idempotencyKey') === 'swap-key-1'
      ? json({
          success: true,
          code: 'SDK_SWAP_STATUS',
          content: {
            idempotencyKey: 'swap-key-1',
            status: 'BUILT',
            phase: 'SUBMITTED',
            txHash: 'sig-1',
            settlement: {
              status: 'HELD',
              destinationChain: 'POLYGON',
              destinationAddress: '0xAae901C9cC8A88611C041BB4C1EEE81a895CB943',
              destinationToken: USDT_POLYGON,
              destinationTxHash: null,
              feeBreakdown: null,
              resolvedAt: null,
            },
          },
        })
      : json({ success: false, code: 'SDK_SWAP_NOT_FOUND' }, 404);
  const status = await external.getSwapStatus('swap-key-1');
  check('the status is read by the key', status.status === 'BUILT' && status.settlement.status === 'HELD', status);
  const unknown = await external.getSwapStatus('nope').catch((err) => err);
  check(
    'an unknown key throws SDK_SWAP_NOT_FOUND',
    sdk.isPollarApiError(unknown) && unknown.code === 'SDK_SWAP_NOT_FOUND',
    unknown,
  );

  console.log('\n-- 5. Ramp screens: Pix code, reference, Pix key, a review on the provider side --');
  const pixPayload =
    '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano6008BRASILIA62070503***6304ABCD';
  const qrOrder = (scannable) => ({
    state: 'awaiting_payment',
    pendingAction: {
      kind: 'FIAT_PAYMENT',
      actionId: 'a',
      legIndex: 0,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      instructions: { kind: 'qr', payload: pixPayload, amount: '50.00', currency: 'BRL', ...(scannable && { scannable }) },
    },
  });
  const rendered = {
    kind: 'pix',
    payload: pixPayload,
    payloadLabel: 'Payment code',
    image: { mediaType: 'image/svg+xml', encoding: 'utf8', data: '<svg/>', inlineSafe: true },
  };
  const pt = sdk.describeRampAction(qrOrder(rendered), 'pt');
  check(
    'a Pix code is labelled copy and paste in the screen language',
    pt.scannable.payloadLabel === 'Código Pix copia e cola',
    pt.scannable,
  );
  const bare = sdk.describeRampAction(qrOrder(null), 'es');
  check(
    'a Pix code without its image is still offered to copy, and is not missing',
    bare.pasteCode && bare.pasteCode.value === pixPayload && !bare.codeMissing,
    bare,
  );
  const bank = sdk.describeRampAction(
    {
      state: 'awaiting_payment',
      pendingAction: {
        kind: 'FIAT_PAYMENT',
        actionId: 'b',
        legIndex: 0,
        expiresAt: null,
        instructions: {
          kind: 'bank_transfer',
          amount: '100.00',
          currency: 'USD',
          details: [{ label: 'Routing number', value: '026009593' }],
          reference: 'POLLAR-7Q2',
        },
      },
    },
    'en',
  );
  check(
    'a transfer reference is a required detail with a note saying why',
    bank.details.some((d) => d.label === 'Reference (required)' && d.value === 'POLLAR-7Q2') &&
      /description or memo/.test(bank.note ?? ''),
    bank,
  );
  const reviewing = sdk.describeRampAction(
    {
      state: 'created',
      pendingAction: {
        kind: 'KYC',
        actionId: 'k',
        legIndex: 0,
        url: null,
        steps: [{ stepId: 's', purpose: 'verification', status: 'awaiting_provider', url: null, instructions: 'Reviewing.' }],
      },
    },
    'es',
  );
  check(
    'a verification on the provider side with no link reads as in review',
    reviewing.title === 'Verificación en revisión' && reviewing.link === null,
    reviewing,
  );
  const fields = sdk.rampQuoteFields(
    { legs: [{ requiredFields: [{ key: 'pixKey', label: 'Pix key', type: 'text', bankType: 'PIX' }] }] },
    'pt',
  );
  check('the Pix key field is labelled in the screen language', fields[0].label === 'Chave Pix' && !!fields[0].hint, fields);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
