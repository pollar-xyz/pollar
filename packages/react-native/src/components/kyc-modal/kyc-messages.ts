import type { PollarLanguage } from '@pollar/core';
import { KYC_COPY } from './kyc-copy';

/** What a failed KYC call means for the user, by backend code. */
export function kycErrorMessage(error: unknown, phase: 'load' | 'start', language: PollarLanguage = 'en'): string {
  const copy = KYC_COPY[language];
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const known = typeof code === 'string' ? copy.errors[code] : undefined;
  if (known) return known;
  return phase === 'load' ? copy.loadFailed : copy.startFailed;
}

/** Why a verification is held for a person to review, in the user's terms. */
export function kycReviewMessage(reviewReason: string | null | undefined, language: PollarLanguage = 'en'): string {
  const copy = KYC_COPY[language];
  return reviewReason === 'DUPLICATE_DOCUMENT' ? copy.duplicateDocument : copy.stillReviewing;
}

/** A decision the vendor approved that Pollar is still recording. */
export function kycProcessingMessage(language: PollarLanguage = 'en'): string {
  return KYC_COPY[language].processing;
}
