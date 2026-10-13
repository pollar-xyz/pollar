/** What a failed KYC call means for the user, by backend code. */
export function kycErrorMessage(error: unknown, phase: 'load' | 'start'): string {
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case 'SDK_KYC_NOT_CONFIGURED':
      return 'Identity verification is not available for this app yet.';
    case 'SDK_KYC_PROVIDER_ERROR':
      return 'The verification service is not responding right now. Please try again in a moment.';
    case 'SDK_KYC_SESSION_EXPIRED':
      return 'Your previous verification session expired. Select the provider to start a new one.';
    case 'SDK_KYC_PROVIDER_NOT_FOUND':
    case 'SDK_KYC_PROVIDER_NOT_ENABLED':
      return 'This verification option is no longer available. Refresh to see the current options.';
    case 'SDK_RAMPS_PROVIDER_NOT_CONFIGURED':
      return 'This route is not set up for identity verification yet.';
    case 'VALIDATION_ERROR':
      return 'This verification option is not available for your country.';
    default:
      return phase === 'load'
        ? 'Could not load verification options. Please refresh to try again.'
        : 'Could not start verification. Please try again.';
  }
}

/** Why a verification is held for a person to review, in the user's terms. */
export function kycReviewMessage(reviewReason: string | null | undefined): string {
  if (reviewReason === 'DUPLICATE_DOCUMENT') {
    return 'This document is already linked to another account, so our team is reviewing it. You can check again later.';
  }
  return 'Your verification is still being reviewed. You can check again shortly.';
}

/** A decision the vendor approved that Pollar is still recording. */
export function kycProcessingMessage(): string {
  return 'Your verification was approved. We are finishing setting it up; check again in a minute.';
}
