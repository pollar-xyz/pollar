import type { PollarApiClient } from '../client';
import type {
  RampsOfframpBody,
  RampsOfframpResponse,
  RampsOnrampBody,
  RampsOnrampResponse,
  RampsQuoteQuery,
  RampsQuoteResponse,
  RampsTransactionResponse,
  RampTxStatus,
} from '../../types';

/**
 * GET /ramps/quote
 * Returns available quotes for an onramp or offramp.
 * The backend ranks providers by country, amount, fee and availability.
 * The first quote in the array is the recommended one.
 */
export async function getRampsQuote(api: PollarApiClient, query: RampsQuoteQuery): Promise<RampsQuoteResponse> {
  const { data, error } = await api.GET('/ramps/quote', { params: { query } });
  if (!data?.content || error) throw new Error((error as any)?.error ?? 'Failed to get ramp quotes');
  return data.content;
}

/**
 * POST /ramps/onramp
 * Creates an onramp transaction.
 * For custodial users: backend orchestrates the full SEP-24 flow and returns payment instructions.
 * For non-custodial: backend may return an unsigned XDR that the client must sign via a wallet adapter.
 */
export async function createOnRamp(api: PollarApiClient, body: RampsOnrampBody): Promise<RampsOnrampResponse> {
  const { data, error } = await api.POST('/ramps/onramp', { body });
  if (!data?.content || error) throw new Error((error as any)?.error ?? 'Failed to create onramp');
  return data.content;
}

/**
 * POST /ramps/offramp
 * Creates an offramp transaction.
 * Backend initiates the bank transfer once the Stellar transaction is confirmed.
 */
export async function createOffRamp(api: PollarApiClient, body: RampsOfframpBody): Promise<RampsOfframpResponse> {
  const { data, error } = await api.POST('/ramps/offramp', { body });
  if (!data?.content || error) throw new Error((error as any)?.error ?? 'Failed to create offramp');
  return data.content;
}

/**
 * GET /ramps/transaction/{txId}
 * Returns the current status of a ramp transaction.
 */
export async function getRampTransaction(api: PollarApiClient, txId: string): Promise<RampsTransactionResponse> {
  const { data, error } = await api.GET('/ramps/transaction/{txId}', { params: { path: { txId } } });
  if (!data?.content || error) throw new Error((error as any)?.error ?? 'Failed to get transaction');
  return data.content;
}

/**
 * Polls GET /ramps/transaction/{txId} every intervalMs until status is 'completed' or 'failed'.
 * Throws if timeoutMs is exceeded.
 */
export async function pollRampTransaction(
  api: PollarApiClient,
  txId: string,
  { intervalMs = 5000, timeoutMs = 600_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<RampTxStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status } = await getRampTransaction(api, txId);
    if (status === 'completed' || status === 'failed') return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Ramp transaction polling timed out');
}
