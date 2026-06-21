/**
 * Request-body keys whose values are PII or secrets and must never reach a log
 * sink in the clear. Their values are replaced with `'[redacted]'` while the key
 * itself is kept, so logs still show the request *shape* for debugging.
 */
export const SENSITIVE_BODY_KEYS = new Set([
  'email',
  'code',
  'walletAddress',
  'dpopJwk',
  'response',
  'refreshToken',
  // Token material that can appear in RESPONSE envelopes (e.g. `content.token`):
  'accessToken',
  'token',
  // SEP-10 challenge envelopes: a counter-signed challenge is a live, replayable
  // auth credential — never log it in the clear.
  'signedChallengeXdr',
  'challengeXdr',
  'signedTxXdr',
  'signedXdr',
  'signedAuthEntry',
]);

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

/**
 * Like {@link redactBody} but RECURSIVE — masks sensitive keys at any depth. Use
 * for RESPONSE bodies / error causes, where token material is nested (e.g.
 * `{ content: { token: { accessToken, refreshToken } } }`) and the shallow
 * `redactBody` would leak it. Depth-bounded so a pathological/cyclic object
 * can't blow the stack.
 */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 8 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_BODY_KEYS.has(key) ? '[redacted]' : redactDeep(v, depth + 1);
  }
  return out;
}
