/**
 * Run `tick` every `everyMs` until the returned stop function is called.
 *
 * The next tick is scheduled only after the previous one settles, so a slow
 * answer never stacks requests. Each wait carries +/-20% jitter, so the clients
 * behind one IP drift apart instead of hitting the rate limit in step. A tick
 * that throws doubles the wait, up to `maxBackoffMs`; one that succeeds goes
 * back to `everyMs`. While `isPaused()` is true (a hidden tab) no request goes
 * out and the schedule keeps its pace.
 */
export function startBackoffPoll(
  tick: () => Promise<unknown>,
  everyMs: number,
  options: { maxBackoffMs?: number; isPaused?: () => boolean } = {},
): () => void {
  const maxBackoffMs = options.maxBackoffMs ?? 60_000;
  const isPaused = options.isPaused ?? defaultIsPaused;
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (stopped) return;
    const baseMs = failures ? Math.min(everyMs * 2 ** failures, Math.max(maxBackoffMs, everyMs)) : everyMs;
    timer = setTimeout(run, Math.round(baseMs * (0.8 + Math.random() * 0.4)));
  };

  const run = async () => {
    timer = null;
    if (stopped) return;
    if (isPaused()) return schedule();
    try {
      await tick();
      failures = 0;
    } catch {
      failures++;
    }
    schedule();
  };

  schedule();
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

function defaultIsPaused(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}
