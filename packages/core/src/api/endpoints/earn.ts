import type {
  EarnBuildBody,
  EarnBuildContent,
  EarnChain,
  EarnOpportunitiesContent,
  EarnPosition,
  EarnProviderId,
  EarnProvidersContent,
  SolanaEarnBuildBody,
  SolanaEarnOpportunity,
  SolanaEarnPosition,
  SolanaEarnProvidersContent,
} from '../../types';
import type { PollarApiClient } from '../client';
import { apiErrorFields } from '../error-fields';
import { PollarApiError } from '../../types';

function errMessage(error: unknown, fallback: string): string {
  const e = apiErrorFields(error);
  return e.code ?? e.error ?? fallback;
}

/**
 * GET /earn/providers
 * The yield providers this app exposes to end-users (enabled + server-capable).
 * Empty `providers` = Earn disabled; the SDK renders no Earn UI.
 */
export async function getEarnProviders(api: PollarApiClient): Promise<EarnProvidersContent> {
  const { data, error } = await api.GET('/earn/providers');
  if (!data?.content || error) throw new Error(errMessage(error, 'Failed to load earn providers'));
  return data.content as EarnProvidersContent;
}

/**
 * GET /earn/opportunities?provider=
 * The vaults (DeFindex) or pools (Blend) the provider exposes on this key's
 * network, each with its live APY. Read-only.
 */
export async function getEarnOpportunities(api: PollarApiClient, provider: EarnProviderId): Promise<EarnOpportunitiesContent> {
  const { data, error } = await api.GET('/earn/opportunities', { params: { query: { provider } } });
  if (!data?.content || error) throw new Error(errMessage(error, 'Failed to load earn opportunities'));
  return data.content as EarnOpportunitiesContent;
}

/**
 * GET /earn/position?provider=&opportunity=&address=
 * Read-only: the user's balance (asset terms), the withdraw unit + max
 * withdrawable, and the live APY in a vault/pool.
 */
export async function getEarnPosition(
  api: PollarApiClient,
  query: { provider: EarnProviderId; opportunity: string; address: string },
): Promise<EarnPosition> {
  // sdk-api takes `address` (or the older `publicKey`); its v3 document lists only `publicKey`.
  const { data, error } = await api.GET('/earn/position', { params: { query: query as never } });
  if (!data?.content || error) throw new Error(errMessage(error, 'Failed to load earn position'));
  return data.content as EarnPosition;
}

/**
 * POST /earn/build
 * Builds the unsigned deposit/withdraw XDR server-side. The SDK then signs and
 * submits it with `signAndSubmitTx`.
 */
export async function buildEarnTx(api: PollarApiClient, body: EarnBuildBody): Promise<EarnBuildContent> {
  const { data, error } = await api.POST('/earn/build', { body });
  if (!data?.content || error || !('build' in data.content))
    throw new Error(errMessage(error, 'Failed to build earn transaction'));
  return data.content as EarnBuildContent;
}

/** How many times a read the provider answered 503 (busy) is asked again, and how long apart. */
const BUSY_ATTEMPTS = 3;
const BUSY_BACKOFF_MS = 600;

/** A chain read; a 503 means the provider is busy and the same request can succeed in a moment. */
async function chainRead<T>(
  read: () => Promise<{ data?: { content?: unknown } | undefined; error?: unknown; response: Response }>,
  fallback: string,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { data, error, response } = await read();
    if (data?.content && !error) return data.content as T;
    if (response.status === 503 && attempt < BUSY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, BUSY_BACKOFF_MS * attempt));
      continue;
    }
    const fields = apiErrorFields(error);
    throw new PollarApiError(fields.code ?? fallback, {
      status: response.status,
      ...(fields.message ? { message: fields.message } : {}),
    });
  }
}

/** GET /earn/providers?chain= : the providers on a chain other than Stellar. Empty = no Earn there. */
export function getChainEarnProviders(api: PollarApiClient, chain: EarnChain): Promise<SolanaEarnProvidersContent> {
  return chainRead(() => api.GET('/earn/providers', { params: { query: { chain } } }), 'SDK_EARN_PROVIDERS_FAILED');
}

/** GET /earn/opportunities?chain= : the opportunities the app opted into on that chain, APY after fees. */
export function getChainEarnOpportunities(
  api: PollarApiClient,
  chain: EarnChain,
): Promise<{ opportunities: SolanaEarnOpportunity[] }> {
  return chainRead(() => api.GET('/earn/opportunities', { params: { query: { chain } } }), 'SDK_EARN_OPPORTUNITIES_FAILED');
}

/** GET /earn/position?chain=&opportunity= : the session user's position, read from their own wallet on the chain. */
export function getChainEarnPosition(api: PollarApiClient, chain: EarnChain, opportunity: string): Promise<SolanaEarnPosition> {
  return chainRead(() => api.GET('/earn/position', { params: { query: { chain, opportunity } } }), 'SDK_EARN_POSITION_FAILED');
}

/**
 * POST /earn/build with `chain`. Answers 200 with the unsigned transaction for
 * an external wallet, or 202 with the pending co-sign request for a co-signed
 * one; the caller reads both off the raw response.
 */
export function buildChainEarn(api: PollarApiClient, body: SolanaEarnBuildBody) {
  return api.POST('/earn/build', { body });
}
