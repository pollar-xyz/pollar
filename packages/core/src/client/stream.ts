import { pollarApiClient } from '../api/client';

export async function streamUntilFound(
  clientSessionId: string,
  check: (data: Record<string, unknown>) => boolean,
  retryDelayMs = 200,
): Promise<Record<string, unknown>> {
  while (true) {
    let data, error;
    try {
      ({ data, error } = await pollarApiClient.GET('/auth/session/status/{clientSessionId}', {
        params: { path: { clientSessionId } },
        parseAs: 'stream',
      }));
    } catch (error) {
      console.warn(error);
    }

    if (error || !data) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      continue;
    }

    const reader = data.getReader();
    const decoder = new TextDecoder();
    let streamDone = false;

    try {
      while (true) {
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
            console.info('[PollarClient] SSE', parsed);
            if (check(parsed)) {
              return parsed;
            }
          } catch {
            // chunk parcial, ignorar
          }
        }
      }
    } catch (error) {
      // stream cortado abruptamente
      console.warn(error);
    } finally {
      reader.releaseLock();
    }

    // stream cerrado sin encontrar el valor → reintenta
    const delay = streamDone ? retryDelayMs : 0;
    if (delay) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
