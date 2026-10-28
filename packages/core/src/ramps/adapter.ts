// SPDX-License-Identifier: Apache-2.0
// Canonical server adapter contract. Kept independent of generated HTTP schemas.
/**
 * Revision of this contract. Version 2 adds the actor and signing mode to the
 * user context, provider-built payloads, the attempt recorder, provider codes
 * on errors, fee breakdowns and a declared validity policy. Every addition is
 * optional, so a version 1 adapter keeps compiling; a registration declares the
 * version it was written for and Pollar reads the version 2 fields only from
 * adapters that declare it.
 */
export const RAMP_ADAPTER_CONTRACT_VERSION = 2 as const;
export type RampAdapterContractVersion = 1 | 2;
export type RampAdapterChain = 'STELLAR' | 'POLYGON' | 'SOLANA';
/**
 * How the user pays or gets paid. `HOSTED` means the method is chosen inside the
 * provider's own flow, so Pollar does not know it when the route is listed.
 */
export type RampAdapterRail = 'SPEI' | 'PIX' | 'PSE' | 'ACH' | 'BREB' | 'QR' | 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'HOSTED';
export type RampAdapterTerms = {
  fiatCurrency: string;
  fiatAmount: string;
  cryptoAmount: string;
  feeAmount: string;
  feeCurrency: string;
  assetCode: string;
  assetChain: RampAdapterChain;
  assetIssuer: string | null;
};

/** Provider amounts are exact decimal strings, never IEEE-754 calculations. */
export type RampDecimal = string;
export type RampAdapterRoute = {
  routeId: string;
  direction: 'onramp' | 'offramp';
  country: string;
  fiatCurrency: string;
  rail: RampAdapterRail;
  asset: { code: string; identifier: string | null; chain: RampAdapterChain; network: string; precision: number };
  limits: { denomination: 'fiat' | 'crypto'; min: RampDecimal | null; max: RampDecimal | null };
};

/**
 * Who operates the ramp: an end user with a Pollar session, or an end user the
 * application's backend manages under its own id. Both resolve to a Pollar user
 * record, so `sdkUserId` stays set either way.
 */
export type RampAdapterActor =
  | { kind: 'SDK_USER'; applicationId: string; sdkUserId: string }
  | { kind: 'APP_USER'; applicationId: string; externalUserId: string };
/**
 * How the actor's wallet signs: with the user's passkey and Pollar's approver
 * (COSIGNED), with the user's passkey alone (SELF_CUSTODY), by the client
 * signing a payload Pollar builds (EXTERNAL), or by the application holding its
 * users' keys (APP_CUSTODY). A wallet Pollar custodies alone never ramps on mainnet.
 */
export type RampAdapterSigningMode = 'COSIGNED' | 'EXTERNAL' | 'APP_CUSTODY' | 'SELF_CUSTODY';
/** Supplied by the host after authentication; the SDK does not authorize this context. */
export type RampAdapterUserContext = {
  applicationId: string;
  sdkUserId: string;
  providerId: string;
  configurationId: string;
  /** Version 2. Absent on a host that still speaks version 1. */
  actor?: RampAdapterActor;
  wallet: {
    address: string;
    chain: string;
    network: 'testnet' | 'mainnet';
    custody: 'custodial' | 'external';
    /** Version 2. The exact signing mode; `custody` is its coarse projection. */
    signingMode?: RampAdapterSigningMode;
  };
};
export type RampAdapterField = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'select';
  optional?: boolean;
  bankType?: string;
  options?: Array<{ value: string; label: string; placeholder?: string }>;
  placeholder?: string;
  placeholderFrom?: string;
  hint?: string;
  /** A regular expression (JavaScript syntax, no flags) the whole value must match. */
  pattern?: string;
};
export type RampAdapterAction =
  | { kind: 'collect_information'; fields: RampAdapterField[] }
  | { kind: 'hosted_redirect'; purpose: 'verification' | 'payment'; url: string; expiresAt: string | null }
  | {
      kind: 'qr_payment';
      payload: string;
      amount: RampDecimal;
      currency: string;
      expiresAt: string | null;
      /** The provider's own page for this payment: what a phone opens, since it cannot scan its own screen. */
      link?: string | null;
    }
  | {
      kind: 'bank_transfer';
      amount: RampDecimal;
      currency: string;
      details: Array<{ label: string; value: string }>;
      reference: string | null;
      expiresAt: string | null;
      /** The provider's own page for this payment, where its status can be followed. */
      link?: string | null;
    }
  | { kind: 'user_ready'; purpose: 'create_order' | 'withdrawal_payment' | 'onramp_claim' }
  | {
      kind: 'verification';
      steps: Array<{
        stepId: string;
        purpose: 'verification' | 'terms';
        status: 'required' | 'awaiting_provider' | 'completed';
        url: string | null;
        instructions: string;
      }>;
      order: 'parallel' | 'sequential';
    }
  | {
      kind: 'chain_transfer';
      chain: string;
      network: string;
      asset: RampAdapterRoute['asset'];
      amount: RampDecimal;
      destination: string;
      memo: { type: string; value: string } | null;
    }
  | {
      kind: 'sign_transaction';
      purpose: 'authentication' | 'withdrawal_payment' | 'onramp_claim';
      chain: string;
      network: string;
      challengeRef: string;
      payload: { encoding: string; value: string };
      expiresAt: string;
    }
  | { kind: 'wait'; reason: 'verification_pending' | 'provider_processing' | 'settlement_verification' | 'reconciliation' };
