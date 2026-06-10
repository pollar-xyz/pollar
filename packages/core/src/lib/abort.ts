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
