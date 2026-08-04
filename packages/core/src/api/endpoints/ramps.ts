import type { PollarApiClient } from '../client';
import type {
  RampRail,
  RampsCompleteResponse,
  RampsCountriesResponse,
  RampsKycStatusResponse,
  RampsLiquidityResponse,
  RampsOfframpBody,
  RampsOfframpResponse,
  RampsOnrampBody,
  RampsOnrampResponse,
  RampsPixDecodeResponse,
  RampsQuoteQuery,
  RampsQuoteResponse,
  RampsSignatureBody,
  RampsSignatureResponse,
  RampsTransactionResponse,
  RampTxStatus,
} from '../../types';

/**
 * GET /ramps/countries
 * Returns the ISO country codes (+ primary fiat currency) the app's enabled
 * ramp anchors support on its network. Use it to populate a country selector.
 */
export async function getRampCountries(api: PollarApiClient): Promise<RampsCountriesResponse> {
  const { data, error } = await api.GET('/ramps/countries');
  if (!data?.content || error) throw new Error((error as any)?.code ?? (error as any)?.error ?? 'Failed to get ramp countries');
  return data.content;
}

/**
 * GET /ramps/quote
 * Returns available quotes for an onramp or offramp.
 * The backend ranks providers by country, amount, fee and availability.
 * The first quote in the array is the recommended one.
 */
export async function getRampsQuote(api: PollarApiClient, query: RampsQuoteQuery): Promise<RampsQuoteResponse> {
  const { data, error } = await api.GET('/ramps/quote', { params: { query } });
  if (!data?.content || error) throw new Error((error as any)?.code ?? (error as any)?.error ?? 'Failed to get ramp quotes');
  return data.content;
}

/**
 * POST /ramps/onramp
 * Creates an onramp transaction.
 * For custodial users: backend orchestrates the full SEP-24 flow and returns payment instructions.
 * For non-custodial: backend may return an unsigned XDR that the client must sign via a wallet adapter.
 */
export async function createOnRamp(api: PollarApiClient, body: RampsOnrampBody): Promise<RampsOnrampResponse> {
  const { data, error } = await api.POST('/ramps/onramp', { body });
  if (!data?.content || error) throw new Error((error as any)?.code ?? (error as any)?.error ?? 'Failed to create onramp');
  return data.content;
}

/**
 * POST /ramps/offramp
 * Creates an offramp transaction.
 * Backend initiates the bank transfer once the Stellar transaction is confirmed.
 */
export async function createOffRamp(api: PollarApiClient, body: RampsOfframpBody): Promise<RampsOfframpResponse> {
  const { data, error } = await api.POST('/ramps/offramp', { body });
  if (!data?.content || error) throw new Error((error as any)?.code ?? (error as any)?.error ?? 'Failed to create offramp');
  return data.content;
}

/**
 * POST /ramps/transaction/{txId}/complete
 * Completes an offramp once anchor KYC is done: builds + signs + submits the
 * on-chain withdraw payment. Custodial wallets complete server-side and return
 * `stellarTxHash`; EXTERNAL wallets get a `pendingSignature` to sign and then
 * resume via {@link submitRampSignature}.
 */
export async function completeWithdraw(api: PollarApiClient, txId: string): Promise<RampsCompleteResponse> {
  const { data, error } = await api.POST('/ramps/transaction/{txId}/complete', { params: { path: { txId } } });
  if (!data?.content || error)
    throw new Error((error as any)?.code ?? (error as any)?.error ?? 'Failed to complete withdrawal');
  return data.content;
}

/**
 * POST /ramps/transaction/{txId}/signature
 * Resumes an EXTERNAL-wallet flow after the client signs a pending XDR.
 * `action: 'sep10'` exchanges the signed challenge for the anchor session;
 * `action: 'withdraw_payment'` broadcasts the signed on-chain withdraw payment.
 */
export async function submitRampSignature(
  api: PollarApiClient,
  txId: string,
  body: RampsSignatureBody,
): Promise<RampsSignatureResponse> {
  const { data, error } = await api.POST('/ramps/transaction/{txId}/signature', { params: { path: { txId } }, body });
  if (!data?.content || error) throw new Error((error as any)?.code ?? (error as any)?.error ?? 'Failed to submit signature');
  return data.content;
}

/**
 * GET /ramps/transaction/{txId}
 * Returns the current status of a ramp transaction.
 */
export async function getRampTransaction(api: PollarApiClient, txId: string): Promise<RampsTransactionResponse> {
  const { data, error } = await api.GET('/ramps/transaction/{txId}', { params: { path: { txId } } });
  if (!data?.content || error) throw new Error((error as any)?.code ?? (error as any)?.error ?? 'Failed to get transaction');
  return data.content;
}

/**
 * GET /ramps/liquidity
 * Live liquidity on a payout rail. `available: false` means the rail cannot be
 * served right now — quoting it succeeds and then fails downstream, so check
 * before offering the corridor.
 */
export async function getRampLiquidity(api: PollarApiClient, rail: RampRail): Promise<RampsLiquidityResponse> {
  const { data, error } = await api.GET('/ramps/liquidity', { params: { query: { rail } } });
  if (!data?.content || error) throw new Error((error as any)?.code ?? (error as any)?.error ?? 'Failed to get ramp liquidity');
  return data.content;
}

/**
 * GET /ramps/kyc-status
 * Where the authenticated user stands with the ramp provider's identity checks.
 * Poll after an off-ramp answered `kycRequired: true`: nothing was signed and no
 * funds moved, so wait for `hasApproved` and then request a fresh quote.
 */
export async function getRampKycStatus(api: PollarApiClient): Promise<RampsKycStatusResponse> {
  const { data, error } = await api.GET('/ramps/kyc-status');
  if (!data?.content || error)
    throw new Error((error as any)?.code ?? (error as any)?.error ?? 'Failed to get ramp KYC status');
  return data.content;
}

/**
 * GET /ramps/pix/decode
 * Reads a Pix "copia e cola" payload into payee + amount. `decoded: null` means
 * the code no longer resolves: dynamic Pix QRs carry a per-charge id and go
 * stale once used or expired. Decode immediately before quoting, quote the
 * amount it returns, and send the ORIGINAL payload as `qrCode` on the off-ramp —
 * paying the bare key it decodes to gets rejected by the payee's bank.
 */
export async function decodePixQr(api: PollarApiClient, qrCode: string): Promise<RampsPixDecodeResponse> {
  const { data, error } = await api.GET('/ramps/pix/decode', { params: { query: { qrCode } } });
  if (!data?.content || error) throw new Error((error as any)?.code ?? (error as any)?.error ?? 'Failed to decode Pix QR');
  return data.content;
}

/**
 * Polls GET /ramps/transaction/{txId} every intervalMs until status is 'completed' or 'failed'.
 * Throws if timeoutMs is exceeded.
 */
export async function pollRampTransaction(
  api: PollarApiClient,
  txId: string,
  { intervalMs = 5000, timeoutMs = 600_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<RampTxStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status } = await getRampTransaction(api, txId);
    if (status === 'completed' || status === 'failed') return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Ramp transaction polling timed out');
}
