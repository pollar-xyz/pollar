import * as fs from 'node:fs';
import * as path from 'node:path';
import { compareVersions, parseVersion } from './version';

const SKIPPED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
  '.next',
  '.expo',
  '.turbo',
  '.vercel',
  '.output',
  'android',
  'ios',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

export const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

export interface PackageJsonFile {
  path: string;
  text: string;
  json: Record<string, unknown>;
}

export interface ProjectFiles {
  sources: string[];
  packageJsons: PackageJsonFile[];
}

export function listProjectFiles(root: string): ProjectFiles {
  const sources: string[] = [];
  const packageJsons: PackageJsonFile[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile()) {
        if (entry.name === 'package.json') {
          const pkg = readPackageJson(full);
          if (pkg) packageJsons.push(pkg);
        } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !/\.d\.[mc]?ts$/.test(entry.name)) {
          sources.push(full);
        }
      }
    }
  };
  walk(root);
  return { sources: sources.sort(), packageJsons };
}

function readPackageJson(file: string): PackageJsonFile | null {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(text) as unknown;
    if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
    return { path: file, text, json: json as Record<string, unknown> };
  } catch {
    return null;
  }
}

export function dependencyRange(pkg: PackageJsonFile, name: string): string | null {
  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg.json[field];
    if (typeof deps === 'object' && deps !== null && typeof (deps as Record<string, unknown>)[name] === 'string') {
      return (deps as Record<string, string>)[name] ?? null;
    }
  }
  return null;
}

export function hasDependency(packageJsons: PackageJsonFile[], name: string): boolean {
  return packageJsons.some((pkg) => dependencyRange(pkg, name) !== null);
}

/** Version of `name` installed for the package in `dir`, resolved the way Node does. */
function installedVersion(dir: string, name: string): string | null {
  let current = dir;
  for (;;) {
    const manifest = path.join(current, 'node_modules', name, 'package.json');
    try {
      const version = (JSON.parse(fs.readFileSync(manifest, 'utf8')) as { version?: unknown }).version;
      if (typeof version === 'string') return version;
    } catch {
      // not installed at this level
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The oldest @pollar release any package of the project is on: what is installed
 * when node_modules exists, else the floor of the declared range. React Native is
 * left out below 0.11.4, when it still had its own 0.1.x version line.
 */
export function detectFromVersion(packageJsons: PackageJsonFile[]): string | null {
  let oldest: string | null = null;
  for (const pkg of packageJsons) {
    for (const name of ['@pollar/core', '@pollar/react', '@pollar/react-native']) {
      const range = dependencyRange(pkg, name);
      if (range === null) continue;
      const version = installedVersion(path.dirname(pkg.path), name) ?? range;
      if (!parseVersion(version)) continue;
      if (name === '@pollar/react-native' && compareVersions(version, '0.11.4') < 0) continue;
      const floor = parseVersion(version)!.join('.');
      if (oldest === null || compareVersions(floor, oldest) < 0) oldest = floor;
    }
  }
  return oldest;
}
