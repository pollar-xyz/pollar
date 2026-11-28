/** A `Retry-After` header in ms: delta-seconds or an HTTP date. */
export function parseRetryAfterMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at - Date.now() : null;
}

/**
 * How long to wait after an answer the server asked to retry later: its
 * `Retry-After` (at least `floorMs`, at most `capMs`) plus up to 10s of jitter.
 * Every client behind one IP reads the same reset; without the jitter they all
 * come back in the same second and spend the next window too.
 */
export function retryAfterDelayMs(retryAfterMs: number | null, floorMs: number, capMs: number): number {
  const baseMs = Math.min(Math.max(retryAfterMs ?? floorMs, floorMs), capMs);
  return baseMs + Math.floor(Math.random() * Math.min(baseMs, 10_000));
}
