import type { CardHolder, CardRequirements, CardRequirementStep } from '@pollar/core';
import type { CardCopy } from './card-copy';

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
  if (!('code' in error) || error.code !== 'SDK_CARDS_REQUIREMENT_REQUIRED') return null;
  const body = 'body' in error ? error.body : undefined;
  if (typeof body !== 'object' || body === null) return null;
  const cardProviderId = 'cardProviderId' in body ? body.cardProviderId : undefined;
  const requirementType = 'requirementType' in body ? body.requirementType : undefined;
  const optionId = 'optionId' in body ? body.optionId : undefined;
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
export function blockedStepMessage(next: CardRequirementStep, copy: CardCopy['blocked']): string | null {
  if (next.type === 'REGISTRY_CHECK' && next.status === 'pending') return copy.registryReview;
  if (next.type !== 'KYC') return null;
  if (next.status === 'pending' && next.reviewReason) return copy.kycReview;
  if (next.status === 'rejected') return copy.kycRejected;
  return null;
}

/**
 * Which part of the card flow the user is at before the provider has their KYC:
 * `steps` while nobody signed them up or the platform's steps are pending,
 * `provider-form` when the provider's own KYC form is theirs to fill, null past
 * both or while the holder or the requirements are loading. A holder signed up
 * before the app added steps still owes them. With a PROVIDER_REGISTRATION step
 * the platform sends the provider's KYC itself, so the provider's form never shows;
 * a holder still NOT_STARTED there stays on `steps`, whose action re-reads where
 * the user stands, instead of a blank modal.
 */
export function cardStage(
  holder: Pick<CardHolder, 'kycStatus'> | null | undefined,
  requirements: Pick<CardRequirements, 'steps' | 'next'> | null | undefined,
): 'steps' | 'provider-form' | null {
  if (holder === undefined || requirements === undefined) return null;
  if (holder === null || (holder.kycStatus === 'NOT_STARTED' && requirements?.next)) return 'steps';
  if (holder.kycStatus !== 'NOT_STARTED') return null;
  return requirements?.steps.some((step) => step.type === 'PROVIDER_REGISTRATION') ? 'steps' : 'provider-form';
}
