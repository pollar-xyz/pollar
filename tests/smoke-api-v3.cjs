// @pollar smoke test — every request goes to /v3, and a retiring API version or
// an app out of credits is reported to the developer once.
//
// Run with `node tests/smoke-api-v3.cjs` after `npm run build`. Mocks `fetch`
// so no real network is required.

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

(async () => {
  const urls = [];
  let deprecate = false;
  let outOfCredits = false;
  globalThis.fetch = async (req) => {
    urls.push(req.url);
    if (outOfCredits)
      return new Response(JSON.stringify({ success: false, code: 'SDK_CREDITS_INSUFFICIENT' }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      });
    const headers = { 'content-type': 'application/json' };
    if (deprecate) {
      headers.Deprecation = 'true';
      headers.Sunset = 'Mon, 30 Nov 2026 23:59:59 GMT';
      headers.Link = '<https://docs.pollar.xyz/docs/sdk-reference/api-versions>; rel="successor-version"';
    }
    return new Response(JSON.stringify({ success: true, content: { application: { network: 'testnet' } } }), {
      status: 200,
      headers,
    });
  };
  const warnings = [];
  const logger = { error: () => {}, warn: (...args) => warnings.push(args.join(' ')), info: () => {}, debug: () => {} };

  console.log('── 1. The version prefix ─────────────────────────────────────');
  const client = new sdk.PollarClient({
    apiKey: 'pk_smoke_v3',
    storage: sdk.createMemoryAdapter(),
    baseUrl: 'https://x.test',
    logger,
  });
  await client.ready();
  await client.getAppConfig();
  check('an unauthenticated read goes to /v3', urls.at(-1) === 'https://x.test/v3/applications/config', urls.at(-1));
  check(
    'no request went to /v1 or /v2',
    urls.every((u) => u.startsWith('https://x.test/v3/')),
    urls,
  );
  // Another api key: two live clients on one key are warned about, on purpose.
  const bare = new sdk.PollarClient({ apiKey: 'pk_smoke_v3_default', storage: sdk.createMemoryAdapter(), logger });
  await bare.ready();
  await bare.getAppConfig();
  check(
    'the default origin is sdk.api.pollar.xyz, on /v3',
    urls.at(-1) === 'https://sdk.api.pollar.xyz/v3/applications/config',
    urls.at(-1),
  );
  bare.destroy();

  console.log('── 2. A retiring API version is reported once ────────────────');
  check('nothing warned while the server sent no Deprecation header', warnings.length === 0, warnings);
  deprecate = true;
  await client.getAppConfig();
  await client.getAppConfig();
  const retire = warnings.filter((w) => w.includes('deprecated'));
  check('one warning for two deprecated answers', retire.length === 1, warnings);
  check('  names the Sunset date', retire[0]?.includes('30 Nov 2026'), retire[0]);
  check(
    '  names the migration guide',
    retire[0]?.includes('https://docs.pollar.xyz/docs/sdk-reference/api-versions'),
    retire[0],
  );

  console.log('── 3. An app out of credits is reported once ─────────────────');
  outOfCredits = true;
  for (let i = 0; i < 2; i++) await client.getAppConfig().catch(() => {});
  const credits = warnings.filter((w) => w.includes('SDK_CREDITS_INSUFFICIENT'));
  check('one warning for two 402 answers', credits.length === 1, warnings);
  check('  tells the developer to top up', credits[0]?.includes('Top up'), credits[0]);
  const shown = sdk.appUnavailableMessage({ code: 'SDK_CREDITS_INSUFFICIENT' });
  check('the user text points to the app, not to credits', shown?.includes("app's support") && !/credit/i.test(shown), shown);
  check(
    '  is the same text a failed transaction shows',
    sdk.transactionErrorMessage('SDK_CREDITS_INSUFFICIENT') === shown,
    sdk.transactionErrorMessage('SDK_CREDITS_INSUFFICIENT'),
  );
  check('any other error is not this one', sdk.appUnavailableMessage({ code: 'TX_SUBMIT_FAILED' }) === null);
  client.destroy();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
