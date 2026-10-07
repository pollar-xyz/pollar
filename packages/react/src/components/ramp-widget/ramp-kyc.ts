/** Open platform KYC only for the backend's explicit, scoped pre-transaction gate. */
export function requiredRampKyc(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const { code, body } = error as { code?: unknown; body?: unknown };
  if (code !== 'SDK_RAMPS_KYC_REQUIRED' || !body || typeof body !== 'object') return null;
  const { rampProviderId, kycProviderId, corridorId } = body as {
    rampProviderId?: unknown;
    kycProviderId?: unknown;
    corridorId?: unknown;
  };
  if (
    typeof rampProviderId !== 'string' ||
    !rampProviderId.trim() ||
    typeof kycProviderId !== 'string' ||
    !kycProviderId.trim() ||
    typeof corridorId !== 'string' ||
    !corridorId.trim()
  )
    return null;
  return { rampProviderId, kycProviderId, corridorId };
}
