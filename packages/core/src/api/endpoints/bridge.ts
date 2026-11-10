import type { PollarApiClient } from '../client';
import type { BridgeConfig, BridgeQuote, BridgeQuoteParams, BridgeTransfer } from '../../types';
import { PollarApiError } from '../../types';
import { isRecord, stringField } from '../error-fields';
import { abortError, throwIfAborted } from '../../lib/abort';
import { isBridgeSettled } from '../../bridge/index';

function bridgeApiError(error: unknown, fallback: string): PollarApiError {
  const body = isRecord(error) ? error : {};
  return new PollarApiError(stringField(body, 'code') ?? stringField(body, 'error') ?? fallback, body);
}

function content<T>(res: { data?: { content?: T }; error?: unknown }, fallback: string): T {
  if (res.error || res.data?.content === undefined) throw bridgeApiError(res.error, fallback);
  return res.data.content;
}

/** GET /bridge/config */
export async function getBridgeConfig(api: PollarApiClient): Promise<BridgeConfig> {
  return content(await api.GET('/bridge/config'), 'Failed to load the bridge config');
}

/** POST /bridge/quote: nothing moves. */
export async function quoteBridge(api: PollarApiClient, body: BridgeQuoteParams): Promise<BridgeQuote> {
  return content(await api.POST('/bridge/quote', { body }), 'Failed to quote the bridge');
}

/** POST /bridge/transfers: 201 for a new transfer, 200 for the one an idempotency key already started. */
export async function createBridgeTransfer(
  api: PollarApiClient,
  body: BridgeQuoteParams & { idempotencyKey?: string },
): Promise<BridgeTransfer> {
  return content(await api.POST('/bridge/transfers', { body }), 'Failed to start the bridge').transfer;
}

/** GET /bridge/transfers/{transferId}: a read moves a transfer whose next step is due. */
export async function getBridgeTransfer(api: PollarApiClient, transferId: string): Promise<BridgeTransfer> {
  return content(
    await api.GET('/bridge/transfers/{transferId}', { params: { path: { transferId } } }),
    'Failed to get the bridge',
  ).transfer;
}

/** GET /bridge/transfers: the latest 20, newest first. */
export async function listBridgeTransfers(api: PollarApiClient): Promise<BridgeTransfer[]> {
  return content(await api.GET('/bridge/transfers'), 'Failed to list the bridges').transfers;
}

/** POST /bridge/transfers/{transferId}/signature */
export async function submitBridgeSignature(
  api: PollarApiClient,
  transferId: string,
  body: { actionId: string; signedPayload: string },
): Promise<BridgeTransfer> {
  return content(
    await api.POST('/bridge/transfers/{transferId}/signature', { params: { path: { transferId } }, body }),
    'Failed to submit the bridge signature',
  ).transfer;
}

/** Circle attests a Standard Transfer in minutes: a read every few seconds is enough. */
const POLL_MS = 5_000;
const POLL_BACKOFF_MAX_MS = 60_000;

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

/**
 * Reads the transfer until `until` holds, by default until it settles or waits
 * on the user (a step to sign or approve). A failed read goes to `onError` and
 * is read again; only a transfer that no longer exists for this user ends it.
 */
export async function pollBridgeTransfer(
  api: PollarApiClient,
  transferId: string,
  opts: {
    signal?: AbortSignal;
    onUpdate?: (transfer: BridgeTransfer) => void;
    onError?: (error: unknown) => void;
    until?: (transfer: BridgeTransfer) => boolean;
  } = {},
): Promise<BridgeTransfer> {
  const until = opts.until ?? ((t: BridgeTransfer) => isBridgeSettled(t) || t.status === 'AWAITING_ACTION');
  let failedWaitMs = 0;
  for (;;) {
    throwIfAborted(opts.signal);
    let transfer: BridgeTransfer | null = null;
    try {
      transfer = await getBridgeTransfer(api, transferId);
    } catch (error) {
      if (error instanceof PollarApiError && error.code === 'SDK_BRIDGE_TRANSFER_NOT_FOUND') throw error;
      opts.onError?.(error);
    }
    if (transfer) {
      failedWaitMs = 0;
      opts.onUpdate?.(transfer);
      if (until(transfer) || isBridgeSettled(transfer)) return transfer;
    } else {
      failedWaitMs = Math.min(POLL_BACKOFF_MAX_MS, failedWaitMs ? failedWaitMs * 2 : 1_000);
    }
    await delay(transfer ? POLL_MS : failedWaitMs, opts.signal);
  }
}
