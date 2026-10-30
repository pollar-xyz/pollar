/** The release this tool upgrades to. */
export const TARGET_VERSION = '0.12.0';

export const GUIDE_URL = 'https://docs.pollar.xyz/docs/guides/upgrade-to-0-12';

export function docsUrl(anchor: string): string {
  return `${GUIDE_URL}#${anchor}`;
}

type Triple = [number, number, number];

/** Reads the first `x.y.z` in a version or a range (`^0.5.3` -> 0.5.3). */
export function parseVersion(text: string): Triple | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i += 1) {
    const diff = left[i]! - right[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True when an app on `from` still has to go through the change made in `since`. */
export function applies(since: string, from: string | null): boolean {
  return from === null || compareVersions(from, since) < 0;
}
