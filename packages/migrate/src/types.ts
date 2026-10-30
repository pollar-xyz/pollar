/** How much a finding matters once the app runs on the target release. */
export type Severity = 'error' | 'warning' | 'info';

/**
 * `fixable`: the tool can apply it (run with `fix`). `fixed`: it applied it.
 * `manual`: a person (or an agent) has to make the change.
 */
export type FindingStatus = 'fixable' | 'fixed' | 'manual';

export interface Finding {
  /** Stable rule id, e.g. `react-context-renames`. */
  rule: string;
  /** The @pollar release that made the change. */
  since: string;
  severity: Severity;
  status: FindingStatus;
  /** Path relative to the scanned root. */
  file: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  message: string;
  /** Section of the upgrade guide that explains the change. */
  docs: string;
}

/** A text replacement in one file, by character offsets. */
export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

export interface MigrateOptions {
  /** Directory to scan. Every package.json and source file under it is read. */
  root: string;
  /** Release the app is on. Detected from the installed packages when omitted. */
  from?: string;
  /** Write the fixable changes to disk. */
  fix?: boolean;
}

export interface MigrateResult {
  root: string;
  /** Release the findings were filtered against, or null when it could not be detected. */
  from: string | null;
  to: string;
  findings: Finding[];
  /** Files written when `fix` was set, relative to the root. */
  changedFiles: string[];
  /** Behaviour changes that need no code but that every app notices. */
  notes: string[];
}
