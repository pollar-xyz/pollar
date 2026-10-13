import { assertRampChain } from './chains';
import type { RampChain, RampAction, RampRoute, RampCountry, RampsTransactionResponse, RampQuote } from '../types';
export type RampSigningAction = Extract<RampAction, { kind: 'sign_transaction' }>;
export type RampSigningHandler = (action: RampSigningAction) => Promise<string>;
export class RampSigningRegistry {
  private readonly handlers = new Map<string, RampSigningHandler>();
  register(chain: RampChain, encoding: string, handler: RampSigningHandler) {
    assertRampChain(chain);
    const key = JSON.stringify([chain, encoding]);
    if (this.handlers.has(key)) throw new Error('Ramp signing handler already registered');
    this.handlers.set(key, handler);
    return () => {
      if (this.handlers.get(key) === handler) this.handlers.delete(key);
    };
  }
  resolve(chain: RampChain, encoding: string) {
    assertRampChain(chain);
    return this.handlers.get(JSON.stringify([chain, encoding]));
  }
}
export type RampSnapshot = Pick<
  RampsTransactionResponse,
  'txId' | 'status' | 'nextAction' | 'transactionVersion' | 'reconciliationRequired' | 'lifecycleState' | 'terms' | 'milestones'
>;
/** Responses from another transaction or an older revision cannot replace progress. */
export function mergeRampSnapshot<T extends RampSnapshot>(previous: T | null | undefined, incoming: T): T {
  if (previous && (previous.txId !== incoming.txId || (previous.transactionVersion ?? 0) > (incoming.transactionVersion ?? 0)))
    return previous;
  return incoming;
}
export function safeRampUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
/** Capabilities also supply countries for providers outside the legacy catalog. */
export function mergeRampCountries(legacy: RampCountry[], routes: RampRoute[]): RampCountry[] {
  const countries = new Map(legacy.map((country) => [country.code, country]));
  for (const route of routes)
    if (!countries.has(route.country)) countries.set(route.country, { code: route.country, currency: route.fiatCurrency });
  return [...countries.values()];
}
/** Shared interpretation; platforms supply controls, links and QR rendering. */
export function describeRampAction(snapshot: RampSnapshot) {
  const action = snapshot.nextAction;
  const blocked =
    snapshot.reconciliationRequired === true ||
    ['completed', 'failed', 'refunded'].includes(snapshot.lifecycleState ?? snapshot.status);
  const base = {
    action,
    canContinue: false,
    canSign: false,
    title: 'Waiting for the next step',
    details: [] as Array<{ label: string; value: string }>,
    links: [] as Array<{ label: string; url: string }>,
    qr: null as string | null,
    qrImage: null as string | null,
  };
  if (snapshot.reconciliationRequired)
    return { ...base, title: 'We are checking your transfer. You do not need to start again.' };
  if (snapshot.lifecycleState === 'completed' || snapshot.status === 'completed')
    return { ...base, title: 'Transfer completed' };
  if (!action) return base;
  if ('expiresAt' in action && action.expiresAt !== null && !(Date.parse(action.expiresAt) > Date.now()))
    return { ...base, title: 'These instructions have expired. Refresh the transfer status.' };
  switch (action.kind) {
    case 'verification':
      return {
        ...base,
        title: 'Complete verification',
        canContinue: !blocked,
        details: action.steps.map((step) => ({ label: step.purpose, value: step.instructions + ' (' + step.status + ')' })),
        links: action.steps
          .filter(
            (step, index) =>
              step.status === 'required' &&
              step.url &&
              (action.order === 'parallel' ||
                action.steps.slice(0, index).every((previous) => previous.status === 'completed')),
          )
          .flatMap((step) => {
            const url = safeRampUrl(step.url!);
            return url ? [{ label: step.purpose === 'terms' ? 'Review terms' : 'Open verification', url }] : [];
          }),
      };
    case 'sign_transaction':
      return {
        ...base,
        title:
          action.purpose === 'authentication'
            ? 'Authorize verification'
            : action.purpose === 'onramp_claim'
              ? 'Authorize receipt of your assets'
              : 'Authorize your transfer',
        canSign: !blocked && Date.parse(action.expiresAt) > Date.now(),
      };
    case 'user_ready':
      return { ...base, title: 'Ready to continue', canContinue: !blocked };
    case 'hosted_redirect': {
      const url = safeRampUrl(action.url);
      return {
        ...base,
        title: action.purpose === 'payment' ? 'Open payment instructions' : 'Open verification',
        links: url ? [{ label: 'Open', url }] : [],
      };
    }
    case 'qr_payment':
      return {
        ...base,
        title: `Pay ${action.amount} ${action.currency}`,
        qr: action.encoding === 'png_base64' ? null : action.payload,
        qrImage: action.encoding === 'png_base64' ? safeRampPng(action.payload) : null,
        links:
          action.paymentUrl && safeRampUrl(action.paymentUrl)
            ? [{ label: 'Open payment', url: safeRampUrl(action.paymentUrl)! }]
            : [],
        details: action.encoding === 'png_base64' ? [] : [{ label: 'Payment code', value: action.payload }],
      };
    case 'bank_transfer':
      return {
        ...base,
        title: `Pay ${action.amount} ${action.currency}`,
        details: [...action.details, ...(action.reference ? [{ label: 'Reference', value: action.reference }] : [])],
      };
    case 'chain_transfer':
      return {
        ...base,
        title: `Transfer ${action.amount} ${action.asset.code}`,
        details: [
          { label: 'Chain', value: action.chain },
          { label: 'Destination', value: action.destination },
          ...(action.memo ? [{ label: action.memo.type, value: action.memo.value }] : []),
        ],
      };
    case 'collect_information':
      return { ...base, title: 'Provide the required information', canContinue: !blocked };
    case 'wait':
      return {
        ...base,
        title: {
          verification_pending: 'Verification is under review',
          provider_processing: 'Transfer is processing',
          settlement_verification: 'Confirming settlement',
          reconciliation: 'Checking your transfer',
        }[action.reason],
      };
    default:
      return { ...base, title: `This action is unsupported. Reference: ${snapshot.txId}` };
  }
}

/** PNG only: SVG/HTML data URLs must never enter payment instruction rendering. */
export function safeRampPng(value: string): string | null {
  const raw = value.replace(/^data:image\/png;base64,/, '');
  return raw.length <= 2_800_000 && /^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(raw) && raw.length % 4 === 0
    ? 'data:image/png;base64,' + raw
    : null;
}
/** A replacement is only selected for review; this helper never sends a write. */
export function rampReplacementQuote(error: unknown): RampQuote | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { code?: string; body?: { details?: unknown; replacementQuote?: unknown } };
  if (
    e.code !== 'SDK_RAMPS_QUOTE_CHANGED' &&
    !(e.code === 'SDK_RAMPS_QUOTE_EXPIRED' && String(e.body?.details).startsWith('QUOTE_CHANGED'))
  )
    return null;
  const q = e.body?.replacementQuote as RampQuote | undefined;
  return q &&
    typeof q.quoteId === 'string' &&
    q.terms &&
    typeof q.terms.fiatAmount === 'string' &&
    typeof q.terms.cryptoAmount === 'string' &&
    q.route &&
    Date.parse(q.expiresAt) > Date.now()
    ? q
    : null;
}
