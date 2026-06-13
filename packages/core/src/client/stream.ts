import { PollarApiClient } from '../api/client';
import { abortError, throwIfAborted } from '../lib/abort';
import type { PollarLogger } from '../lib/logger';

/** Terminal session-status conditions, surfaced identically by the SSE stream
 *  (as `error` events) and the poll endpoint (as 404 / 410). When either occurs
 *  the session can never become ready, so the wait stops and the auth flow
 *  resets to an error state instead of retrying forever. */
export type SessionStatusErrorCode = 'INVALID_CLIENT_SESSION_ID' | 'EXPIRED_CLIENT_ID';

export class SessionStatusError extends Error {
  constructor(readonly code: SessionStatusErrorCode) {
    super(`[PollarClient] Session status terminal: ${code}`);
    this.name = 'SessionStatusError';
  }
}

/** Returns the terminal code if `parsed` is an SSE `error` event payload
 *  (`{ error: '...' }`), otherwise null. */
function terminalStatusCode(parsed: unknown): SessionStatusErrorCode | null {
  const err = (parsed as { error?: unknown } | null)?.error;
  if (err === 'INVALID_CLIENT_SESSION_ID' || err === 'EXPIRED_CLIENT_ID') return err;
  return null;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(abortError());
      },
      { once: true },
    );
  });
}

const MAX_BACKOFF_MS = 5_000;

/**
 * Poll the session-status SSE stream until `check` returns true.
 *
 * On consecutive failures the retry delay doubles up to a 5 s cap; any
 * received chunk resets it to the floor. The happy path is unchanged.
 */
export async function streamUntilFound(
  api: PollarApiClient,
  clientSessionId: string,
  check: (data: Record<string, unknown>) => boolean,
  retryDelayMs = 200,
  signal?: AbortSignal,
  logger: PollarLogger = console,
): Promise<Record<string, unknown>> {
  let backoff = retryDelayMs;
  const sleep = async (ms: number): Promise<void> => {
    if (ms <= 0) return;
    if (signal) await abortableDelay(ms, signal);
    else await new Promise((r) => setTimeout(r, ms));
  };

  while (true) {
    throwIfAborted(signal);

    let data, error;
    try {
      ({ data, error } = await api.GET('/auth/session/status/{clientSessionId}', {
        params: { path: { clientSessionId } },
        parseAs: 'stream',
        signal: signal ?? null,
      }));
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      logger.debug('[PollarClient:stream] session-status request failed; will retry', e);
    }

    if (error || !data) {
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }

    const reader = data.getReader();
    const decoder = new TextDecoder();
    let sawAnyChunk = false;

    try {
      while (true) {
        throwIfAborted(signal);
        const { done, value } = await reader.read();
        if (done) break;
        sawAnyChunk = true;

        const chunk = decoder.decode(value);
        for (const message of chunk.split('\n\n').filter(Boolean)) {
          const dataLine = message.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(dataLine.slice('data:'.length).trim());
          } catch {
            // partial chunk — keep reading
            continue;
          }
          // Terminal `error` event (invalid / expired session): stop and surface.
          const terminal = terminalStatusCode(parsed);
          if (terminal) throw new SessionStatusError(terminal);
          if (check(parsed)) {
            return parsed;
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      if (e instanceof SessionStatusError) throw e;
      logger.debug('[PollarClient:stream] session-status stream read failed; will retry', e);
    } finally {
      reader.releaseLock();
    }

    // A connection that delivered real data resets the backoff; a stream
    // that opened and immediately closed counts as failure.
    if (sawAnyChunk) backoff = retryDelayMs;
    else backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);

    // Always wait the computed backoff before reconnecting. A data-bearing
    // close already reset it to the floor (retryDelayMs), so the happy-path
    // reconnect stays snappy; the failure paths — including a mid-stream read
    // error caught above — now back off instead of spinning in a tight
    // reconnect loop that hammers the server.
    await sleep(backoff);
  }
}

/** Success envelope shape of `GET /auth/session/status/{id}/poll`. */
interface StatusPollEnvelope {
  success?: boolean;
  code?: string;
  content?: Record<string, unknown>;
}

/**
 * Non-streaming counterpart to {@link streamUntilFound}. Repeatedly GETs the
 * one-shot `/auth/session/status/{clientSessionId}/poll` endpoint until `check`
 * returns true on the response `content`.
 *
 * Used on runtimes where `fetch` does not expose a readable `response.body`
 * (React Native / Hermes), so the SSE reader in `streamUntilFound` is
 * unavailable. Uses the global `fetch` directly (not `openapi-fetch`) because
 * the status endpoint is public/pre-auth and needs no DPoP middleware.
 *
 * Backoff matches the SSE path: the delay doubles on transient failures up to a
 * 5 s cap and resets to the floor after any successful response.
 */
export async function pollUntilFound(
  baseUrl: string,
  clientSessionId: string,
  check: (data: Record<string, unknown>) => boolean,
  intervalMs = 500,
  signal?: AbortSignal,
  logger: PollarLogger = console,
): Promise<Record<string, unknown>> {
  const url = `${baseUrl}/auth/session/status/${encodeURIComponent(clientSessionId)}/poll`;
  let backoff = intervalMs;
  const sleep = async (ms: number): Promise<void> => {
    if (ms <= 0) return;
    if (signal) await abortableDelay(ms, signal);
    else await new Promise((r) => setTimeout(r, ms));
  };

  while (true) {
    throwIfAborted(signal);

    let envelope: StatusPollEnvelope | null = null;
    let httpStatus = 0;
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' }, signal: signal ?? null });
      httpStatus = response.status;
      envelope = (await response.json().catch(() => null)) as StatusPollEnvelope | null;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      logger.debug('[PollarClient:stream] session-status poll failed; will retry', e);
    }

    // Terminal: the session is gone (404 / INVALID) or expired (410 / EXPIRED).
    // It can never become ready, so stop and surface — the caller resets the
    // login to an error state. Mirrors the SSE stream's terminal `error` events.
    if (httpStatus === 404 || envelope?.code === 'INVALID_CLIENT_SESSION_ID') {
      throw new SessionStatusError('INVALID_CLIENT_SESSION_ID');
    }
    if (httpStatus === 410 || envelope?.code === 'EXPIRED_CLIENT_ID') {
      throw new SessionStatusError('EXPIRED_CLIENT_ID');
    }

    if (envelope?.success && envelope.content && check(envelope.content)) {
      return envelope.content;
    }

    // A response (even a transient non-terminal error) resets the backoff floor;
    // a network failure (no response) backs off up to the cap.
    if (envelope) backoff = intervalMs;
    else backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    await sleep(backoff);
  }
}

/**
 * Wait until the client session reaches a state where `check` passes, using the
 * transport appropriate to the runtime: the SSE stream on web (`useStreaming`),
 * or one-shot polling on React Native. Both resolve with the matched status
 * `content` payload; the calling auth flow does not care which transport ran.
 */
export function waitForSessionReady(args: {
  api: PollarApiClient;
  baseUrl: string;
  clientSessionId: string;
  check: (data: Record<string, unknown>) => boolean;
  useStreaming: boolean;
  retryDelayMs?: number;
  signal?: AbortSignal;
  logger?: PollarLogger;
}): Promise<Record<string, unknown>> {
  const { api, baseUrl, clientSessionId, check, useStreaming, retryDelayMs, signal, logger = console } = args;
  return useStreaming
    ? streamUntilFound(api, clientSessionId, check, retryDelayMs ?? 200, signal, logger)
    : pollUntilFound(baseUrl, clientSessionId, check, retryDelayMs ?? 500, signal, logger);
}
