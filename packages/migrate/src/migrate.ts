import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanPackageJson } from './packages';
import { detectFromVersion, hasDependency, listProjectFiles } from './project';
import { type RawFinding, type RuleSpec, scanSource } from './rules';
import type { Finding, MigrateOptions, MigrateResult, TextEdit } from './types';
import { TARGET_VERSION, applies, compareVersions, docsUrl } from './version';

const CONFIRMATION: RuleSpec = {
  id: 'confirmation-handler',
  since: '0.12.0',
  severity: 'warning',
  docs: 'signature-confirmation',
};
const RANDOM_VALUES: RuleSpec = {
  id: 'rn-random-values',
  since: '0.7.0',
  severity: 'warning',
  docs: '3-what-every-app-notices',
};

export function migrate(options: MigrateOptions): MigrateResult {
  const root = path.resolve(options.root);
  const fix = options.fix === true;
  const { sources, packageJsons } = listProjectFiles(root);
  const from = options.from ?? detectFromVersion(packageJsons);
  const findings: Finding[] = [];
  const changedFiles: string[] = [];
  // Written only once every file has been read, so a failure leaves the project untouched.
  const writes: Array<{ file: string; text: string }> = [];

  const settle = (file: string, text: string, raws: RawFinding[]) => {
    const relevant = raws.filter((raw) => applies(raw.spec.since, from));
    const accepted = acceptEdits(relevant);
    const relative = path.relative(root, file) || path.basename(file);
    for (const raw of relevant) {
      const { line, column } = position(text, raw.pos);
      findings.push({
        rule: raw.spec.id,
        since: raw.spec.since,
        severity: raw.spec.severity,
        status: accepted.has(raw) ? (fix ? 'fixed' : 'fixable') : 'manual',
        file: relative,
        line,
        column,
        message: raw.message,
        docs: docsUrl(raw.spec.docs),
      });
    }
    if (fix && accepted.size > 0) {
      const edits = [...accepted].flatMap((raw) => raw.edits ?? []);
      writes.push({ file, text: applyEdits(text, edits) });
      changedFiles.push(relative);
    }
  };

  for (const pkg of packageJsons) settle(pkg.path, pkg.text, scanPackageJson(pkg));

  let clientAt: { file: string; text: string; pos: number } | null = null;
  let answersConfirmations = false;
  let importsRandomValues = false;
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    const scan = scanSource(file, text);
    if (scan.clientConstruction !== null && !clientAt) clientAt = { file, text, pos: scan.clientConstruction };
    answersConfirmations ||= scan.answersConfirmations;
    importsRandomValues ||= scan.importsRandomValues;
    settle(file, text, scan.findings);
  }

  const usesProvider = hasDependency(packageJsons, '@pollar/react') || hasDependency(packageJsons, '@pollar/react-native');
  if (clientAt && !usesProvider && !answersConfirmations) {
    settle(clientAt.file, clientAt.text, [
      {
        spec: CONFIRMATION,
        pos: clientAt.pos,
        message:
          'A headless app: from 0.12 every signature waits for the user unless the dashboard policy says otherwise. Subscribe to `client.onConfirmationRequest()` or every signature fails with SDK_CONFIRMATION_UNAVAILABLE.',
      },
    ]);
  }

  const rootPackage = packageJsons.find((pkg) => hasDependency([pkg], 'react-native') && hasDependency([pkg], '@pollar/core'));
  if (rootPackage && !importsRandomValues) {
    settle(rootPackage.path, rootPackage.text, [
      {
        spec: RANDOM_VALUES,
        pos: Math.max(0, rootPackage.text.indexOf('"react-native"')),
        message:
          "React Native: import 'react-native-get-random-values' at the entry of the app. Signing a session needs it (0.7).",
      },
    ]);
  }

  for (const write of writes) fs.writeFileSync(write.file, write.text);
  return { root, from, to: TARGET_VERSION, findings, changedFiles, notes: notesFor(from) };
}

/**
 * The findings whose edits can all be applied: a finding whose edits overlap an
 * earlier accepted one stays manual instead of corrupting the file.
 */
function acceptEdits(raws: RawFinding[]): Set<RawFinding> {
  const accepted = new Set<RawFinding>();
  const taken: TextEdit[] = [];
  const overlaps = (a: TextEdit, b: TextEdit) => a.start < b.end && b.start < a.end;
  for (const raw of raws) {
    if (!raw.edits || raw.edits.length === 0) continue;
    if (
      raw.edits.some((edit) =>
        taken.some((other) => overlaps(edit, other) || (edit.start === other.start && edit.end === other.end)),
      )
    ) {
      continue;
    }
    accepted.add(raw);
    taken.push(...raw.edits);
  }
  return accepted;
}

function applyEdits(text: string, edits: TextEdit[]): string {
  let out = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

function position(text: string, pos: number): { line: number; column: number } {
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  return { line, column: pos - before.lastIndexOf('\n') };
}

function notesFor(from: string | null): string[] {
  const notes: string[] = [];
  const before = (version: string) => from === null || compareVersions(from, version) < 0;
  if (before('0.10.0'))
    notes.push('Every user signs in again once after you deploy: sessions saved by older releases are not read.');
  if (before('0.7.0')) notes.push('The app must run on HTTPS (or localhost): sessions are bound to a key on the device.');
  if (before('0.11.0'))
    notes.push(
      'The release the app is on calls SDK API v1, which is retired on 2026-11-30. Ship the upgrade before that date.',
    );
  notes.push(
    "Every signature asks the user first (0.12) unless the app's policy in the dashboard (Wallet settings > Signature confirmation) says otherwise.",
  );
  notes.push(
    'After the fixes: install the new versions, run your type check (tsc --noEmit), and test sign-in and a transaction.',
  );
  return notes;
}
