import type { RampQuoteRequirement } from '@pollar/core';
import { kycReviewMessage } from '../kyc-modal/kyc-messages';

/**
 * A requirement step the user must complete before a route: a KYC option, a form, a
 * registry option, or (for PROVIDER_REGISTRATION) the registration of `corridorId`.
 */
export type PendingRequirement = {
  rampProviderId: string;
  corridorId: string;
  type: 'KYC' | 'FORM' | 'REGISTRY_CHECK' | 'PROVIDER_REGISTRATION';
  optionId: string;
  /** Known when it comes from the quote; the start gate does not say. */
  progress?: { position: number; total: number };
};

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/**
 * The step the backend's start gate names, or null for any other error. v2 says
 * `requirementType` and `optionId`; a KYC-only body names the option as `kycProviderId`.
 */
export function requiredRampKyc(error: unknown): PendingRequirement | null {
  if (!error || typeof error !== 'object') return null;
  const { code, body } = error as { code?: unknown; body?: unknown };
  if (code !== 'SDK_RAMPS_KYC_REQUIRED' || !body || typeof body !== 'object') return null;
  const { rampProviderId, corridorId, requirementType, optionId, kycProviderId } = body as Record<string, unknown>;
  if (!nonEmpty(rampProviderId) || !nonEmpty(corridorId)) return null;
  if (
    (requirementType === 'FORM' || requirementType === 'REGISTRY_CHECK' || requirementType === 'PROVIDER_REGISTRATION') &&
    nonEmpty(optionId)
  ) {
    return { rampProviderId, corridorId, type: requirementType, optionId };
  }
  const kyc = nonEmpty(optionId) && requirementType === 'KYC' ? optionId : kycProviderId;
  return nonEmpty(kyc) ? { rampProviderId, corridorId, type: 'KYC', optionId: kyc } : null;
}

/** The step a locked route names in the quote. */
export function pendingFromQuote(requirement: RampQuoteRequirement): PendingRequirement {
  return {
    rampProviderId: requirement.rampProviderId,
    corridorId: requirement.corridorId,
    type: requirement.type,
    optionId: requirement.optionId,
    progress: { position: requirement.completed + 1, total: requirement.total },
  };
}

/**
 * What a route held back by a requirement step says, and the button it offers. A verification
 * held for review (`reviewReason`) or rejected has nothing the user can do from
 * here, so those rows carry no button.
 */
export function lockedRouteCopy(requirement: Pick<RampQuoteRequirement, 'status' | 'reviewReason'> & { type?: string }): {
  message: string;
  action: string | null;
} {
  if (requirement.type === 'FORM') return { message: 'Answer a few questions to see this route', action: 'Continue' };
  if (requirement.type === 'PROVIDER_REGISTRATION') {
    return { message: 'Register with the provider to see this route', action: 'Continue' };
  }
  if (requirement.type === 'REGISTRY_CHECK') {
    return requirement.status === 'pending'
      ? { message: 'Your details are under review', action: null }
      : { message: 'Confirm your details to see this route', action: 'Confirm' };
  }
  switch (requirement.status) {
    case 'expired':
      return { message: 'Your verification expired', action: 'Verify again' };
    case 'pending':
      if (!requirement.reviewReason) return { message: 'Verification in progress', action: 'Continue' };
      return {
        message:
          requirement.reviewReason === 'DUPLICATE_DOCUMENT'
            ? kycReviewMessage(requirement.reviewReason)
            : 'Your verification is under review',
        action: null,
      };
    case 'rejected':
      return { message: 'Verification was not approved', action: null };
    default:
      return { message: 'Verify your identity to see this route', action: 'Verify' };
  }
}
