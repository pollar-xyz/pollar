import { PollarApiClient } from '../api/client';

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
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
): Promise<Record<string, unknown>> {
  let backoff = retryDelayMs;
  const sleep = async (ms: number): Promise<void> => {
    if (ms <= 0) return;
    if (signal) await abortableDelay(ms, signal);
    else await new Promise((r) => setTimeout(r, ms));
  };

  while (true) {
    signal?.throwIfAborted();

    let data, error;
    try {
      ({ data, error } = await api.GET('/auth/session/status/{clientSessionId}', {
        params: { path: { clientSessionId } },
        parseAs: 'stream',
        signal: signal ?? null,
      }));
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      console.warn(e);
    }

    if (error || !data) {
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }

    const reader = data.getReader();
    const decoder = new TextDecoder();
    let streamDone = false;
    let sawAnyChunk = false;

    try {
      while (true) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) {
          streamDone = true;
          break;
        }
        sawAnyChunk = true;

        const chunk = decoder.decode(value);
        for (const message of chunk.split('\n\n').filter(Boolean)) {
          const dataLine = message.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const parsed = JSON.parse(dataLine.slice('data:'.length).trim());
            if (check(parsed)) {
              return parsed;
            }
          } catch {
            // partial chunk — keep reading
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      console.warn(e);
    } finally {
      reader.releaseLock();
    }

    // A connection that delivered real data resets the backoff; a stream
    // that opened and immediately closed counts as failure.
    if (sawAnyChunk) backoff = retryDelayMs;
    else backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);

    const delay = streamDone ? backoff : 0;
    if (delay) await sleep(delay);
  }
}
