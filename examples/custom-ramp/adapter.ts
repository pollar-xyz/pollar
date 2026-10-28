import {
  defineRampAdapter,
  isRampAdapterError,
  RampAdapterError,
  type RampAdapter,
  type RampAdapterAttemptRecorder,
  type RampAdapterObservation,
  type RampAdapterRoute,
  type RampAdapterUserContext,
} from '@pollar/core/ramps';

/** Server-only transport: Pollar injects the configured authenticated provider client. */
export interface ExampleProviderClient {
  quote(input: {
    direction: 'onramp' | 'offramp';
    amount: string;
    denomination: 'fiat' | 'crypto';
  }): Promise<{ reference: string; expiresAt: string; fiatAmount: string; cryptoAmount: string; feeAmount: string }>;
  createOrder(input: {
    idempotencyKey: string;
    transactionId: string;
    configurationId: string;
    quoteReference: string | null;
    direction: 'onramp' | 'offramp';
    walletAddress: string;
    payee: Record<string, string>;
  }): Promise<ExampleProviderOrder>;
  getOrder(reference: string): Promise<ExampleProviderOrder>;
  findOrder(input: { idempotencyKey: string; configurationId: string }): Promise<ExampleProviderOrder | null>;
}
export interface ExampleProviderOrder {
  reference: string;
  revision: string;
  status: 'waiting_funds' | 'processing' | 'paid' | 'rejected';
  direction: 'onramp' | 'offramp';
  fiatReference?: string;
  stellarHash?: string;
}

const asset = { code: 'DEMO', identifier: null, chain: 'STELLAR', network: 'testnet', precision: 7 } as const;
const routes: RampAdapterRoute[] = (['onramp', 'offramp'] as const).map((direction) => ({
  routeId: `example:${direction}:testnet`,
  direction,
  country: 'US',
  fiatCurrency: 'USD',
  rail: 'ACH',
  asset,
  limits: { denomination: 'fiat', min: '1', max: '100000' },
}));

function observe(order: ExampleProviderOrder): RampAdapterObservation {
  const facts: RampAdapterObservation['facts'] = [];
  if (order.status === 'processing') facts.push({ kind: 'provider_processing' });
  if (order.status === 'rejected') facts.push({ kind: 'provider_rejection_reported' });
  if (order.fiatReference)
    facts.push({
      kind: order.direction === 'onramp' ? 'fiat_receipt_reported' : 'fiat_payout_reported',
      reference: order.fiatReference,
    });
  if (order.stellarHash)
    facts.push({
      kind: 'chain_transaction_reported',
      chain: 'STELLAR',
      hash: order.stellarHash,
      leg: order.direction === 'onramp' ? 'destination' : 'source',
    });
  return {
    providerOrderRef: order.reference,
    identity: `${order.reference}:${order.revision}`,
    rawStatus: order.status,
    facts,
    proposedActions: [{ kind: 'wait', reason: 'settlement_verification' }],
    verificationRequired: false,
    payment: null,
  };
}

/**
 * Records one provider call as an attempt of the leg. Request and response are
 * what an operator sees; the payee's bank details go in `sensitive` only.
 */
async function recorded<T>(
  recorder: RampAdapterAttemptRecorder | undefined,
  step: string,
  request: unknown,
  call: () => Promise<T>,
  sensitive?: unknown,
): Promise<T> {
  const started = Date.now();
  try {
    const response = await call();
    await recorder?.record({ step, request, response, sensitive, latencyMs: Date.now() - started });
    return response;
  } catch (error) {
    const code = isRampAdapterError(error) ? error.code : 'PROVIDER_ERROR';
    await recorder?.record({ step, request, sensitive, latencyMs: Date.now() - started, errorCode: code });
    if (isRampAdapterError(error)) throw error;
    throw new RampAdapterError('PROVIDER_UNAVAILABLE', 'retry_read', undefined, {
      providerCode: error instanceof Error ? error.name : 'UNKNOWN',
      detail: step,
    });
  }
}

/** Installed in Pollar's backend; application code uses the standard PollarClient methods. */
export function createExampleRampAdapter(provider: ExampleProviderClient, recorder?: RampAdapterAttemptRecorder): RampAdapter {
  return defineRampAdapter({
    adapterId: 'example-bank',
    validity: {
      source: 'provider_quote',
      beforeFundsMove: 'requote',
      afterFundsMove: 'hold',
      description: 'The bank quote is firm until expiresAt; an order placed after it is quoted again.',
    },
    async capabilities(_user: RampAdapterUserContext) {
      return {
        routes,
        callbacks: false,
        polling: true,
        providerIdempotency: true,
        operationLookup: true,
        fiatPayoutEvidence: false,
        keyRetentionSeconds: null,
      };
    },
    async quote({ route, amount }) {
      const input = { direction: route.direction, amount: amount.value, denomination: amount.denomination };
      const quote = await recorded(recorder, 'quote', input, () => provider.quote(input));
      return {
        providerQuoteRef: quote.reference,
        providerExpiresAt: quote.expiresAt,
        terms: {
          fiatCurrency: route.fiatCurrency,
          fiatAmount: quote.fiatAmount,
          cryptoAmount: quote.cryptoAmount,
          feeAmount: quote.feeAmount,
          feeCurrency: route.fiatCurrency,
          assetCode: route.asset.code,
          assetChain: route.asset.chain,
          assetIssuer: route.asset.identifier,
        },
        requiredFields: [],
        availableAmount: null,
        kind: 'firm',
        fees: [
          {
            beneficiary: 'PROVIDER',
            payer: 'END_USER',
            settlement: 'INLINE',
            basis: 'FIAT_AMOUNT',
            basisAmount: quote.fiatAmount,
            basisCurrency: route.fiatCurrency,
            amount: quote.feeAmount,
            currency: route.fiatCurrency,
            usdValue: null,
          },
        ],
      };
    },
    async create({ operation, user, route, offer, payee }) {
      const input = {
        idempotencyKey: operation.idempotencyKey,
        transactionId: operation.transactionId,
        configurationId: user.configurationId,
        quoteReference: offer.providerQuoteRef,
        direction: route.direction,
        walletAddress: user.wallet.address,
      };
      const order = await recorded(recorder, 'create_order', input, () => provider.createOrder({ ...input, payee }), { payee });
      return { outcome: 'accepted', observation: observe(order) };
    },
    async status({ providerOrderRef }) {
      return observe(await provider.getOrder(providerOrderRef));
    },
    async reconcile({ operation, user }) {
      const order = operation.providerOrderRef
        ? await provider.getOrder(operation.providerOrderRef)
        : await provider.findOrder({ idempotencyKey: operation.idempotencyKey, configurationId: user.configurationId });
      return order ? observe(order) : null;
    },
  });
}
