const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const filename = require.resolve('../packages/react/src/components/ramp-widget/ramp-quotes.ts');
const loaded = new Module(filename, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  filename,
);
const { quoteRampOptions } = loaded.exports;
const query = { country: 'AR', currency: 'ARS', direction: 'onramp', amount: 123 };
const stellar = { ...query, fiatCurrency: 'ARS', routeId: 'stellar', asset: { chain: 'STELLAR' } };
const solana = { ...stellar, routeId: 'solana', asset: { chain: 'SOLANA' } };
async function main() {
  const calls = [];
  const client = {
    async getRampsQuote(q) {
      calls.push(q);
      const route = q.routeId === 'solana' ? solana : stellar;
      return { quotes: [{ quoteId: route.routeId, provider: 'fixture', route, rail: 'ACH', protocol: 'REST' }] };
    },
  };
  const result = await quoteRampOptions(client, query, [stellar, stellar, solana, solana]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].routeId, undefined);
  assert.equal(calls[1].routeId, 'solana');
  assert.equal(result.quotes.length, 2);
  calls.length = 0;
  await quoteRampOptions(client, query, [stellar]);
  assert.equal(calls.length, 1);
  const fallback = await quoteRampOptions(
    {
      async getRampsQuote(q) {
        if (!q.routeId) throw new Error('default unavailable');
        return { quotes: [{ provider: 'fixture', route: solana }] };
      },
    },
    query,
    [solana],
  );
  assert.equal(fallback.quotes.length, 1);
  await assert.rejects(
    quoteRampOptions(
      {
        async getRampsQuote() {
          throw new Error('RATE_LIMITED');
        },
      },
      query,
      [],
    ),
    /RATE_LIMITED/,
  );
  console.log('Ramp quote requests: covered routes, other chains, duplicates and failures passed');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
