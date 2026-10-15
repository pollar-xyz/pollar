// Compile-only examples: no client is constructed and no payment is submitted.
import type { PollarClient } from '../packages/core/src/client/client';
import type {
  RampContinuationBody,
  RampsOnrampBody,
  RampsQuoteQuery,
  RampsTransactionResponse,
} from '../packages/core/src/types';
import type { PollarApiClient } from '../packages/core/src/api/client';

export async function inspectRamp(client: PollarClient, txId: string) {
  const { routes } = await client.getRampRoutes();
  const route = routes.find((candidate) => candidate.direction === 'onramp');
  if (!route) return null;
  const query: RampsQuoteQuery = {
    direction: 'onramp',
    country: route.country,
    currency: route.fiatCurrency,
    amount: 100,
    amountExact: '100',
    routeId: route.routeId,
  };
  const { quotes } = await client.getRampsQuote(query);
  const quote = quotes[0];
  if (!quote) return null;
  const exactFiat: string | undefined = quote.terms?.fiatAmount;
  const body: RampsOnrampBody = {
    quoteId: quote.quoteId,
    amount: quote.fiatAmount,
    currency: route.fiatCurrency,
    country: route.country,
  };
  const tx = await client.getRampTransaction(txId);
  return { body, exactFiat, state: tx.lifecycleState, nextAction: tx.nextAction };
}

export function continueSavedAction(client: PollarClient, tx: RampsTransactionResponse) {
  if (!tx.nextAction || tx.transactionVersion === undefined) return;
  const body: RampContinuationBody = { actionId: tx.nextAction.actionId, transactionVersion: tx.transactionVersion };
  return client.continueRamp(tx.txId, body);
}

export function typedRetry(api: PollarApiClient, txId: string) {
  return api.POST('/ramps/transaction/{txId}/retry', { params: { path: { txId } } });
}

// @ts-expect-error A continuation must be bound to a saved transaction version.
const unversionedAction: RampContinuationBody = { actionId: 'saved-action' };
// @ts-expect-error Compatibility status does not gain the canonical refunded state.
const invalidCompatibilityStatus: RampsTransactionResponse['status'] = 'refunded';
void unversionedAction;
void invalidCompatibilityStatus;
