import type { DistributionClaimBody, DistributionClaimContent, DistributionRule } from '../../types';
import type { PollarApiClient } from '../client';

/**
 * GET /distribution/rules
 * Returns the distribution rules visible to the calling sdk-user, each
 * decorated with `claimable` and (when not claimable) a `reason` ErrorCode
 * the UI maps to a friendly message.
 */
export async function listDistributionRules(api: PollarApiClient): Promise<DistributionRule[]> {
  const { data, error } = await api.GET('/distribution/rules');
  if (!data?.content || error) {
    throw new Error((error as { code?: string; error?: string } | undefined)?.code ?? (error as { code?: string; error?: string } | undefined)?.error ?? 'Failed to list distribution rules');
  }
  return data.content.rules;
}

/**
 * POST /distribution/claim
 * Claims the given rule for the authenticated sdk-user. Returns the tx hash
 * once the payment is submitted to Stellar.
 */
export async function claimDistributionRule(
  api: PollarApiClient,
  body: DistributionClaimBody,
): Promise<DistributionClaimContent> {
  const { data, error } = await api.POST('/distribution/claim', { body });
  if (!data?.content || error) {
    throw new Error((error as { code?: string; error?: string } | undefined)?.code ?? (error as { code?: string; error?: string } | undefined)?.error ?? 'Failed to claim distribution rule');
  }
  return data.content;
}