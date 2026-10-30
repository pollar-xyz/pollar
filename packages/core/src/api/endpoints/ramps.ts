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
  RampWalletSetup,
  RampWalletSetupChain,
} from '../../types';
import { PollarApiError } from '../../types';
import { isRecord, stringField } from '../error-fields';

/**
 * A quote asks every candidate route's providers, venues and bridges, and an order
 * confirms the provider's quote and runs the first leg; both wait on third-party
 * APIs and can take well over the 10s default. Only these calls get the longer budget.
 */
const RAMP_PROVIDER_TIMEOUT_MS = 30_000;
const providerBudget = { 'x-pollar-timeout-ms': String(RAMP_PROVIDER_TIMEOUT_MS) };

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
  const { data, error } = await api.POST('/ramps/quotes', { body, headers: providerBudget });
  if (!data?.content || error) throw rampApiError(error, 'Failed to quote the ramp');
  return data.content;
}

/**
 * POST /ramps/orders: turns a quote into an order and runs its first leg, so the
 * answer carries the first `pendingAction`. `payee` holds a value for each of the
 * quote's `requiredFields`. The same quote always answers the same order.
 */
export async function createRampOrder(api: PollarApiClient, body: RampOrderRequest): Promise<RampOrder> {
  const { data, error } = await api.POST('/ramps/orders', { body, headers: providerBudget });
  if (!data?.content || error) throw rampApiError(error, 'Failed to create the ramp order');
  return data.content;
}

/** GET /ramps/orders/{id} */
export async function getRampOrder(api: PollarApiClient, id: string): Promise<RampOrder> {
  const { data, error } = await api.GET('/ramps/orders/{id}', { params: { path: { id } } });
  if (!data?.content || error) throw rampApiError(error, 'Failed to get the ramp order');
  return data.content;
}

/**
 * POST /ramps/orders/{id}/check: for a user who says they paid, asks the provider
 * about the fiat payment now instead of at the next recheck (at most once every
 * 10 seconds per order), and answers the order after it.
 *
 * The server waits on the provider for up to 8s before answering, too close to the
 * 10s default; this call gets a longer budget, like the vendor calls of a requirement.
 */
const CHECK_TIMEOUT_MS = 30_000;

export async function checkRampOrder(api: PollarApiClient, id: string): Promise<RampOrder> {
  const { data, error } = await api.POST('/ramps/orders/{id}/check', {
    params: { path: { id } },
    headers: { 'x-pollar-timeout-ms': String(CHECK_TIMEOUT_MS) },
  });
  if (!data?.content || error) throw rampApiError(error, 'Failed to check the ramp order');
  return data.content;
}

/**
 * POST /ramps/orders/{id}/retry: runs a held order again from where it stopped,
 * when the user is the one who resolves it (an approval to give again).
 */
export async function retryRampOrder(api: PollarApiClient, id: string): Promise<RampOrder> {
  const { data, error } = await api.POST('/ramps/orders/{id}/retry', { params: { path: { id } } });
  if (!data?.content || error) throw rampApiError(error, 'Failed to retry the ramp order');
  return data.content;
}

/**
 * POST /ramps/wallets/{chain}: sets up the user's wallet on a chain a route passes
 * through, with `devicePublicKey` as its Turnkey wallet's first credential.
 */
export async function setUpRampWallet(
  api: PollarApiClient,
  chain: RampWalletSetupChain,
  body: { devicePublicKey: string; custody?: 'COSIGNED' | 'SELF_CUSTODY' },
): Promise<RampWalletSetup> {
  const { data, error } = await api.POST('/ramps/wallets/{chain}', { params: { path: { chain } }, body });
  if (!data?.content || error) throw rampApiError(error, 'Failed to set up the wallet');
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

/** The longest wait between reads while the API keeps failing. */
const POLL_BACKOFF_MAX_MS = 60_000;

/**
 * Reads the order at the pace the server suggests (`nextPollAfter`) until `until`
 * holds (by default, until it settles). `onUpdate` sees every read. A failed read
 * (the network, a 5xx while the API deploys, a 401 while the session renews) is
 * reported to `onError` and read again after a second, each wait twice the last up to a minute;
 * only an order that no longer exists for this user ends the polling, thrown.
 */
export async function pollRampOrder(
  api: PollarApiClient,
  id: string,
  opts: {
    signal?: AbortSignal;
    onUpdate?: (order: RampOrder) => void;
    onError?: (error: unknown) => void;
    until?: (order: RampOrder) => boolean;
  } = {},
): Promise<RampOrder> {
  const until = opts.until ?? isRampOrderSettled;
  let waitMs = 5_000;
  let failedWaitMs = 0;
  for (;;) {
    throwIfAborted(opts.signal);
    let order: RampOrder | null = null;
    try {
      order = await getRampOrder(api, id);
    } catch (error) {
      if (error instanceof PollarApiError && error.code === 'SDK_RAMPS_TX_NOT_FOUND') throw error;
      opts.onError?.(error);
    }
    if (order) {
      failedWaitMs = 0;
      opts.onUpdate?.(order);
      if (until(order) || isRampOrderSettled(order)) return order;
      waitMs = Math.max(1_000, Date.parse(order.nextPollAfter ?? '') - Date.now() || 5_000);
    } else {
      failedWaitMs = Math.min(POLL_BACKOFF_MAX_MS, failedWaitMs ? failedWaitMs * 2 : 1_000);
    }
    await delay(order ? waitMs : failedWaitMs, opts.signal);
  }
}
