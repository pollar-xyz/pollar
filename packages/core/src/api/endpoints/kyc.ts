import type { KycLevel, KycProvider, KycStartBody, KycStartResponse, KycStatus, KycStatusContent } from '../../types';
import { isPollarApiError, PollarApiError } from '../../types';
import type { PollarApiClient } from '../client';

/** Wrap an error body into a {@link PollarApiError}, keeping the code the UI branches on. */
function kycApiError(error: unknown, fallback: string): PollarApiError {
  const body = (typeof error === 'object' && error !== null ? error : {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : fallback;
  return new PollarApiError(code, body);
}

/**
 * GET /kyc/status
 * Returns the current user's KYC status for a given provider. With `corridorId`
 * it answers for the route: `approved` when any option the route accepts is
 * satisfied, otherwise the status of the option to ask for.
 * Requires a valid auth token in the API client.
 */
export async function getKycStatus(
  api: PollarApiClient,
  providerId?: string,
  corridorId?: string,
  cardProviderId?: string,
): Promise<KycStatusContent> {
  // `cardProviderId` reaches the generated query type once schema.d.ts is regenerated against a
  // server with cards; until then the query is passed as built.
  const query = {
    ...(providerId ? { providerId } : {}),
    ...(corridorId ? { corridorId } : {}),
    ...(cardProviderId ? { cardProviderId } : {}),
  };
  const { data, error } = await api.GET('/kyc/status', {
    params: { query: query as { providerId?: string; corridorId?: string } },
  });
  if (!data?.content || error) throw kycApiError(error, 'Failed to get KYC status');
  return data.content;
}

/**
 * GET /kyc/providers
 * Returns available KYC providers for a given country. With `corridorId`, only
 * the one option the route asks for (or none).
 */
export async function getKycProviders(
  api: PollarApiClient,
  country: string,
  corridorId?: string,
  cardProviderId?: string,
): Promise<{ providers: KycProvider[] }> {
  const query = { country, ...(corridorId ? { corridorId } : {}), ...(cardProviderId ? { cardProviderId } : {}) };
  const { data, error } = await api.GET('/kyc/providers', {
    params: { query: query as { country: string; corridorId?: string } },
  });
  if (!data?.content || error) throw kycApiError(error, 'Failed to get KYC providers');
  return data.content;
}

/**
 * Creating a session waits on the KYC vendor's own API, which can take well over the
 * 10s default; only this call gets the longer budget.
 */
const KYC_START_TIMEOUT_MS = 30_000;

/**
 * POST /kyc/start
 * Starts a KYC session.
 * - flow=iframe/redirect: returns kycUrl to embed or redirect to
 * - flow=form: returns fields[] to render a custom form
 */
export async function startKyc(
  api: PollarApiClient,
  body: KycStartBody & { cardProviderId?: string },
): Promise<KycStartResponse> {
  const { data, error } = await api.POST('/kyc/start', {
    body: body as KycStartBody,
    headers: { 'x-pollar-timeout-ms': String(KYC_START_TIMEOUT_MS) },
  });
  if (!data?.content || error) throw kycApiError(error, 'Failed to start KYC');
  return data.content;
}

/**
 * Orchestrates the full KYC resolution flow:
 * 1. Checks current status
 * 2. If already approved, returns early
 * 3. Otherwise starts KYC and returns the session (kycUrl or fields)
 *
 * Pass the same `idempotencyKey` when retrying a failed start: the backend then
 * returns the session it already opened instead of paying for a new one.
 */
export async function resolveKyc(
  api: PollarApiClient,
  providerId: string,
  level: KycLevel = 'basic',
  country?: string,
  corridorId?: string,
  idempotencyKey?: string,
  cardProviderId?: string,
): Promise<{ alreadyApproved: boolean } & Partial<KycStartResponse>> {
  const { status } = await getKycStatus(api, providerId, corridorId, cardProviderId);
  if (status === 'approved') return { alreadyApproved: true };
  try {
    const started = await startKyc(api, {
      providerId,
      level,
      ...(corridorId ? { corridorId } : {}),
      ...(cardProviderId ? { cardProviderId } : {}),
      ...(country ? { country: country.trim().toUpperCase() } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    return { alreadyApproved: false, ...started };
  } catch (error) {
    // The approval can land between the status read and the start.
    if (isPollarApiError(error) && error.code === 'SDK_KYC_ALREADY_APPROVED') return { alreadyApproved: true };
    throw error;
  }
}

/**
 * Whether polling can stop: a final decision, one held for a person to review, or one
 * the vendor approved that Pollar is still recording (`status: 'pending'`,
 * `decisionStatus: 'approved'`), which another read seconds later does not change.
 */
function isSettled({ status, decisionStatus }: KycStatusContent): boolean {
  return (
    status === 'approved' ||
    status === 'rejected' ||
    status === 'expired' ||
    decisionStatus === 'approved' ||
    decisionStatus === 'manual_review' ||
    decisionStatus === 'rejected' ||
    decisionStatus === 'expired'
  );
}

/**
 * Polls GET /kyc/status every intervalMs until the decision settles: approved,
 * rejected, expired, held for manual review (`status: 'pending'` with
 * `decisionStatus: 'manual_review'` and a `reviewReason`), or approved by the vendor
 * and still being recorded (`status: 'pending'`, `decisionStatus: 'approved'`), and
 * returns that read.
 * A failed read throws at once so the caller can offer a retry.
 * Throws if timeoutMs is exceeded.
 *
 * With `corridorId` the read is scoped to the route only: the route answers
 * `approved` through whichever accepted option the user holds.
 */
export async function pollKycDecision(
  api: PollarApiClient,
  providerId: string,
  {
    intervalMs = 3000,
    timeoutMs = 300_000,
    corridorId,
    cardProviderId,
  }: { intervalMs?: number; timeoutMs?: number; corridorId?: string; cardProviderId?: string } = {},
): Promise<KycStatusContent> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const read =
      corridorId || cardProviderId
        ? await getKycStatus(api, undefined, corridorId, cardProviderId)
        : await getKycStatus(api, providerId);
    if (isSettled(read)) return read;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('KYC polling timed out');
}

/**
 * {@link pollKycDecision}, reduced to the status. Resolves `'pending'` when the
 * decision is held for manual review or still being recorded; read
 * {@link pollKycDecision} to tell which.
 */
export async function pollKycStatus(
  api: PollarApiClient,
  providerId: string,
  opts: { intervalMs?: number; timeoutMs?: number; corridorId?: string; cardProviderId?: string } = {},
): Promise<KycStatus> {
  const read = await pollKycDecision(api, providerId, opts);
  return read.decisionStatus === 'expired' ? 'expired' : read.status;
}