export type RampAdapterPublicAction = RampAdapterAction & { actionId: string };
export type RampAdapterQuoteRequest = {
  route: RampAdapterRoute;
  amount: { value: RampDecimal; denomination: 'fiat' | 'crypto' };
  user: RampAdapterUserContext;
  /** The order's payee, once the user gave it: the quote taken right before an order carries it. */
  payee?: Record<string, string>;
};
/** One fee line of an offer: who collects it, who pays it and how it settles. */
export type RampAdapterLegFee = {
  beneficiary: 'POLLAR' | 'APPLICATION' | 'PROVIDER';
  payer: 'END_USER' | 'APPLICATION';
  settlement: 'INLINE' | 'CREDITS';
  /** What the fee is computed on, e.g. `FIAT_AMOUNT`, `CRYPTO_OUT`, `PROVIDER_FEE`. */
  basis: string;
  basisAmount: RampDecimal;
  basisCurrency: string;
  amount: RampDecimal;
  currency: string;
  usdValue: RampDecimal | null;
};
export type RampAdapterOffer = {
  providerQuoteRef: string | null;
  providerExpiresAt: string | null;
  terms: RampAdapterTerms;
  requiredFields: RampAdapterField[];
  availableAmount: RampDecimal | null;
  kind?: 'firm' | 'indicative';
  /** Version 2. Breakdown of `terms.feeAmount`; the total stays in `terms`. */
  fees?: RampAdapterLegFee[];
};
/** Persist before dispatch. Reuse these identities when reconciling an unknown outcome. */
export type RampAdapterOperation = {
  operationId: string;
  idempotencyKey: string;
  transactionId: string;
  providerOrderRef: string | null;
};
export type RampAdapterErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_ROUTE'
  | 'QUOTE_CHANGED'
  | 'QUOTE_EXPIRED'
  | 'VERIFICATION_REQUIRED'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REJECTED'
  | 'AUTH_CONFIGURATION_ERROR'
  | 'OUTCOME_UNKNOWN';
const errorBrand = Symbol.for('@pollar/core/RampAdapterError');
const errorCodes = new Set<string>([
  'INVALID_INPUT',
  'UNSUPPORTED_ROUTE',
  'QUOTE_CHANGED',
  'QUOTE_EXPIRED',
  'VERIFICATION_REQUIRED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_REJECTED',
  'AUTH_CONFIGURATION_ERROR',
  'OUTCOME_UNKNOWN',
]);
/** Public, redacted error. Do not include provider credentials or raw response bodies. */
export class RampAdapterError extends Error {
  /** Version 2. The provider's own code, for the failure catalog and the operator. */
  readonly providerCode?: string;
  /** Version 2. Operator detail; never personal data or a raw body. */
  readonly detail?: string;
  constructor(
    readonly code: RampAdapterErrorCode,
    readonly recovery: 'correct_input' | 'requote' | 'retry_read' | 'reconcile' | 'operator',
    readonly status?: number,
    options?: { providerCode?: string; detail?: string },
  ) {
    super(code);
    this.name = 'RampAdapterError';
    if (options?.providerCode !== undefined) this.providerCode = options.providerCode;
    if (options?.detail !== undefined) this.detail = options.detail;
    Object.defineProperty(this, errorBrand, { value: true });
  }
}
/** Works across the root, portable, native, ESM and CJS package entry points. */
export function isRampAdapterError(value: unknown): value is RampAdapterError {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<PropertyKey, unknown>;
  return (
    item[errorBrand] === true &&
    typeof item.code === 'string' &&
    errorCodes.has(item.code) &&
    typeof item.recovery === 'string' &&
    ['correct_input', 'requote', 'retry_read', 'reconcile', 'operator'].includes(item.recovery) &&
    (item.status === undefined ||
      (typeof item.status === 'number' && Number.isInteger(item.status) && item.status >= 100 && item.status <= 599))
  );
}
export type RampAdapterPayment = {
  chain: string;
  network: string;
  assetCode: string;
  identifier: string | null;
  precision?: number;
  amount: RampDecimal;
  destination: string;
  memo: string | { type: string; value: string } | null;
  notifyEndpoint: string | null;
  /**
   * Version 2. A payload the provider already built (a Stellar XDR, an EVM
   * transaction) that the chain executor validates and has signed instead of
   * building its own. When it expires before the signature arrives, Pollar
   * asks the adapter for a fresh one.
   */
  prebuiltPayload?: { encoding: string; value: string; expiresAt: string | null } | null;
  /**
   * Version 2. When the provider stops taking this payment (an off-ramp
   * order's deposit window). Pollar does not ask the user to sign, nor sends,
   * a payment past it; null or absent when the provider sets no limit.
   */
  expiresAt?: string | null;
};
/** Reports are observations, not verified fiat/chain settlement or lifecycle completion. */
export type RampAdapterFact =
  | { kind: 'provider_processing' }
  | { kind: 'fiat_receipt_reported' | 'fiat_payout_reported'; reference: string | null }
  | { kind: 'chain_transaction_reported'; chain: string; hash: string; leg: 'source' | 'intermediate' | 'destination' }
  | { kind: 'provider_rejection_reported' };
