// Application side: an existing authenticated PollarClient talks only to Pollar's backend.
import type { PollarClient, RampQuote, RampRoute } from '@pollar/core';
import { rampQuoteFields } from '@pollar/core';

export function discoverRamps(client: PollarClient) {
  return client.getRampRoutes('ONRAMP');
}

export function quoteRamp(client: PollarClient, route: RampRoute, amountIn: string) {
  return client.quoteRamp({
    direction: 'ONRAMP',
    fiat: { currency: route.fiat.currency, rail: route.fiat.rail, country: route.fiat.country },
    asset: { code: route.asset.code, identifier: route.asset.identifier, chain: route.asset.chain },
    amount: { value: amountIn, denomination: 'in' },
  });
}

/** Call after the user accepts a backend-issued quote; `payee` answers its `rampQuoteFields`. Do not invent quote IDs. */
export function startDeposit(client: PollarClient, quote: RampQuote, payee: Record<string, string>) {
  const asked = new Set(rampQuoteFields(quote).map((field) => field.key));
  return client.createRampOrder({
    quoteId: quote.quoteId,
    payee: Object.fromEntries(Object.entries(payee).filter(([key]) => asked.has(key))),
  });
}

export function readSavedRamp(client: PollarClient, orderId: string) {
  return client.getRampOrder(orderId);
}
