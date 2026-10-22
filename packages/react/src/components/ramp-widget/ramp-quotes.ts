import type { PollarClient, RampRoute, RampsQuoteQuery, RampsQuoteResponse } from '@pollar/core';

export function unavailableRampMessage(country: string, unavailable: NonNullable<RampsQuoteResponse['unavailable']>): string {
  if (!unavailable.length) return `No ramp providers available for ${country} yet.`;
  return unavailable
    .map(({ provider, code }) =>
      code === 'SDK_RAMPS_PROVIDER_NOT_CONFIGURED'
        ? `${provider} is not configured correctly. Contact the app administrator to enable this provider.`
        : `${provider} is temporarily unavailable. Please try again later.`,
    )
    .join(' ');
}

/** Compare quotes in one step, including registered routes on other chains. */
export async function quoteRampOptions(
  client: PollarClient,
  query: RampsQuoteQuery,
  routes: RampRoute[],
): Promise<RampsQuoteResponse> {
  const matching = routes.filter(
    (route) => route.country === query.country && route.direction === query.direction && route.fiatCurrency === query.currency,
  );
  // The default request already quotes each provider's default route. Only
  // request explicit routes that were not returned, including other chains.
  const [general] = await Promise.allSettled([client.getRampsQuote(query)]);
  const covered = new Set(
    general?.status === 'fulfilled'
      ? general.value.quotes.flatMap((quote) =>
          quote.route ? [JSON.stringify([quote.route.routeId, quote.route.asset.chain])] : [],
        )
      : [],
  );
  const pending = new Map(
    matching
      .filter((route) => !covered.has(JSON.stringify([route.routeId, route.asset.chain])))
      .map((route) => [JSON.stringify([route.routeId, route.asset.chain]), route]),
  );
  const responses = [
    general!,
    ...(await Promise.allSettled(
      [...pending.values()].map((route) =>
        client.getRampsQuote({ ...query, routeId: route.routeId, chain: route.asset.chain }),
      ),
    )),
  ];
  const results = responses.flatMap((response) => (response.status === 'fulfilled' ? [response.value] : []));
  if (!results.length) throw (responses[0] as PromiseRejectedResult).reason;
  const quotes = new Map<string, RampsQuoteResponse['quotes'][number]>();
  const requirements = new Map<string, NonNullable<RampsQuoteResponse['requirementsRequired']>[number]>();
  const unavailable = new Map<string, NonNullable<RampsQuoteResponse['unavailable']>[number]>();
  for (const result of results) {
    for (const quote of result.quotes) {
      const key = JSON.stringify([quote.provider, quote.route?.routeId, quote.route?.asset.chain, quote.rail, quote.protocol]);
      if (!quotes.has(key)) quotes.set(key, quote);
    }
    for (const requirement of result.requirementsRequired ?? [])
      requirements.set(`${requirement.rampProviderId}:${requirement.corridorId}`, requirement);
    for (const item of result.unavailable ?? []) unavailable.set(item.provider, item);
  }
  const failed = responses.find((response) => response.status === 'rejected');
  if (!quotes.size && !requirements.size && failed?.status === 'rejected') throw failed.reason;
  return {
    quotes: [...quotes.values()],
    requirementsRequired: [...requirements.values()],
    unavailable: [...unavailable.values()],
  };
}
