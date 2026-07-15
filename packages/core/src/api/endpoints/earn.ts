import type {
  EarnBuildBody,
  EarnBuildContent,
  EarnOpportunitiesContent,
  EarnPosition,
  EarnProviderId,
  EarnProvidersContent,
} from '../../types';
import type { PollarApiClient } from '../client';

function errMessage(error: unknown, fallback: string): string {
  const e = error as { code?: string; error?: string } | undefined;
  return e?.code ?? e?.error ?? fallback;
}

/**
 * GET /earn/providers
 * The yield providers this app exposes to end-users (enabled + server-capable).
 * Empty `providers` = Earn disabled; the SDK renders no Earn UI.
 */
export async function getEarnProviders(api: PollarApiClient): Promise<EarnProvidersContent> {
  const { data, error } = await api.GET('/earn/providers');
  if (!data?.content || error) throw new Error(errMessage(error, 'Failed to load earn providers'));
  return data.content;
}

/**
 * GET /earn/opportunities?provider=
 * The vaults (DeFindex) or pools (Blend) the provider exposes on this key's
 * network, each with its live APY. Read-only.
 */
export async function getEarnOpportunities(api: PollarApiClient, provider: EarnProviderId): Promise<EarnOpportunitiesContent> {
  const { data, error } = await api.GET('/earn/opportunities', { params: { query: { provider } } });
  if (!data?.content || error) throw new Error(errMessage(error, 'Failed to load earn opportunities'));
  return data.content;
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
  const { data, error } = await api.GET('/earn/position', { params: { query } });
  if (!data?.content || error) throw new Error(errMessage(error, 'Failed to load earn position'));
  return data.content;
}

/**
 * POST /earn/build
 * Builds the unsigned deposit/withdraw XDR server-side. The SDK then signs and
 * submits it with `signAndSubmitTx`.
 */
export async function buildEarnTx(api: PollarApiClient, body: EarnBuildBody): Promise<EarnBuildContent> {
  const { data, error } = await api.POST('/earn/build', { body });
  if (!data?.content || error) throw new Error(errMessage(error, 'Failed to build earn transaction'));
  return data.content;
}
