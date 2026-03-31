import type { KycLevel, KycProvider, KycStartBody, KycStartResponse, KycStatus } from '../../types';
import type { PollarApiClient } from '../client';

/**
 * GET /kyc/status
 * Returns the current user's KYC status for a given provider.
 * Requires a valid auth token in the API client.
 */
export async function getKycStatus(
  api: PollarApiClient,
  providerId?: string,
): Promise<{ status: KycStatus; level?: KycLevel | undefined; providerId: string; expiresAt?: string }> {
  const { data, error } = await api.GET('/kyc/status', {
    params: { query: providerId ? { providerId } : {} },
  });
  if (!data?.content || error) {
    throw new Error((error as any)?.error ?? 'Failed to get KYC status');
  }
  return data.content;
}

/**
 * GET /kyc/providers
 * Returns available KYC providers for a given country.
 */
export async function getKycProviders(api: PollarApiClient, country: string): Promise<{ providers: KycProvider[] }> {
  const { data, error } = await api.GET('/kyc/providers', { params: { query: { country } } });
  if (!data?.content || error) throw new Error((error as any)?.error ?? 'Failed to get KYC providers');
  return data.content;
}

/**
 * POST /kyc/start
 * Starts a KYC session.
 * - flow=iframe/redirect: returns kycUrl to embed or redirect to
 * - flow=form: returns fields[] to render a custom form
 */
export async function startKyc(api: PollarApiClient, body: KycStartBody): Promise<KycStartResponse> {
  const { data, error } = await api.POST('/kyc/start', { body });
  if (!data?.content || error) throw new Error((error as any)?.error ?? 'Failed to start KYC');
  return data.content;
}

/**
 * Orchestrates the full KYC resolution flow:
 * 1. Checks current status
 * 2. If already approved, returns early
 * 3. Otherwise starts KYC and returns the session (kycUrl or fields)
 */
export async function resolveKyc(
  api: PollarApiClient,
  providerId: string,
  level: KycLevel = 'basic',
): Promise<{ alreadyApproved: boolean } & Partial<KycStartResponse>> {
  const { status } = await getKycStatus(api, providerId);
  if (status === 'approved') return { alreadyApproved: true };
  const started = await startKyc(api, { providerId, level });
  return { alreadyApproved: false, ...started };
}

/**
 * Polls GET /kyc/status every intervalMs until status is 'approved' or 'rejected'.
 * Throws if timeoutMs is exceeded.
 */
export async function pollKycStatus(
  api: PollarApiClient,
  providerId: string,
  { intervalMs = 3000, timeoutMs = 300_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<KycStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status } = await getKycStatus(api, providerId);
    if (status === 'approved' || status === 'rejected') return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('KYC polling timed out');
}
