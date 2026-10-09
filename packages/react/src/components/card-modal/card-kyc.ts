import type { CardRequirementStep } from '@pollar/core';

/**
 * A platform step the user must complete before a card provider: a KYC option, a
 * form, a registry option, or (for PROVIDER_REGISTRATION) the provider itself.
 */
export type PendingCardStep = {
  cardProviderId: string;
  type: CardRequirementStep['type'];
  optionId: string;
  progress?: { position: number; total: number };
};

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** The step a cards call named in its 409, or null for any other error. */
export function requiredCardStep(error: unknown): PendingCardStep | null {
  if (!error || typeof error !== 'object') return null;
  const { code, body } = error as { code?: unknown; body?: unknown };
  if (code !== 'SDK_CARDS_REQUIREMENT_REQUIRED' || !body || typeof body !== 'object') return null;
  const { cardProviderId, requirementType, optionId } = body as Record<string, unknown>;
  if (!nonEmpty(cardProviderId) || !nonEmpty(optionId)) return null;
  if (
    requirementType === 'KYC' ||
    requirementType === 'FORM' ||
    requirementType === 'REGISTRY_CHECK' ||
    requirementType === 'PROVIDER_REGISTRATION'
  ) {
    return { cardProviderId, type: requirementType, optionId };
  }
  return null;
}

/** The step the provider's requirements name as next. */
export function pendingFromRequirement(cardProviderId: string, next: CardRequirementStep): PendingCardStep {
  return {
    cardProviderId,
    type: next.type,
    optionId: next.optionId,
    progress: { position: next.completed + 1, total: next.total },
  };
}

/** What a step held for review or rejected says; null when the user can act on it. */
export function blockedStepMessage(next: CardRequirementStep): string | null {
  if (next.type === 'REGISTRY_CHECK' && next.status === 'pending') return 'Your details are under review.';
  if (next.type !== 'KYC') return null;
  if (next.status === 'pending' && next.reviewReason) return 'Your verification is under review.';
  if (next.status === 'rejected') return 'Your verification was not approved.';
  return null;
}
