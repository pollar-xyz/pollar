import type { PollarLogger } from '../../lib/logger';
import { redactBody, redactDeep } from '../../lib/logging';

/**
 * Logs an auth failure that the central HTTP middleware can't see — namely an
 * *application-level* failure riding on a `2xx` response (e.g. `200` with
 * `{ success: false }`, or `/auth/email/verify-code` returning
 * `INVALID_EMAIL_CODE` in a `200` body). Transport / HTTP-status errors are
 * logged once by the middleware in `client.ts`; call this only on the no-HTTP-
 * error branch so nothing double-logs. Records the route, the redacted request
 * body (when present) and the underlying `data`/`error` payload.
 */
export function logApiError(
  logger: PollarLogger,
  route: string,
  detail: { body?: unknown; error?: unknown; data?: unknown } = {},
  level: 'warn' | 'error' = 'error',
): void {
  const { body, error, data } = detail;
  logger[level](`[PollarClient:auth] ${route} failed`, {
    route,
    ...(body !== undefined ? { body: redactBody(body) } : {}),
    // The cause is a server `data`/`error` envelope that can carry nested token
    // material — redact it recursively rather than logging it raw.
    cause: redactDeep(error ?? data),
  });
}
