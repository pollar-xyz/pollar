import type { SwapConfigContent, SwapQuoteBody, SwapQuoteContent } from '../../types';
import type { StellarNetwork } from '../../stellar/StellarClient';
import type { PollarApiClient } from '../client';

/**
 * GET /swap/config
 * The venues this app exposes to end-users (operator's dashboard selection,
 * intersected with server capability). Empty `venues` = swap disabled.
 */
export async function getSwapConfig(api: PollarApiClient, network?: StellarNetwork): Promise<SwapConfigContent> {
  const query = network ? { network } : {};
  const { data, error } = await api.GET('/swap/config', { params: { query } });
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
