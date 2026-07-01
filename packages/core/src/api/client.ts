import createClient from 'openapi-fetch';
import type { paths } from './schema';
import type { PollarRetryConfig } from '../types';
import { PollarNetworkError } from '../types';
import { anySignal, timeoutController } from '../lib/abort';

export type PollarApiClient = ReturnType<typeof createApiClient>;

export interface ApiClientOptions {
  /** Per-attempt timeout in ms. `0`/`undefined` disables the timeout. */
  timeoutMs?: number | undefined;
  /** Retry policy for transport-level failures. */
  retry?: PollarRetryConfig | undefined;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_BASE_DELAY_MS = 300;

/** `true` for a transport-level failure (timeout / dropped connection) — the
 *  only class of error worth retrying. An HTTP response, even a 5xx, is NOT an
 *  error here: openapi-fetch resolves it, so it never reaches this path. */
function isRetryableTransportError(err: unknown): boolean {
  // A timeout we raised, an AbortError from the timeout signal, or fetch's
  // generic network failure (a `TypeError` like "Network request failed").
  if (err instanceof PollarNetworkError) return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (err instanceof TypeError) return true;
  return false;
}

function backoffDelay(attempt: number, baseDelayMs: number): number {
  // attempt is 1-based; first retry waits ~baseDelayMs, then doubles, with
  // [0.5, 1) jitter so concurrent clients don't retry in lockstep.
  const exp = baseDelayMs * 2 ** (attempt - 1);
  return Math.round(exp * (0.5 + Math.random() * 0.5));
}

/**
 * Run a single fetch bounded by `timeoutMs`, combining the timeout with the
 * request's own abort signal (e.g. a caller's cancellation, or `destroy()`).
 * Rejects with {@link PollarNetworkError} when the timeout — not the caller —
 * fired, so the reason is distinguishable downstream.
 *
 * Exported so the DPoP-nonce retry inside the client (which rebuilds the Request
 * and calls `fetch` directly, bypassing openapi-fetch's configured fetch) gets
 * the same timeout protection.
 */
export async function fetchWithTimeout(request: Request, timeoutMs: number): Promise<Response> {
  if (!timeoutMs || timeoutMs <= 0) return fetch(request);

  const timeout = timeoutController(timeoutMs);
  // Abort the underlying fetch when the timeout (or the caller) fires so a
  // well-behaved runtime frees the socket instead of leaking it.
  const combined = anySignal([request.signal, timeout.signal]);
  const fetchPromise = fetch(request, { signal: combined.signal });

  try {
    // Race the fetch against the timeout. The abort above is the clean path, but
    // some runtimes (older React Native / Hermes fetch polyfills) ignore an
    // `init.signal` override on a Request argument — there the abort never
    // reaches the socket and the promise would hang forever. Racing a rejection
    // GUARANTEES the call settles regardless of how the runtime treats the
    // signal, which is the whole point: a stalled refresh must never trap the
    // caller. (On a runtime that DID honor the abort, the fetch rejection is
    // swallowed below since the race already settled.)
    return await new Promise<Response>((resolve, reject) => {
      fetchPromise.then(resolve, reject);
      const onTimeout = () => reject(new PollarNetworkError(`Request timed out after ${timeoutMs}ms`));
      if (timeout.signal.aborted) onTimeout();
      else timeout.signal.addEventListener('abort', onTimeout);
    });
  } catch (err) {
    // The timeout fired (not the caller's own cancellation) — normalize the
    // failure to a typed, catchable error so callers can branch on the code.
    if (timeout.signal.aborted && !request.signal?.aborted) {
      throw err instanceof PollarNetworkError
        ? err
        : new PollarNetworkError(`Request timed out after ${timeoutMs}ms`, err);
    }
    throw err;
  } finally {
    timeout.clear();
    combined.cleanup();
    // If the race settled via the timeout, the aborted fetch will reject shortly
    // after — swallow it so it doesn't surface as an unhandled rejection.
    fetchPromise.catch(() => {});
  }
}

/**
 * The `fetch` openapi-fetch is configured with: each attempt is timeout-bounded
 * by {@link fetchWithTimeout}, and transport failures retry with backoff. The
 * Request is cloned per attempt so a consumed/aborted body can be replayed
 * (a Request body is single-use).
 *
 * Only **idempotent** methods (GET/HEAD) are transparently retried. A
 * transport error (timeout / dropped connection) does not tell us whether the
 * server received and processed the request — only that we did not get the
 * response. Re-sending a POST/PUT/PATCH/DELETE that already landed can duplicate
 * its effect, and for a DPoP-bound request it also replays a single-use proof
 * (same `jti`), which the server rejects with `SDK_AUTH_DPOP_INVALID` /
 * `jti-replay`. So a non-idempotent request is attempted exactly once here; a
 * genuine failure is the caller's to retry (that path rebuilds a fresh proof).
 */
function makeRetryingFetch(timeoutMs: number, retry: Required<PollarRetryConfig>) {
  const attempts = Math.max(1, retry.attempts);
  return async function retryingFetch(request: Request): Promise<Response> {
    const method = request.method.toUpperCase();
    const isIdempotent = method === 'GET' || method === 'HEAD';
    const maxAttempts = isIdempotent ? attempts : 1;
    // Per-request timeout override (set by slow submit-family calls via the
    // `x-pollar-timeout-ms` header). Read it, then STRIP it so this internal
    // control header never travels to the server. Fall back to the client
    // default when absent or malformed.
    let effectiveTimeoutMs = timeoutMs;
    const timeoutOverride = request.headers.get('x-pollar-timeout-ms');
    if (timeoutOverride !== null) {
      request.headers.delete('x-pollar-timeout-ms');
      const parsed = Number(timeoutOverride);
      if (Number.isFinite(parsed) && parsed > 0) effectiveTimeoutMs = parsed;
    }
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Clone before each try (except a single-attempt fetch) so the body
      // survives a re-send; the original stays unconsumed for the next clone.
      const attemptReq = maxAttempts > 1 ? request.clone() : request;
      try {
        return await fetchWithTimeout(attemptReq, effectiveTimeoutMs);
      } catch (err) {
        lastErr = err;
        // The CALLER aborted (cancellation / destroy) — never retry, propagate.
        if (request.signal?.aborted) throw err;
        // A real HTTP response never lands here; only transport errors do.
        if (!isRetryableTransportError(err) || attempt >= maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, backoffDelay(attempt, retry.baseDelayMs)));
      }
    }
    // Unreachable (the loop returns or throws), but satisfies the type checker.
    throw lastErr;
  };
}

export function createApiClient(baseUrl: string, options: ApiClientOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retry: Required<PollarRetryConfig> = {
    attempts: options.retry?.attempts ?? DEFAULT_ATTEMPTS,
    baseDelayMs: options.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
  };
  return createClient<paths>({ baseUrl, fetch: makeRetryingFetch(timeoutMs, retry) });
}
