import type { RampQuote } from '@pollar/core';

/** The route choice that follows the best quote, whatever it is. */
export const BEST_ROUTE = 'best';

/** A route's identity across quotes: quoting again gives the same route a new quote id. */
export function routeKey(quote: RampQuote): string {
  const node = (n: RampQuote['legs'][number]['from']) =>
    n.kind === 'asset' ? `${n.code}:${n.chain}` : `${n.currency}:${n.rail}`;
  return quote.legs.map((leg) => `${leg.kind}:${node(leg.from)}>${node(leg.to)}`).join('|');
}
