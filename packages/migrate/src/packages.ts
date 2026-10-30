import { DEPENDENCY_FIELDS, type PackageJsonFile } from './project';
import type { RuleSpec, RawFinding } from './rules';
import type { TextEdit } from './types';
import { TARGET_VERSION, compareVersions, parseVersion } from './version';

const INSTALL: RuleSpec = {
  id: 'package-versions',
  since: TARGET_VERSION,
  severity: 'error',
  docs: '2-install-matching-versions',
};
const UNSUPPORTED: RuleSpec = {
  id: 'package-unsupported',
  since: TARGET_VERSION,
  severity: 'error',
  docs: '2-install-matching-versions',
};

/** Packages released on the 0.12 line, and the range each should be on. */
const UPGRADED = [
  '@pollar/core',
  '@pollar/react',
  '@pollar/react-native',
  '@pollar/stellar-wallets-kit-adapter',
  '@pollar/solana-wallet-standard-adapter',
];

const NO_RELEASE = ['@pollar/privy-adapter', '@pollar/accesly-adapter'];

const TARGET_RANGE = `^${TARGET_VERSION}`;

export function scanPackageJson(pkg: PackageJsonFile): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg.json[field];
    if (typeof deps !== 'object' || deps === null) continue;
    for (const [name, range] of Object.entries(deps as Record<string, unknown>)) {
      if (typeof range !== 'string') continue;
      const pos = locate(pkg.text, field, name);
      if (NO_RELEASE.includes(name)) {
        findings.push({
          spec: UNSUPPORTED,
          pos,
          message: `\`${name}\` has no 0.12 release and does not accept @pollar/core 0.12. Remove it, or keep the app on 0.11 until there is one.`,
        });
        continue;
      }
      if (!UPGRADED.includes(name)) continue;
      // workspace:, file:, link: and tags point somewhere this tool cannot judge.
      if (!parseVersion(range) || /^(workspace|file|link|npm):/.test(range)) continue;
      if (compareVersions(range, TARGET_VERSION) >= 0) continue;

      const edit = rangeEdit(pkg.text, pos, range);
      const message =
        name === '@pollar/react-native' && compareVersions(range, '0.11.4') < 0
          ? `\`${name}\` moved to the SDK's version line at 0.11.4: \`${range}\` never reaches 0.12. Set \`${TARGET_RANGE}\`.`
          : `\`${name}\` \`${range}\` does not reach 0.12. Set \`${TARGET_RANGE}\`, the same as the other @pollar packages.`;
      findings.push(edit ? { spec: INSTALL, pos, message, edits: [edit] } : { spec: INSTALL, pos, message });
    }
  }
  return findings;
}

/** Offset of `"name"` inside the `"field"` object of the raw text. */
function locate(text: string, field: string, name: string): number {
  const fieldAt = text.indexOf(`"${field}"`);
  const at = text.indexOf(`"${name}"`, fieldAt === -1 ? 0 : fieldAt);
  return at === -1 ? 0 : at;
}

function rangeEdit(text: string, keyAt: number, range: string): TextEdit | null {
  const valueAt = text.indexOf(`"${range}"`, keyAt);
  if (valueAt === -1) return null;
  return { start: valueAt + 1, end: valueAt + 1 + range.length, text: TARGET_RANGE };
}
