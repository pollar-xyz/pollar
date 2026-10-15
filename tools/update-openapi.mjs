import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    'source-revision': { type: 'string' },
  },
  allowPositionals: true,
});
if (positionals.length !== 1 || /^https?:/i.test(positionals[0]))
  throw new Error(
    'Usage: npm run core:update-openapi -- /absolute/path/openapi.json --source-revision <backend SHA> [--check]. Export the document locally; remote URLs are not accepted.',
  );
const input = resolve(positionals[0]);
const document = readFileSync(input);
const spec = JSON.parse(document.toString());
if (!/^3\./.test(spec.openapi) || !spec.paths || !spec.paths['/ramps/quote'])
  throw new Error('Expected a locally exported Pollar v2 OpenAPI document.');
const root = fileURLToPath(new URL('..', import.meta.url));
const schemaPath = join(root, 'packages/core/src/api/schema.d.ts');
const sourcePath = join(root, 'packages/core/src/api/schema-source.json');
const generatorVersion = '7.13.0';
const sourceRevision =
  values['source-revision'] ?? (values.check ? JSON.parse(readFileSync(sourcePath, 'utf8')).sourceRevision : undefined);
if (!/^[a-f0-9]{40}$/.test(sourceRevision ?? '')) throw new Error('Pass the full backend commit SHA with --source-revision.');
const provenance = {
  repository: 'pollar-xyz/pollar-platform',
  sourceRevision,
  documentSha256: createHash('sha256').update(document).digest('hex'),
  generator: `openapi-typescript@${generatorVersion}`,
};
const temporary = mkdtempSync(join(tmpdir(), 'pollar-openapi-'));
try {
  const output = values.check ? join(temporary, 'schema.d.ts') : schemaPath;
  const result = spawnSync(
    'npx',
    ['--yes', `--package=openapi-typescript@${generatorVersion}`, 'openapi-typescript', input, '--output', output],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`OpenAPI generator failed (${result.status}).`);
  const source = `${JSON.stringify(provenance, null, 2)}\n`;
  if (values.check) {
    if (readFileSync(output, 'utf8') !== readFileSync(schemaPath, 'utf8') || source !== readFileSync(sourcePath, 'utf8'))
      throw new Error('SDK schema or provenance differs from the local OpenAPI export. Regenerate before committing.');
    console.log('SDK schema and provenance match the local OpenAPI export.');
  } else writeFileSync(sourcePath, source);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
