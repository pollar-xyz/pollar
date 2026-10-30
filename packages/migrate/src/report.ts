import * as path from 'node:path';
import type { Finding, MigrateResult } from './types';

const STATUS_LABEL: Record<Finding['status'], string> = {
  fixed: 'fixed  ',
  fixable: 'fixable',
  manual: 'to do  ',
};

export function formatReport(result: MigrateResult, options: { fix: boolean }): string {
  const lines: string[] = [];
  const from = result.from ?? 'unknown release (every rule applied)';
  lines.push(`pollar-migrate: ${from} -> ${result.to}`, `in ${result.root}`, '');

  const byFile = new Map<string, Finding[]>();
  for (const finding of result.findings) {
    const list = byFile.get(finding.file) ?? [];
    list.push(finding);
    byFile.set(finding.file, list);
  }
  for (const [file, findings] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(file.split(path.sep).join('/'));
    for (const finding of findings.sort((a, b) => a.line - b.line || a.column - b.column)) {
      lines.push(`  ${`${finding.line}:${finding.column}`.padEnd(8)} ${STATUS_LABEL[finding.status]}  ${finding.message}`);
      if (finding.status === 'manual') lines.push(`  ${''.padEnd(8)}          ${finding.docs}`);
    }
    lines.push('');
  }

  const count = (status: Finding['status']) => result.findings.filter((f) => f.status === status).length;
  if (result.findings.length === 0) {
    lines.push('Nothing to change in the code.');
  } else {
    const parts = [
      options.fix ? `${count('fixed')} fixed` : `${count('fixable')} fixable (run with --fix)`,
      `${count('manual')} to do by hand`,
    ];
    lines.push(parts.join(', '));
  }
  if (result.changedFiles.length > 0) lines.push(`Changed ${result.changedFiles.length} file(s).`);

  lines.push('', 'Also:');
  for (const note of result.notes) lines.push(`  - ${note}`);
  return lines.join('\n');
}
