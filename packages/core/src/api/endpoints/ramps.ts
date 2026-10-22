import { abortError, throwIfAborted } from '../../lib/abort';
import type { PollarApiClient } from '../client';
import type {
  RampDirection,
  RampOrder,
  RampOrderRequest,
  RampOrdersPage,
  RampOrdersQuery,
  RampQuoteRequest,
  RampQuotesResponse,
  RampRoutesResponse,
} from '../../types';
import { PollarApiError } from '../../types';
import { isRecord, stringField } from '../error-fields';

/**
 * Wrap an error body into a {@link PollarApiError}, keeping every field the API
 * sent: a quote that found no route carries `rejected` (why each route dropped
 * out), a refused payee carries `message` (which field and why).
 *
 * `message` stays the code, so anything rendering `err.message` is unaffected.
 */
function rampApiError(error: unknown, fallback: string): PollarApiError {
  const body = isRecord(error) ? error : {};
  const code = stringField(body, 'code') ?? stringField(body, 'error') ?? fallback;
  return new PollarApiError(code, body);
}

/** GET /ramps/routes: the fiat and asset pairs the app can ramp between. Nothing is quoted. */
export async function getRampRoutes(api: PollarApiClient, direction: RampDirection): Promise<RampRoutesResponse> {
  const { data, error } = await api.GET('/ramps/routes', { params: { query: { direction } } });
  if (!data?.content || error) throw rampApiError(error, 'Failed to get ramp routes');
  return data.content;
}

/**
 * POST /ramps/quotes: every route between the fiat and the asset, quoted leg by
 * leg, best first. No route at all answers 422 SDK_RAMPS_NO_ROUTE with `rejected`.
 */
export async function quoteRamp(api: PollarApiClient, body: RampQuoteRequest): Promise<RampQuotesResponse> {
  const { data, error } = await api.POST('/ramps/quotes', { body });
  if (!data?.content || error) throw rampApiError(error, 'Failed to quote the ramp');
  return data.content;
}

/**
 * POST /ramps/orders: turns a quote into an order and runs its first leg, so the
 * answer carries the first `pendingAction`. `payee` holds a value for each of the
 * quote's `requiredFields`. The same quote always answers the same order.
 */
export async function createRampOrder(api: PollarApiClient, body: RampOrderRequest): Promise<RampOrder> {
  const { data, error } = await api.POST('/ramps/orders', { body });
  if (!data?.content || error) throw rampApiError(error, 'Failed to create the ramp order');
  return data.content;
}

/** GET /ramps/orders/{id} */
export async function getRampOrder(api: PollarApiClient, id: string): Promise<RampOrder> {
  const { data, error } = await api.GET('/ramps/orders/{id}', { params: { path: { id } } });
  if (!data?.content || error) throw rampApiError(error, 'Failed to get the ramp order');
  return data.content;
}

/** GET /ramps/orders: the user's orders, newest first; `pending: 'true'` keeps the ones waiting on the user. */
export async function listRampOrders(api: PollarApiClient, query: Partial<RampOrdersQuery> = {}): Promise<RampOrdersPage> {
  const { data, error } = await api.GET('/ramps/orders', { params: { query: query as RampOrdersQuery } });
  if (!data?.content || error) throw rampApiError(error, 'Failed to list ramp orders');
  return data.content;
}

/** POST /ramps/orders/{id}/legs/{index}/signature: the signed payload of a SIGNATURE pending action. */
export async function submitRampLegSignature(
  api: PollarApiClient,
  id: string,
  index: number,
  body: { actionId: string; signedPayload: string },
): Promise<RampOrder> {
  const { data, error } = await api.POST('/ramps/orders/{id}/legs/{index}/signature', {
    params: { path: { id, index } },
    body,
  });
  if (!data?.content || error) throw rampApiError(error, 'Failed to submit the ramp signature');
  return data.content;
}

const FINAL_STATES = ['completed', 'failed', 'refunded'];

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** True once the order no longer moves: a final state, or the server stopped suggesting a next read. */
export function isRampOrderSettled(order: RampOrder): boolean {
  return FINAL_STATES.includes(order.state) || order.nextPollAfter === null;
}

/**
 * Reads the order at the pace the server suggests (`nextPollAfter`) until `until`
 * holds (by default, until it settles). `onUpdate` sees every read. Transport
 * errors retry after the last suggested wait; API errors are thrown.
 */
export async function pollRampOrder(
  api: PollarApiClient,
  id: string,
  opts: { signal?: AbortSignal; onUpdate?: (order: RampOrder) => void; until?: (order: RampOrder) => boolean } = {},
): Promise<RampOrder> {
  const until = opts.until ?? isRampOrderSettled;
  let waitMs = 5_000;
  for (;;) {
    throwIfAborted(opts.signal);
    let order: RampOrder | null = null;
    try {
      order = await getRampOrder(api, id);
    } catch (error) {
      if (error instanceof PollarApiError) throw error;
    }
    if (order) {
      opts.onUpdate?.(order);
      if (until(order) || isRampOrderSettled(order)) return order;
      waitMs = Math.max(1_000, Date.parse(order.nextPollAfter ?? '') - Date.now() || 5_000);
    }
    await delay(waitMs, opts.signal);
  }
}
