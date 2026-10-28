import type {
  SolanaSwapBuildBody,
  SolanaSwapConfigContent,
  SolanaSwapQuoteBody,
  SolanaSwapQuoteContent,
  SwapConfigContent,
  SwapQuoteBody,
  SwapQuoteContent,
  SwapTokensContent,
} from '../../types';
import type { PollarApiClient } from '../client';
import { apiErrorFields } from '../error-fields';

/**
 * GET /swap/config
 * The venues this app exposes to end-users (operator's dashboard selection,
 * intersected with server capability). Empty `venues` = swap disabled.
 */
export async function getSwapConfig(api: PollarApiClient): Promise<SwapConfigContent> {
  const { data, error } = await api.GET('/swap/config');
  if (!data?.content || error) {
    throw new Error(apiErrorFields(error).code ?? apiErrorFields(error).error ?? 'Failed to load swap config');
  }
  // Without `chain` the endpoint answers for Stellar.
  return data.content as SwapConfigContent;
}

/**
 * GET /swap/config?chain=SOLANA
 * The Solana venues this app exposes (Jupiter, Titan; mainnet only). Empty = no swap on Solana.
 */
export async function getSolanaSwapConfig(api: PollarApiClient): Promise<SolanaSwapConfigContent> {
  const { data, error } = await api.GET('/swap/config', { params: { query: { chain: 'SOLANA' } } });
  if (!data?.content || error) {
    throw new Error(apiErrorFields(error).code ?? apiErrorFields(error).error ?? 'Failed to load swap config');
  }
  return data.content as SolanaSwapConfigContent;
}

/**
 * GET /swap/tokens
 * The curated "buy" tokens the app opted into (admin catalog), for this API key's
 * network. The SDK merges these into the buy list.
 */
export async function getSwapTokens(api: PollarApiClient): Promise<SwapTokensContent> {
  const { data, error } = await api.GET('/swap/tokens');
  if (!data?.content || error) {
    throw new Error(apiErrorFields(error).code ?? apiErrorFields(error).error ?? 'Failed to load swap tokens');
  }
  return data.content;
}

/**
 * POST /swap/quote
 * Prices an asset-to-asset swap across the requested venue(s). Read-only: returns
 * ranked quotes (best output first), each with a ready-to-execute `build` payload
 * the client runs through the tx pipeline. An empty `quotes` array means no route
 * exists for the pair on this network.
 */
export async function quoteSwap(api: PollarApiClient, body: SwapQuoteBody): Promise<SwapQuoteContent> {
  const { data, error } = await api.POST('/swap/quote', { body });
  if (!data?.content || error) {
    throw new Error(apiErrorFields(error).code ?? apiErrorFields(error).error ?? 'Failed to quote swap');
  }
  // A body without `chain` is quoted on Stellar.
  return data.content as SwapQuoteContent;
}

/**
 * POST /swap/quote with `chain: 'SOLANA'`
 * Prices a Solana swap on Jupiter and Titan for the session user's Solana
 * wallet, best output first. Read-only; the quotes carry no transaction.
 */
export async function quoteSolanaSwap(api: PollarApiClient, body: SolanaSwapQuoteBody): Promise<SolanaSwapQuoteContent> {
  const { data, error } = await api.POST('/swap/quote', { body });
  if (!data?.content || error) {
    throw new Error(apiErrorFields(error).code ?? apiErrorFields(error).error ?? 'Failed to quote swap');
  }
  return data.content as SolanaSwapQuoteContent;
}

/**
 * POST /swap/build
 * Builds the Solana swap the user picked. Answers 200 with the unsigned
 * transaction for an external wallet, or 202 with the pending co-sign request
 * for a co-signed one; the caller reads both off the raw response.
 */
export function buildSolanaSwap(api: PollarApiClient, body: SolanaSwapBuildBody) {
  return api.POST('/swap/build', { body });
}
