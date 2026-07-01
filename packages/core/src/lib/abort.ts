/**
 * Abort helpers that don't assume a browser-grade runtime.
 *
 * Two primitives we rely on are missing or partial on some React Native /
 * Hermes builds:
 *   - `DOMException` is not a global on Hermes, so `new DOMException(...)`
 *     throws `ReferenceError` instead of producing an AbortError.
 *   - `AbortSignal.prototype.throwIfAborted` is absent on older RN AbortSignal
 *     polyfills, so calling it (even via optional chaining, which only guards a
 *     null/undefined signal — not a missing method) throws `TypeError`.
 *
 * These shims keep the abort path working everywhere while preserving the
 * `error.name === 'AbortError'` contract the rest of the SDK checks against.
 */

/**
 * Build an AbortError. Uses the native `DOMException` when present (browsers,
 * Node ≥17) and falls back to a plain `Error` tagged `name = 'AbortError'`
 * where `DOMException` is undefined (Hermes).
 */
export function abortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError');
  }
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

/**
 * Throw an AbortError if `signal` is already aborted. Replacement for
 * `signal.throwIfAborted()` that doesn't depend on the method existing on the
 * runtime's `AbortSignal`.
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/**
 * An `AbortSignal` that aborts after `ms` milliseconds, plus a `clear()` to
 * cancel the pending timer once the work finishes (so a completed request never
 * leaves a dangling timeout).
 *
 * We don't use the native `AbortSignal.timeout(ms)` even where it exists: it's
 * absent on Hermes / older RN, and it gives no handle to cancel the timer early.
 * A plain `AbortController` + `setTimeout` works uniformly across every runtime.
 */
export function timeoutController(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // `unref` keeps a pending timeout from holding a Node process open; it's
  // absent in browsers / RN, so guard the call.
  (timer as { unref?: () => void }).unref?.();
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/**
 * Combine several `AbortSignal`s into one that aborts as soon as ANY input does.
 * RN-safe replacement for `AbortSignal.any` (absent on Hermes). Returns the
 * combined signal plus a `cleanup()` that detaches the listeners — call it once
 * the awaited work settles so finished requests don't leak listeners on a
 * long-lived caller signal.
 */
export function anySignal(signals: (AbortSignal | undefined)[]): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const present = signals.filter((s): s is AbortSignal => !!s);

  const onAbort = () => {
    controller.abort();
    cleanup();
  };
  const cleanup = () => {
    for (const s of present) s.removeEventListener?.('abort', onAbort);
  };

  for (const s of present) {
    if (s.aborted) {
      controller.abort();
      cleanup();
      return { signal: controller.signal, cleanup };
    }
    s.addEventListener?.('abort', onAbort);
  }
  return { signal: controller.signal, cleanup };
}
