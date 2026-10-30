/**
 * Reading what the sdk-api error envelope carries without trusting its shape.
 *
 * Every rejection is `{ code, success: false, ...extra }`, where `extra` varies by
 * route (`message`, `details`, `resultCode`, ...), and a value can also reach the
 * client through a path that is not the generated one (a raw fetch, an error body
 * kept on a {@link PollarApiError}). These guards read it field by field.
 */

/** A plain object whose fields can be read one by one. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** `value[key]` when `value` is an object and that field is a string. */
export function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

/** The string fields an error envelope may carry. */
export interface ApiErrorFields {
  code?: string;
  /** Some older routes name the code `error`. */
  error?: string;
  message?: string;
  details?: string;
  resultCode?: string;
}

export function apiErrorFields(value: unknown): ApiErrorFields {
  const out: ApiErrorFields = {};
  for (const key of ['code', 'error', 'message', 'details', 'resultCode'] as const) {
    const field = stringField(value, key);
    if (field !== undefined) out[key] = field;
  }
  return out;
}