export type RampAdapterObservation = {
  providerOrderRef: string | null;
  identity: string;
  rawStatus: string;
  facts: RampAdapterFact[];
  proposedActions: RampAdapterAction[];
  verificationRequired: boolean;
  payment: RampAdapterPayment | null;
};
export type RampAdapterSubmission =
  | { outcome: 'accepted'; observation: RampAdapterObservation }
  | { outcome: 'rejected'; error: RampAdapterError }
  | { outcome: 'unknown'; error: RampAdapterError; providerOrderRef?: string };
export type RampAdapterCapabilities = {
  routes: RampAdapterRoute[];
  callbacks: boolean;
  polling: boolean;
  providerIdempotency: boolean;
  operationLookup: boolean;
  fiatPayoutEvidence: boolean;
  keyRetentionSeconds: number | null;
  refunds?: 'api' | 'manual' | 'unsupported';
  continuations?: Array<'user_ready' | 'signed_payload' | 'funding_verified'>;
};
export type RampAdapterCreateRequest = {
  operation: RampAdapterOperation;
  user: RampAdapterUserContext;
  route: RampAdapterRoute;
  offer: RampAdapterOffer;
  payee: Record<string, string>;
};
export type RampAdapterContinuation = {
  operation: RampAdapterOperation;
  action: RampAdapterPublicAction;
  user: RampAdapterUserContext;
  signedPayload?: string;
  fields?: Record<string, string>;
};
export type RampAdapterRefundRequest = {
  operation: RampAdapterOperation;
  user: RampAdapterUserContext;
  authorizationRef: string;
  amount: RampDecimal;
  currency: string;
};

export type RampAdapterFiatEvidence = {
  kind: 'fiat_confirmed';
  reference: string;
  verifier: string;
  purpose: 'receipt' | 'payout';
  currency: string;
  amount: RampDecimal;
  authenticated: true;
};
export type RampAdapterSettlementVerifier = (input: {
  user: RampAdapterUserContext;
  terms: RampAdapterTerms;
  providerOrderRef: string;
  observation: RampAdapterObservation;
}) => Promise<RampAdapterFiatEvidence | null>;

/**
 * Version 2. Where a provider order's expiry comes from and what Pollar does
 * when it lapses: before funds move it requotes, rebuilds or cancels; after
 * funds move it holds them where they are or retries.
 */
export type RampAdapterValidity = {
  source: 'provider_quote' | 'provider_order' | 'signature' | 'operational_timeout' | 'none';
  beforeFundsMove: 'requote' | 'rebuild' | 'cancel';
  afterFundsMove: 'hold' | 'retry' | 'not_applicable';
  description: string;
};

/**
 * Implement on the Pollar server with an injected authenticated provider client.
 * Install its registration in the backend; applications consume the existing HTTP API.
 * Pollar owns persistence, authorization, operation dispatch and verified settlement.
 */
