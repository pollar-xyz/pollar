import { assertRampChain } from './chains';
import type {
  RampChain,
  RampFailure,
  RampField,
  RampFiat,
  RampOrder,
  RampOrderLeg,
  RampPendingAction,
  RampQuote,
  RampRoute,
  RampScannable,
  RampSignatureAction,
} from '../types';

/**
 * The integration must validate the payload, required account and network before
 * signing. Reject invalid requests or cancellation; return the signed payload
 * without broadcasting. Core treats the chain's payload encoding as opaque.
 */
export type RampSigningHandler = (action: RampSignatureAction) => Promise<string>;
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

export function safeRampUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** The countries the routes reach, each with the fiat currencies and rails offered there. */
export function rampCountries(routes: RampRoute[]): Array<{ country: string; fiats: RampFiat[] }> {
  const byCountry = new Map<string, RampFiat[]>();
  for (const { fiat } of routes) {
    const fiats = byCountry.get(fiat.country) ?? [];
    if (!fiats.some((known) => known.currency === fiat.currency && known.rail === fiat.rail)) fiats.push(fiat);
    byCountry.set(fiat.country, fiats);
  }
  return [...byCountry].map(([country, fiats]) => ({ country, fiats }));
}

/** Every field the quote asks the user for, across its legs, once per key. */
export function rampQuoteFields(quote: RampQuote): RampField[] {
  const fields = new Map<string, RampField>();
  for (const leg of quote.legs)
    for (const field of leg.requiredFields) if (!fields.has(field.key)) fields.set(field.key, field);
  return [...fields.values()];
}

const CHAIN_NAME: Record<string, string> = { STELLAR: 'Stellar', POLYGON: 'Polygon', SOLANA: 'Solana' };
const nodeName = (node: RampOrderLeg['to']) =>
  node.kind === 'fiat' ? node.currency : `${node.code} on ${CHAIN_NAME[node.chain] ?? node.chain}`;

/** What a leg does, in the user's terms: "Pay in BOB", "Convert USDT to USDC", "Send USDC to Stellar". */
export function rampLegTitle(leg: Pick<RampOrderLeg, 'kind' | 'from' | 'to'>): string {
  if (leg.kind === 'PROVIDER_ONRAMP') return `Buy ${nodeName(leg.to)}`;
  if (leg.kind === 'PROVIDER_OFFRAMP') return `Receive ${nodeName(leg.to)}`;
  if (leg.kind === 'SWAP' && leg.from.kind === 'asset' && leg.to.kind === 'asset')
    return `Convert ${leg.from.code} to ${leg.to.code}`;
  return `Send to ${leg.to.kind === 'asset' ? (CHAIN_NAME[leg.to.chain] ?? leg.to.chain) : nodeName(leg.to)}`;
}

/** The step a leg is on, as a short status for a progress list. */
export function rampLegStatus(leg: Pick<RampOrderLeg, 'status' | 'failure'>): 'pending' | 'active' | 'done' | 'failed' {
  if (leg.status === 'COMPLETED') return 'done';
  if (leg.failure || ['HELD', 'FAILED', 'CANCELLED'].includes(leg.status)) return 'failed';
  return leg.status === 'PENDING' ? 'pending' : 'active';
}

/** What the user is asked to do about a failure, by its `resolutionAction`. */
const RESOLUTION: Record<string, string> = {
  accept_new_quote: 'The price changed. Get a new quote to continue.',
  add_funds: 'The wallet does not hold enough. Add funds and try again.',
  approve_again: 'The approval expired. Approve the step again.',
  automatic_retry: 'Retrying on its own. You do not need to do anything.',
  change_amount: 'This amount is outside what the route accepts. Try another amount.',
  complete_verification: 'Complete the identity verification to continue.',
  correct_input: 'Some details were not accepted. Check them and start again.',
  link_wallet: 'This route needs a wallet on another network.',
  sign_again: 'The signature expired. Sign the step again.',
  start_again: 'This transfer could not go through. Start a new one; nothing was charged.',
  wait_reconciliation: 'We are confirming where the funds are. You do not need to start again.',
  pollar_follows_up: 'We are looking into it. Your funds are safe; contact support with the order id if you need help.',
  contact_pollar: 'Something went wrong on our side. Contact support with the order id.',
};

/** The text for a failure's `resolutionAction`; anything unknown asks the user to contact support. */
export function rampResolutionText(failure: Pick<RampFailure, 'resolutionAction'>): string {
  return RESOLUTION[failure.resolutionAction] ?? RESOLUTION.contact_pollar!;
}

/** The action as a screen shows it; platforms supply the controls, links and QR rendering. */
export function describeRampAction(order: Pick<RampOrder, 'pendingAction' | 'state'>): {
  action: RampPendingAction | null;
  title: string;
  canSign: boolean;
  canApprove: boolean;
  scannable: RampScannable | null;
  details: Array<{ label: string; value: string }>;
  link: string | null;
} {
  const action = order.pendingAction;
  const base = { action, title: 'Processing', canSign: false, canApprove: false, scannable: null, details: [], link: null };
  if (order.state === 'completed') return { ...base, title: 'Transfer completed' };
  if (!action) return base;
  switch (action.kind) {
    case 'FIAT_PAYMENT': {
      const instructions = action.instructions;
      const title = `Pay ${instructions.amount} ${instructions.currency}`;
      if (instructions.kind === 'qr') return { ...base, title, scannable: instructions.scannable ?? null };
      return {
        ...base,
        title,
        details: [
          ...instructions.details,
          ...(instructions.reference ? [{ label: 'Reference', value: instructions.reference }] : []),
        ],
      };
    }
    case 'SIGNATURE':
      return { ...base, title: 'Authorize your transfer', canSign: Date.parse(action.expiresAt) > Date.now() };
    case 'COSIGN_APPROVAL':
      return { ...base, title: 'Approve on your device', canApprove: true };
    case 'KYC':
      return {
        ...base,
        title: 'Complete verification',
        link: action.url ? safeRampUrl(action.url) : null,
      };
    default:
      return base;
  }
}
