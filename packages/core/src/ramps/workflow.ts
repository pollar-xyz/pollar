import { assertRampChain } from './chains';
import type {
  RampChain,
  RampFailure,
  RampField,
  RampFiat,
  RampOrder,
  RampOrderLeg,
  RampOrderLegStep,
  RampPendingAction,
  RampQuote,
  RampQuoteRejection,
  RampQuoteRequirement,
  RampRoute,
  RampScannable,
  RampSignatureAction,
  RampWalletSetupChain,
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

const RAIL_LABEL: Record<'en' | 'es', Record<string, string>> = {
  en: { BANK_TRANSFER: 'Bank transfer', CASH: 'Cash', CARD: 'Card', HOSTED: 'Chosen at the provider' },
  es: { BANK_TRANSFER: 'Transferencia bancaria', CASH: 'Efectivo', CARD: 'Tarjeta', HOSTED: 'Se elige en el proveedor' },
};

/**
 * A rail as the user reads it. Named schemes (SPEI, PIX, PSE, ACH, BREB, QR) keep
 * their name, and a rail this version does not know shows as it came, so a newer
 * backend never breaks the screen. `HOSTED` names the provider when one is given.
 */
export function rampRailLabel(
  rail: RampFiat['rail'] | (string & {}),
  options: { language?: 'en' | 'es'; provider?: string } = {},
): string {
  const language = options.language === 'es' ? 'es' : 'en';
  if (rail === 'HOSTED' && options.provider)
    return language === 'es' ? `Se elige en ${options.provider}` : `Chosen at ${options.provider}`;
  return RAIL_LABEL[language][rail] ?? rail;
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

/**
 * A line under a leg's title when the provider paid out an accepted substitute
 * (Stereum's USDT for USDC): the swap after it converts the funds, and the user
 * should not read the other asset as a loss. Null when the leg delivered what it planned.
 */
export function rampLegNote(leg: Pick<RampOrderLeg, 'kind' | 'to' | 'fundsLocation'>): string | null {
  if (leg.kind !== 'PROVIDER_ONRAMP' || leg.to.kind !== 'asset' || !leg.fundsLocation) return null;
  const delivered = leg.fundsLocation.asset;
  if (delivered.toUpperCase() === leg.to.code.toUpperCase()) return null;
  return `The provider sent ${delivered} instead of ${leg.to.code}. It is converted to ${leg.to.code} in the next step, so nothing is lost.`;
}

const chainName = (chain: string) => CHAIN_NAME[chain] ?? chain;

/** A chain step of a swap or bridge leg, in the user's terms: "Approve USDT", "Circle confirms the transfer". */
export function rampStepTitle(step: Pick<RampOrderLegStep, 'kind'>, leg: Pick<RampOrderLeg, 'from' | 'to'>): string {
  const from = leg.from.kind === 'asset' ? leg.from : null;
  const to = leg.to.kind === 'asset' ? leg.to : null;
  switch (step.kind) {
    case 'approve':
      return `Allow ${from?.code ?? 'the asset'} to be moved`;
    case 'swap':
      return `Swap ${from?.code ?? ''} to ${to?.code ?? ''}`.replace(/\s+/g, ' ').trim();
    case 'burn':
      return `Send from ${from ? chainName(from.chain) : 'your wallet'}`;
    case 'attestation':
      return 'Circle confirms the transfer';
    case 'mint':
      return `Arrives on ${to ? chainName(to.chain) : 'the destination'}`;
  }
}

/** What a step is doing now, for the line beside its title. */
export function rampStepStatusText(step: Pick<RampOrderLegStep, 'status' | 'signs'>): string {
  switch (step.status) {
    case 'done':
      return 'Done';
    case 'awaiting_approval':
      return 'Waiting for your approval';
    case 'confirming':
      return step.signs ? 'Confirming on chain' : 'In progress';
    default:
      return step.signs ? 'You approve this next' : 'Waiting';
  }
}

const SIGNING_MODES = new Set(['COSIGNED', 'SELF_CUSTODY', 'EXTERNAL', 'APP_CUSTODY']);

/**
 * The next approval the order will ask for after the one it waits on now, as
 * a title, or null when none is left. A swap or bridge that has not planned
 * its steps yet counts once, by what it does. Every transaction is still
 * approved on its own: this only tells the user one more is coming.
 */
export function rampNextApproval(order: Pick<RampOrder, 'legs'>): string | null {
  for (const leg of order.legs) {
    if (leg.status === 'COMPLETED' || ['HELD', 'FAILED', 'CANCELLED'].includes(leg.status)) continue;
    // An sdk-api that predates chain steps answers legs without `steps`.
    if (leg.steps?.length) {
      const next = leg.steps.find((step) => step.signs && step.status === 'pending');
      if (next) return rampStepTitle(next, leg);
      continue;
    }
    if (leg.kind === 'PROVIDER_ONRAMP' || leg.kind === 'PROVIDER_OFFRAMP') continue;
    if (leg.signingMode && SIGNING_MODES.has(leg.signingMode)) return rampLegTitle(leg);
  }
  return null;
}

/**
 * Seconds the running leg should still take by its quote, or null without an
 * estimate; 0 once it is late (the caller says it takes longer than usual).
 */
export function rampLegTimeLeft(leg: Pick<RampOrderLeg, 'etaSeconds' | 'startedAt'>, now = Date.now()): number | null {
  if (leg.etaSeconds === null || !leg.startedAt) return null;
  const elapsed = (now - Date.parse(leg.startedAt)) / 1000;
  return Math.max(0, Math.ceil(leg.etaSeconds - elapsed));
}

// So an invalid address never round-trips to the provider, which rejects it with a generic VALIDATION_ERROR.
// One "@", a local part, and a dot inside the domain; read by index, since a
// backtracking pattern over user input is quadratic on a long one.
function isEmail(value: string): boolean {
  if (/\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@')) return false;
  return value.slice(at + 2, -1).includes('.');
}

/**
 * A field a quote asks for is complete when it is filled and, for an email,
 * well-formed. An optional field may stay blank, but what is typed must be well-formed.
 */
export function rampFieldValid(field: Pick<RampField, 'type' | 'optional' | 'pattern'>, raw: string | undefined): boolean {
  const value = (raw ?? '').trim();
  if (!value) return field.optional === true;
  if (field.type === 'email' && !isEmail(value)) return false;
  return matchesWhole(field.pattern, value);
}

/** What is wrong with a filled-in value, or null while it is blank or valid (`rampFieldValid` says when it is complete). */
export function rampFieldError(
  field: Pick<RampField, 'type' | 'label' | 'hint' | 'pattern'>,
  raw: string | undefined,
): string | null {
  const value = (raw ?? '').trim();
  if (!value || rampFieldValid({ ...field, optional: true }, value)) return null;
  if (field.type === 'email') return 'Enter a valid email address.';
  return field.hint ? `Check the ${field.label.toLowerCase()}: ${field.hint}` : `Check the ${field.label.toLowerCase()}.`;
}

/** Whether `value` matches the field's `pattern` whole; a pattern this runtime cannot read checks nothing. */
function matchesWhole(pattern: string | undefined, value: string): boolean {
  if (!pattern) return true;
  try {
    return new RegExp(`^(?:${pattern})$`).test(value);
  } catch {
    return true;
  }
}

/**
 * The step a leg is on, as a short status for a progress list. A leg that is
 * retrying on its own carries its last failure but is still running: only a
 * leg that stopped (held, failed, cancelled) is failed.
 */
export function rampLegStatus(leg: Pick<RampOrderLeg, 'status' | 'failure'>): 'pending' | 'active' | 'done' | 'failed' {
  if (leg.status === 'COMPLETED') return 'done';
  if (['HELD', 'FAILED', 'CANCELLED'].includes(leg.status)) return 'failed';
  return leg.status === 'PENDING' ? 'pending' : 'active';
}

/**
 * What the user ends with: the last leg's output, as received or else as planned.
 * `estimated` is true while only the planned amount is known.
 */
export function rampOrderReceive(order: Pick<RampOrder, 'legs'>): { amount: string; unit: string; estimated: boolean } | null {
  const last = order.legs[order.legs.length - 1];
  if (!last) return null;
  const estimated = !last.amountOutActual;
  const amount = last.amountOutActual ?? last.amountOutPlanned;
  const unit = last.to.kind === 'fiat' ? last.to.currency : last.to.code;
  return amount ? { amount, unit, estimated } : null;
}

/** The order no longer moves on its own: final, or held until someone resolves it (no next read suggested). */
export function rampOrderStopped(order: Pick<RampOrder, 'state' | 'nextPollAfter'>): boolean {
  return ['completed', 'failed', 'refunded'].includes(order.state) || order.nextPollAfter === null;
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
  create_wallet: 'You need a wallet to receive this. Create one to continue.',
  set_up_wallet: 'This route runs through another network. Set up your wallet there to continue.',
  migrate_custody: "Your wallet is still held by Pollar alone. Move it to your app's secure wallet to continue.",
  set_up_recovery: 'Your wallet needs a way to be recovered before it can sign. Add one, then try again.',
  add_trustline: 'Your Stellar wallet must trust USDC to receive it. Add the USDC trustline and try again.',
  sign_again: 'The signature expired. Sign the step again.',
  start_again: 'This transfer could not go through. Start a new one; nothing was charged.',
  // The app's gas wallet is short, which the user cannot fix: no support call, no order id (none exists yet).
  fund_gas_wallet: 'This route is not available right now. Try again later or choose another route.',
  // The app does not allow the wallet's signing mode for ramps: again nothing the user can do.
  enable_signing_mode: 'This route is not available for your wallet in this app. Choose another route.',
  wait_reconciliation: 'We are confirming where the funds are. You do not need to start again.',
  pollar_follows_up: 'We are looking into it. Your funds are safe; contact support with the order id if you need help.',
  contact_pollar: 'Something went wrong on our side. Contact support with the order id.',
};

/** The text for a failure's `resolutionAction`; anything unknown asks the user to contact support. */
export function rampResolutionText(failure: Pick<RampFailure, 'resolutionAction'>): string {
  return RESOLUTION[failure.resolutionAction] ?? RESOLUTION.contact_pollar!;
}

/** A wallet step a dropped route asks for, and the button that runs it (`PollarClient.runRampWalletStep`). */
export interface RampWalletStep {
  action: 'create_wallet' | 'set_up_wallet' | 'migrate_custody' | 'set_up_recovery';
  /** The chain to set the wallet up on, for `set_up_wallet`. */
  chain: RampWalletSetupChain | null;
  label: string;
  busyLabel: string;
}

/** The wallet step a dropped route asks the user for; null when it drops for another reason. */
export function rampWalletStep(rejection: Pick<RampQuoteRejection, 'failure'>): RampWalletStep | null {
  const { resolutionAction, detail } = rejection.failure;
  if (resolutionAction === 'create_wallet')
    return { action: resolutionAction, chain: null, label: 'Create wallet', busyLabel: 'Creating…' };
  if (resolutionAction === 'set_up_wallet' && (detail === 'POLYGON' || detail === 'SOLANA'))
    return { action: resolutionAction, chain: detail, label: 'Set up wallet', busyLabel: 'Setting up…' };
  if (resolutionAction === 'migrate_custody')
    return { action: resolutionAction, chain: null, label: 'Move wallet', busyLabel: 'Moving…' };
  if (resolutionAction === 'set_up_recovery')
    return { action: resolutionAction, chain: null, label: 'Set up recovery', busyLabel: 'Opening…' };
  return null;
}

/** What a held order asks instead, where it differs: its funds moved and wait where they are. */
const HELD_RESOLUTION: Record<string, string> = {
  start_again:
    'The provider order expired before the payment reached it. Your funds are safe in your wallet: try again to place a new order at the current price.',
};

/** The text for an order's failure, told apart when the order is held with its funds already moved. */
export function rampOrderResolutionText(order: Pick<RampOrder, 'failure' | 'legs'>): string | null {
  if (!order.failure) return null;
  const held = order.legs.some((leg) => leg.status === 'HELD');
  return (held ? HELD_RESOLUTION[order.failure.resolutionAction] : undefined) ?? rampResolutionText(order.failure);
}

/**
 * What a route held back by a verification step says, and the button that opens
 * the step. A step under review or refused has nothing the user can do from the
 * widget, so it offers no button.
 */
export function rampRequirementCopy(requirement: Pick<RampQuoteRequirement, 'type' | 'status' | 'reviewReason'>): {
  message: string;
  action: string | null;
} {
  if (requirement.type === 'FORM') return { message: 'Answer a few questions to see this route', action: 'Continue' };
  if (requirement.type === 'PROVIDER_REGISTRATION')
    return { message: 'Register with the provider to see this route', action: 'Continue' };
  if (requirement.type === 'REGISTRY_CHECK')
    return requirement.status === 'pending'
      ? { message: 'Your details are under review', action: null }
      : { message: 'Confirm your details to see this route', action: 'Confirm' };
  switch (requirement.status) {
    case 'expired':
      return { message: 'Your verification expired', action: 'Verify again' };
    case 'pending':
      if (!requirement.reviewReason) return { message: 'Verification in progress', action: 'Continue' };
      return {
        message:
          requirement.reviewReason === 'DUPLICATE_DOCUMENT'
            ? 'This document is already linked to another account, so our team is reviewing it.'
            : 'Your verification is under review',
        action: null,
      };
    case 'rejected':
      return { message: 'Verification was not approved', action: null };
    default:
      return { message: 'Verify your identity to see this route', action: 'Verify' };
  }
}

/**
 * The Stellar asset a route dropped for a missing trustline delivers, to trust
 * with `setTrustline`; null for any other rejection.
 */
export function rampTrustlineAsset(rejection: Pick<RampQuoteRejection, 'legs' | 'failure'>): {
  code: string;
  issuer: string;
} | null {
  if (rejection.failure.resolutionAction !== 'add_trustline') return null;
  const leg = rejection.legs.find((l) => l.index === rejection.failure.legIndex) ?? rejection.legs[rejection.legs.length - 1];
  const to = leg?.to;
  if (to?.kind !== 'asset' || to.chain !== 'STELLAR' || !to.identifier) return null;
  return { code: to.code, issuer: to.identifier };
}

/** What a refused `setTrustline` tells the user, by the API's code; never the raw detail, which can carry an address. */
export function rampTrustlineErrorText(outcome: { code?: string }, assetCode: string): string {
  if (outcome.code === 'TX_LOW_RESERVE')
    return `Your wallet needs about 0.5 XLM to add the ${assetCode} trustline. Add XLM, then try again.`;
  if (outcome.code === 'TX_EXTERNAL_WALLET_SERVER_SIGN')
    return `Your wallet adds the ${assetCode} trustline itself. Add it from your wallet, then find the route again.`;
  if (outcome.code?.startsWith('SDK_COSIGN_')) return `The ${assetCode} trustline was not approved. Try again.`;
  return `Could not add the ${assetCode} trustline. Please try again.`;
}

/**
 * Why no route was offered: the fix every rejected route shares, else a change of
 * amount. When every route waits on a verification the user cannot act on (under
 * review or refused), it says so instead of asking them to verify.
 */
export function rampNoRouteText(
  rejected: Array<Pick<RampQuoteRejection, 'failure'> & Partial<Pick<RampQuoteRejection, 'requirement'>>>,
): string {
  const requirements = rejected.map((r) => r.requirement);
  if (requirements.length && requirements.every((req) => req && rampRequirementCopy(req).action === null)) {
    return requirements.every((req) => req!.status === 'rejected')
      ? 'Your identity verification was not approved, so no route is available.'
      : 'Your verification is under review. You do not need to do anything; refresh later to check again.';
  }
  const actions = [...new Set(rejected.map((r) => r.failure.resolutionAction))];
  return actions.length === 1
    ? rampResolutionText({ resolutionAction: actions[0]! })
    : 'No route can take this amount right now. Try another amount.';
}

/** What the provider says to do for the verification steps still on the user, joined; null when none says. */
function kycNote(steps: unknown): string | null {
  if (!Array.isArray(steps)) return null;
  const said = steps
    .filter((step): step is { status?: unknown; instructions: string } => {
      const s = step as { status?: unknown; instructions?: unknown } | null;
      return !!s && s.status === 'required' && typeof s.instructions === 'string' && s.instructions.trim() !== '';
    })
    .map((step) => step.instructions.trim());
  return said.length ? said.join(' ') : null;
}

/** The action as a screen shows it; platforms supply the controls, links and QR rendering. */
export function describeRampAction(order: Pick<RampOrder, 'pendingAction' | 'state'>): {
  action: RampPendingAction | null;
  title: string;
  canSign: boolean;
  canApprove: boolean;
  scannable: RampScannable | null;
  /** A QR payment that arrived without its code rendered: there is nothing to pay with, and the screen says so. */
  codeMissing: boolean;
  details: Array<{ label: string; value: string }>;
  link: string | null;
  /** What the button that opens `link` says; null when there is no link. */
  linkLabel: string | null;
  /** The provider's own words on what the user does next, for a step with nothing to open. */
  note: string | null;
  /** A payment whose window has closed: its code, details and page are no longer shown. */
  paymentClosed: boolean;
  /** When the payment or signature must be done by; null when it does not lapse. */
  expiresAt: string | null;
} {
  const action = order.pendingAction;
  const expiresAt = action && 'expiresAt' in action && typeof action.expiresAt === 'string' ? action.expiresAt : null;
  const base = {
    action,
    title: 'Processing',
    canSign: false,
    canApprove: false,
    scannable: null,
    codeMissing: false,
    details: [] as Array<{ label: string; value: string }>,
    link: null as string | null,
    linkLabel: null as string | null,
    note: null as string | null,
    paymentClosed: false,
    expiresAt,
  };
  if (order.state === 'completed') return { ...base, title: 'Transfer completed' };
  if (!action) return base;
  switch (action.kind) {
    case 'FIAT_PAYMENT': {
      const instructions = action.instructions;
      const title = `Pay ${instructions.amount} ${instructions.currency}`;
      // Past its window a code or account would take money the order no longer waits for.
      if (expiresAt && Date.parse(expiresAt) <= Date.now()) return { ...base, title, paymentClosed: true };
      if (instructions.kind === 'hosted') {
        const link = safeRampUrl(instructions.url);
        return { ...base, title, link, linkLabel: link ? 'Pay on the provider page' : null, codeMissing: !link };
      }
      const link = instructions.link ? safeRampUrl(instructions.link) : null;
      const page = { link, linkLabel: link ? (instructions.kind === 'qr' ? 'Open payment page' : 'Open status page') : null };
      if (instructions.kind === 'qr')
        return {
          ...base,
          title,
          ...page,
          scannable: instructions.scannable ?? null,
          codeMissing: !instructions.scannable && !link,
        };
      return {
        ...base,
        title,
        ...page,
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
    case 'KYC': {
      const link = action.url ? safeRampUrl(action.url) : null;
      return {
        ...base,
        title: 'Complete verification',
        link,
        linkLabel: link ? 'Complete verification' : null,
        note: link ? null : kycNote(action.steps),
      };
    }
    default:
      return base;
  }
}