export interface RampAdapter {
  readonly adapterId: string;
  readonly protocol?: 'SEP-24' | 'REST';
  /** Version 2. Declared once per adapter; Pollar records every expiry against it. */
  readonly validity?: RampAdapterValidity;
  /** Server-trusted authenticated receipt reader. A status report alone is not a receipt. */
  verifySettlement?: RampAdapterSettlementVerifier;
  capabilities(user: RampAdapterUserContext): Promise<RampAdapterCapabilities>;
  quote(input: RampAdapterQuoteRequest): Promise<RampAdapterOffer>;
  create(input: RampAdapterCreateRequest): Promise<RampAdapterSubmission>;
  status(input: { providerOrderRef: string; user: RampAdapterUserContext }): Promise<RampAdapterObservation>;
  reconcile(input: { operation: RampAdapterOperation; user: RampAdapterUserContext }): Promise<RampAdapterObservation | null>;
  prepare?(input: {
    user: RampAdapterUserContext;
    route: RampAdapterRoute;
    offer: RampAdapterOffer;
  }): Promise<RampAdapterAction | null>;
  validateAction?(input: {
    action: RampAdapterAction;
    user: RampAdapterUserContext;
    route: RampAdapterRoute;
    offer: RampAdapterOffer;
    signedPayload?: string;
  }): Promise<void>;
  mapInputs?(input: Record<string, unknown>): Record<string, string>;
  quotePolicy?(input: { route: RampAdapterRoute; saved: RampAdapterOffer; refreshed: RampAdapterOffer }): boolean;
  continue?(input: RampAdapterContinuation): Promise<RampAdapterSubmission>;
  verifyAndNormalizeCallback?(input: {
    rawBody: Uint8Array;
    headers: Record<string, string>;
    user: RampAdapterUserContext;
  }): Promise<RampAdapterObservation>;
  refund?(input: RampAdapterRefundRequest): Promise<RampAdapterSubmission>;
  notify?(input: { providerOrderRef: string; user: RampAdapterUserContext; hash: string; endpoint: string }): Promise<void>;
}

/** Preserves class/prototype methods and injected dependencies; performs no I/O. */
export function defineRampAdapter<T extends RampAdapter>(adapter: T): T {
  if (typeof adapter.adapterId !== 'string' || !adapter.adapterId.trim() || adapter.adapterId !== adapter.adapterId.trim())
    throw new RampAdapterError('INVALID_INPUT', 'correct_input');
  for (const method of ['capabilities', 'quote', 'create', 'status', 'reconcile'] as const)
    if (typeof adapter[method] !== 'function') throw new RampAdapterError('INVALID_INPUT', 'correct_input');
  return adapter;
}

/** Server scope resolved by Pollar, never taken from a frontend registration request. */
export type RampAdapterProviderScope = { applicationId: string; providerId: string; network: 'mainnet' | 'testnet' };
/**
 * Version 2. Records every exchange with the provider; Pollar injects it and
 * stores each call as an attempt of the leg. `request` and `response` are what
 * the operator sees, redacted; anything personal goes in `sensitive`, which is
 * encrypted at rest.
 */
export type RampAdapterAttemptRecorder = {
  record(input: {
    step: string;
    request: unknown;
    response?: unknown;
    sensitive?: unknown;
    httpStatus?: number;
    latencyMs?: number;
    errorCode?: string;
  }): Promise<void>;
};
export type RampAdapterDependencies<Client = unknown> = {
  /**
   * The account the provider is configured under: which application or
   * provider owns the credentials, which anchor. Saved with every transaction
   * and compared on each later call, so it must not change when credentials
   * rotate or a corridor list is synced.
   */
  configurationId: string;
  /**
   * Version 2. What rotates under the same `configurationId` (a credential
   * hash, a corridor snapshot). Informative: Pollar logs it next to the
   * identity and never rejects a transaction over it.
   */
  configurationRevision?: string;
  client: Client;
  timeoutMs: number;
  clock: () => Date;
  logger: { warn(message: string, fields: { code: string }): void };
  /** Version 2. Absent on a host that still speaks version 1. */
  recorder?: RampAdapterAttemptRecorder;
};
export type RampAdapterRegistration<Client = unknown> = {
  defaultChain: RampAdapterChain;
  /** The contract revision the adapter was written for; 1 when absent. */
  contractVersion?: RampAdapterContractVersion;
  resolveConfiguration(scope: RampAdapterProviderScope): Promise<RampAdapterDependencies<Client>>;
  factory(dependencies: RampAdapterDependencies<Client>): RampAdapter;
};
export type RampAdapterPlugin<Client = unknown> = RampAdapterRegistration<Client> & {
  readonly adapterId: string;
  readonly contractVersion: RampAdapterContractVersion;
};
/** Installed during backend startup. This does not upload code or credentials from a browser. */
export function defineRampAdapterRegistration<Client>(
  adapterId: string,
  registration: RampAdapterRegistration<Client>,
): RampAdapterPlugin<Client> {
  if (
    !adapterId?.trim() ||
    adapterId !== adapterId.trim() ||
    !['STELLAR', 'POLYGON', 'SOLANA'].includes(registration.defaultChain) ||
    typeof registration.resolveConfiguration !== 'function' ||
    typeof registration.factory !== 'function' ||
    (registration.contractVersion !== undefined && ![1, 2].includes(registration.contractVersion))
  )
    throw new RampAdapterError('INVALID_INPUT', 'operator');
  return { ...registration, adapterId, contractVersion: registration.contractVersion ?? 1 };
}
