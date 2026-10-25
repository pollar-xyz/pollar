const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrate } = require('../packages/migrate/dist/index.js');

// The list of 0.12 exports the CLI checks imports against matches the build.
execFileSync(process.execPath, [path.join(__dirname, '..', 'packages/migrate/scripts/generate-exports.cjs'), '--check'], {
  stdio: 'inherit',
});

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pollar-migrate-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

const PACKAGE_053 = `{
  "name": "app",
  "dependencies": {
    "@pollar/core": "^0.5.3",
    "@pollar/react": "^0.5.3",
    "@pollar/privy-adapter": "^0.7.0",
    "react": "^19.0.0"
  }
}
`;

const APP_053 = `import { PollarProvider, usePollar } from '@pollar/react';
import type { EscrowAdapter, RampsQuoteQuery } from '@pollar/core';
import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';

const escrow: EscrowAdapter = {};

export function App() {
  return (
    <PollarProvider config={{ apiKey: 'pub_x', baseUrl: 'https://sdk.api.pollar.xyz/v1', walletAdapter: stellarWalletsKit() }}>
      <Wallet />
    </PollarProvider>
  );
}

function Wallet() {
  const {
    walletAddress,
    transaction,
    getClient,
  } = usePollar();
  const pollar = usePollar();
  const client = getClient();
  client.getRampsQuote({} as RampsQuoteQuery);
  client.loginWallet('freighter');
  client.setTrustline(asset, { sponsored: true });
  const pk = client.getAuthState().session.wallet.publicKey;
  const mail = session.data.mail;
  pollar.openRampWidget();
  return <p>{walletAddress}{transaction.step}{pk}{mail}{String(escrow)}</p>;
}
`;

const APP_FIXED = `import { PollarProvider, usePollar } from '@pollar/react';
import type { PollarAdapter, RampsQuoteQuery } from '@pollar/core';
import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';

const escrow: PollarAdapter = {};

export function App() {
  return (
    <PollarProvider client={{ apiKey: 'pub_x', baseUrl: 'https://sdk.api.pollar.xyz', walletAdapters: stellarWalletsKitAdapters() }}>
      <Wallet />
    </PollarProvider>
  );
}

function Wallet() {
  const {
    tx: transaction,
    getClient,
    wallet,
  } = usePollar();
  const walletAddress = wallet?.address ?? '';
  const pollar = usePollar();
  const client = getClient();
  client.getRampsQuote({} as RampsQuoteQuery);
  client.login({ provider: 'freighter' });
  client.setTrustline(asset);
  const pk = client.getAuthState().session.wallet.address;
  const mail = session.data.mail;
  pollar.openRampModal();
  return <p>{walletAddress}{transaction.step}{pk}{mail}{String(escrow)}</p>;
}
`;

// An internal @pollar/* workspace is not the SDK, and a baseUrl outside the
// Pollar client configuration belongs to another service.
const UNRELATED = `import { Page } from '@pollar/web-kit/ui';
const providers = { STEREUM: { baseUrl: 'https://api.stereum.tech/api/v1' } };
const name = session.data.first_name;
`;

const UNRELATED_IN_SDK_FILE = `import { PollarClient } from '@pollar/core';
const stereum = { baseUrl: 'https://api.stereum.tech/api/v1' };
const client = new PollarClient({ apiKey: 'pub_x' });
const ok = info.balance !== null && Number(info.balance) > 0;
`;

const root = project({
  'package.json': PACKAGE_053,
  'src/App.tsx': APP_053,
  'src/unrelated.ts': UNRELATED,
  'src/headless.ts': UNRELATED_IN_SDK_FILE,
  'node_modules/ignored/index.ts': "import { loginWallet } from '@pollar/core';",
});

const report = migrate({ root });
assert.equal(report.from, '0.5.3', 'the release is read from package.json without node_modules');
const rules = new Set(report.findings.map((f) => f.rule));
for (const id of [
  'package-versions',
  'package-unsupported',
  'adapter-type-renames',
  'ramps-v3',
  'stellar-wallets-kit-factory',
  'provider-config-prop',
  'base-url-version',
  'wallet-adapter-array',
  'stellar-wallets-kit-network',
  'context-wallet-fields',
  'login-wallet',
  'trustline-sponsored-flag',
  'session-wallet-public-key',
  'session-profile-data',
  'react-context-renames',
]) {
  assert.ok(rules.has(id), `expected a ${id} finding`);
}
assert.ok(
  report.findings.every((f) => f.file !== path.join('src', 'unrelated.ts')),
  'a file that imports no SDK package is not scanned',
);
assert.ok(
  !report.findings.some((f) => f.file === path.join('src', 'headless.ts') && f.rule !== 'confirmation-handler'),
  "another service's baseUrl and a null-checked balance are left alone",
);
assert.ok(
  report.findings.every((f) => !f.file.startsWith('node_modules')),
  'node_modules is not scanned',
);
assert.equal(fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8'), APP_053, 'a report without fix writes nothing');

const fixed = migrate({ root, fix: true });
assert.equal(fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8'), APP_FIXED);
assert.match(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), /"@pollar\/core": "\^0\.12\.0"/);
assert.match(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), /"@pollar\/privy-adapter": "\^0\.7\.0"/);
assert.equal(fs.readFileSync(path.join(root, 'src/unrelated.ts'), 'utf8'), UNRELATED);
assert.equal(fs.readFileSync(path.join(root, 'src/headless.ts'), 'utf8'), UNRELATED_IN_SDK_FILE);
assert.ok(fixed.findings.some((f) => f.status === 'fixed'));

// Running it again finds nothing left to fix: the fixes are idempotent.
const again = migrate({ root, from: '0.5.3', fix: true });
assert.equal(again.findings.filter((f) => f.status !== 'manual').length, 0);
assert.equal(fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8'), APP_FIXED);

// An app already on 0.12 gets no code findings.
assert.equal(migrate({ root, from: '0.12.0' }).findings.length, 0);

fs.rmSync(root, { recursive: true, force: true });

// A headless app (no provider to render the prompt) is told to answer confirmations.
const headless = project({
  'package.json': '{ "dependencies": { "@pollar/core": "^0.11.5" } }',
  'src/headless.ts': UNRELATED_IN_SDK_FILE,
});
const headlessReport = migrate({ root: headless });
assert.equal(headlessReport.from, '0.11.5');
assert.deepEqual(headlessReport.findings.map((f) => f.rule).sort(), ['confirmation-handler', 'package-versions']);
fs.writeFileSync(path.join(headless, 'src/prompt.ts'), 'client.onConfirmationRequest(() => {});');
assert.ok(!migrate({ root: headless }).findings.some((f) => f.rule === 'confirmation-handler'));
fs.rmSync(headless, { recursive: true, force: true });
console.log('pollar-migrate: 0.5.3 app reported, fixed idempotently, unrelated code untouched.');
