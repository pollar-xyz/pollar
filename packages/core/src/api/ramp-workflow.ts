/** Additive adapter workflow endpoints, alongside the published legacy schema. */
export type RampWorkflowAction = { actionId: string } & (
  | { kind: 'user_ready'; purpose: 'create_order' | 'withdrawal_payment' | 'onramp_claim' }
  | {
      kind: 'sign_transaction';
      purpose: 'authentication' | 'withdrawal_payment' | 'onramp_claim';
      payload: { encoding: string; value: string };
      expiresAt: string;
    }
  | { kind: 'hosted_redirect'; purpose: 'verification' | 'payment'; url: string; expiresAt: string | null }
  | { kind: 'wait'; reason: string }
  | { kind: 'verification'; steps: Array<{ instructions: string; url: string | null }>; order: string }
  | { kind: 'collect_information'; fields: Array<{ key: string; label: string }> }
  | { kind: 'bank_transfer' | 'qr_payment' | 'chain_transfer' }
);
export type RampWorkflowTerms = {
  fiatCurrency: string;
  fiatAmount: string;
  cryptoAmount: string;
  feeAmount: string;
  feeCurrency: string;
  assetCode: string;
  assetChain: string;
  assetIssuer: string | null;
};
export type RampWorkflowView = {
  txId: string;
  status: string;
  direction: string;
  lifecycleState: string;
  transactionVersion: number;
  reconciliationRequired: boolean;
  nextAction: RampWorkflowAction | null;
  terms: RampWorkflowTerms;
  stellarTxHash?: string;
  milestones: Array<{ kind: string; verifiedAt: string }>;
};
export type RampWorkflowRoutes = {
  routes: Array<{
    routeId: string;
    providerId: string;
    provider: string;
    direction: 'onramp' | 'offramp';
    country: string;
    fiatCurrency: string;
    asset: { code: string; identifier: string | null; chain: string; network: string };
    limits: { denomination: string; min: string | null; max: string | null };
  }>;
};
export type RampContinuation = {
  actionId: string;
  transactionVersion: number;
  signedPayload?: string;
  fields?: Record<string, string>;
};
type Response<T> = {
  200: { content: { 'application/json': { success: boolean; code: string; content: T } } };
  400: { content: { 'application/json': { code: string; details?: string } } };
};
export interface RampWorkflowPaths {
  '/ramps/routes': { get: { responses: Response<RampWorkflowRoutes> } };
  '/ramps/transaction/{txId}/continue': {
    post: {
      parameters: { path: { txId: string } };
      requestBody: { content: { 'application/json': RampContinuation } };
      responses: Response<RampWorkflowView>;
    };
  };
}
