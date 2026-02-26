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

export async function streamUntilFound(
  api: PollarApiClient,
  clientSessionId: string,
  check: (data: Record<string, unknown>) => boolean,
  retryDelayMs = 200,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
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
      if (signal) await abortableDelay(retryDelayMs, signal);
      else await new Promise((r) => setTimeout(r, retryDelayMs));
      continue;
    }

    const reader = data.getReader();
    const decoder = new TextDecoder();
    let streamDone = false;

    try {
      while (true) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) {
          streamDone = true;
          break;
        }

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
            // chunk parcial, ignorar
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      console.warn(e);
    } finally {
      reader.releaseLock();
    }

    // stream cerrado sin encontrar el valor → reintenta
    const delay = streamDone ? retryDelayMs : 0;
    if (delay) {
      if (signal) await abortableDelay(delay, signal);
      else await new Promise((r) => setTimeout(r, delay));
    }
  }
}
