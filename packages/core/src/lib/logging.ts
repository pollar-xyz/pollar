/**
 * Request-body keys whose values are PII or secrets and must never reach a log
 * sink in the clear. Their values are replaced with `'[redacted]'` while the key
 * itself is kept, so logs still show the request *shape* for debugging.
 */
export const SENSITIVE_BODY_KEYS = new Set(['email', 'code', 'walletAddress', 'dpopJwk', 'response', 'refreshToken']);

/**
 * Returns a shallow copy of an API request body with sensitive values masked.
 * Non-object bodies (and `undefined`) pass through untouched.
 */
export function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = SENSITIVE_BODY_KEYS.has(key) ? '[redacted]' : value;
  }
  return out;
}
