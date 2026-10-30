#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { migrate } from './migrate';
import { formatReport } from './report';
import { GUIDE_URL, TARGET_VERSION, parseVersion } from './version';

const HELP = `Usage: npx @pollar/migrate [dir] [options]

Reports every change an app on @pollar 0.5 or later needs to run on ${TARGET_VERSION},
file by file, and applies the mechanical ones with --fix.

Options:
  --fix          Write the fixable changes (code and package.json ranges)
  --from <ver>   The release the app is on (default: read from node_modules or package.json)
  --json         Print the result as JSON (for scripts and coding agents)
  -h, --help     Show this help

Guide: ${GUIDE_URL}`;

function main(): number {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        fix: { type: 'boolean', default: false },
        from: { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error(HELP);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.from !== undefined && !parseVersion(values.from)) {
    console.error(`--from takes a version such as 0.5.3, got "${values.from}"`);
    return 2;
  }

  const result = migrate({
    root: positionals[0] ?? process.cwd(),
    fix: values.fix,
    ...(values.from !== undefined ? { from: values.from } : {}),
  });
  console.log(values.json ? JSON.stringify(result, null, 2) : formatReport(result, { fix: values.fix }));
  return 0;
}

process.exitCode = main();
