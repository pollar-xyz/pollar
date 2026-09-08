import type { BorrowBuildContent, BorrowBuildParams, BorrowMarket, BorrowMarketName, BorrowPosition } from '../../types';
import type { PollarApiClient } from '../client';

type Client = { GET(path: string, init: unknown): Promise<{ data?: { content?: unknown }; error?: unknown }>; POST(path: string, init: unknown): Promise<{ data?: { content?: unknown }; error?: unknown }> };
const message = (error: unknown, fallback: string) => (error as { code?: string; message?: string } | undefined)?.message ?? (error as { code?: string } | undefined)?.code ?? fallback;
export async function getBorrowMarkets(api: PollarApiClient, market: BorrowMarketName): Promise<BorrowMarket[]> {
  const { data, error } = await (api as unknown as Client).GET('/borrow/markets', { params: { query: { market } } });
  if (!data?.content || error) throw new Error(message(error, 'Failed to load borrow markets'));
  return (data.content as { markets: BorrowMarket[] }).markets;
}
export async function getBorrowPositions(api: PollarApiClient, market: BorrowMarketName, address: string): Promise<BorrowPosition[]> {
  const { data, error } = await (api as unknown as Client).GET('/borrow/positions', { params: { query: { market, address } } });
  if (!data?.content || error) throw new Error(message(error, 'Failed to load borrow positions'));
  return (data.content as { positions: BorrowPosition[] }).positions;
}
export async function buildBorrowTx(api: PollarApiClient, body: BorrowBuildParams & { signer: string }): Promise<BorrowBuildContent> {
  const { data, error } = await (api as unknown as Client).POST('/borrow/build', { body });
  if (!data?.content || error) throw new Error(message(error, 'Failed to build borrow transaction'));
  return data.content as BorrowBuildContent;
}
