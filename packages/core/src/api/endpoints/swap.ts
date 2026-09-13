import type { SwapConfigContent, SwapQuoteBody, SwapQuoteContent, SwapTokensContent } from '../../types';
import type { PollarApiClient } from '../client';

/**
 * GET /swap/config
 * The venues this app exposes to end-users (operator's dashboard selection,
 * intersected with server capability). Empty `venues` = swap disabled.
 */
export async function getSwapConfig(api: PollarApiClient): Promise<SwapConfigContent> {
  const { data, error } = await api.GET('/swap/config');
  if (!data?.content || error) {
    throw new Error(
      (error as { code?: string; error?: string } | undefined)?.code ??
        (error as { code?: string; error?: string } | undefined)?.error ??
        'Failed to load swap config',
    );
  }
  return data.content;
}

/**
 * GET /swap/tokens
 * The curated "buy" tokens the app opted into (admin catalog), for this API key's
 * network. The SDK merges these into the buy list.
 */
export async function getSwapTokens(api: PollarApiClient): Promise<SwapTokensContent> {
  const { data, error } = await api.GET('/swap/tokens');
  if (!data?.content || error) {
    throw new Error(
      (error as { code?: string; error?: string } | undefined)?.code ??
        (error as { code?: string; error?: string } | undefined)?.error ??
        'Failed to load swap tokens',
    );
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
    throw new Error(
      (error as { code?: string; error?: string } | undefined)?.code ??
        (error as { code?: string; error?: string } | undefined)?.error ??
        'Failed to quote swap',
    );
  }
  return data.content;
}
