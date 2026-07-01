// Tiny, opt-in trace logger for debugging the Privy login/sign flow. Off by
// default; enable via `createPrivyAdapter({ debug: true })`. Logs carry the
// `[privy-adapter]` prefix so they're easy to filter in the browser console.

let DEBUG = false;

/** Toggle verbose adapter logging. Called by the adapter factory from config. */
export function setPrivyAdapterDebug(on: boolean): void {
  DEBUG = on;
}

/** Verbose trace log — a no-op unless debug is enabled. */
export function log(message: string, data?: unknown): void {
  if (!DEBUG) return;
  if (data !== undefined) {
    console.log(`[privy-adapter] ${message}`, data);
  } else {
    console.log(`[privy-adapter] ${message}`);
  }
}
