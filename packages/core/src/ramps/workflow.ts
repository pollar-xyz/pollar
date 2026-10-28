import { assertRampChain } from './chains';
import type { PollarLanguage } from '../lib/language';
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
  RampQuoteLimit,
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

const RAIL_LABEL: Record<'en' | 'es' | 'pt', Record<string, string>> = {
  en: { BANK_TRANSFER: 'Bank transfer', CASH: 'Cash', CARD: 'Card', HOSTED: 'Chosen at the provider' },
  es: { BANK_TRANSFER: 'Transferencia bancaria', CASH: 'Efectivo', CARD: 'Tarjeta', HOSTED: 'Se elige en el proveedor' },
  pt: { BANK_TRANSFER: 'Transferência bancária', CASH: 'Dinheiro', CARD: 'Cartão', HOSTED: 'Escolhido no provedor' },
};
const HOSTED_AT = { en: 'Chosen at', es: 'Se elige en', pt: 'Escolhido no' } as const;

/**
 * A rail as the user reads it. Named schemes (SPEI, PIX, PSE, ACH, BREB, QR) keep
 * their name, and a rail this version does not know shows as it came, so a newer
 * backend never breaks the screen. `HOSTED` names the provider when one is given.
 */
export function rampRailLabel(
  rail: RampFiat['rail'] | (string & {}),
  options: { language?: 'en' | 'es' | 'pt'; provider?: string } = {},
): string {
  const language = options.language ?? 'en';
  if (rail === 'HOSTED' && options.provider) return `${HOSTED_AT[language]} ${options.provider}`;
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

const EN = {
  assetOn: (code: string, chain: string) => `${code} on ${chain}`,
  buy: (what: string) => `Buy ${what}`,
  receive: (what: string) => `Receive ${what}`,
  convert: (from: string, to: string) => `Convert ${from} to ${to}`,
  sendTo: (where: string) => `Send to ${where}`,
  substitute: (delivered: string, planned: string) =>
    `The provider sent ${delivered} instead of ${planned}. It is converted to ${planned} in the next step, so nothing is lost.`,
  approveStep: (code: string | undefined) => `Allow ${code ?? 'the asset'} to be moved`,
  swapStep: (from: string, to: string) => `Swap ${from} to ${to}`,
  burnStep: (chain: string | null) => `Send from ${chain ?? 'your wallet'}`,
  attestationStep: 'Circle confirms the transfer',
  mintStep: (chain: string | null) => `Arrives on ${chain ?? 'the destination'}`,
  stepDone: 'Done',
  stepAwaitingApproval: 'Waiting for your approval',
  stepConfirmingOnChain: 'Confirming on chain',
  stepInProgress: 'In progress',
  stepSignsNext: 'You approve this next',
  stepWaiting: 'Waiting',
  invalidEmail: 'Enter a valid email address.',
  checkField: (label: string, hint: string | undefined) => (hint ? `Check the ${label}: ${hint}` : `Check the ${label}.`),
  limitMin: (side: RampQuoteLimit['side'], amount: string) =>
    `This route ${side === 'in' ? 'takes' : 'pays out'} at least ${amount}. Try a larger amount.`,
  limitMax: (side: RampQuoteLimit['side'], amount: string) =>
    `This route ${side === 'in' ? 'takes' : 'pays out'} at most ${amount}. Try a smaller amount.`,
  trustAsset: (code: string) =>
    `Your Stellar wallet must trust ${code} to receive it. Add the ${code} trustline and try again.`,
  walletSteps: {
    create_wallet: ['Create wallet', 'Creating…'],
    set_up_wallet: ['Set up wallet', 'Setting up…'],
    migrate_custody: ['Move wallet', 'Moving…'],
    set_up_recovery: ['Set up recovery', 'Opening…'],
  } as Record<RampWalletStep['action'], [label: string, busyLabel: string]>,
  heldStartAgain:
    'The provider order expired before the payment reached it. Your funds are safe in your wallet: try again to place a new order at the current price.',
  requirementForm: 'Answer a few questions to see this route',
  requirementRegistration: 'Register with the provider to see this route',
  requirementRegistryPending: 'Your details are under review',
  requirementRegistry: 'Confirm your details to see this route',
  requirementExpired: 'Your verification expired',
  requirementInProgress: 'Verification in progress',
  requirementDuplicate: 'This document is already linked to another account, so our team is reviewing it.',
  requirementUnderReview: 'Your verification is under review',
  requirementRejected: 'Verification was not approved',
  requirementVerify: 'Verify your identity to see this route',
  actionContinue: 'Continue',
  actionConfirm: 'Confirm',
  actionVerifyAgain: 'Verify again',
  actionVerify: 'Verify',
  trustlineLowReserve: (code: string) =>
    `Your wallet needs about 0.5 XLM to add the ${code} trustline. Add XLM, then try again.`,
  trustlineExternal: (code: string) =>
    `Your wallet adds the ${code} trustline itself. Add it from your wallet, then find the route again.`,
  trustlineNotApproved: (code: string) => `The ${code} trustline was not approved. Try again.`,
  trustlineFailed: (code: string) => `Could not add the ${code} trustline. Please try again.`,
  noRouteRejected: 'Your identity verification was not approved, so no route is available.',
  noRouteUnderReview: 'Your verification is under review. You do not need to do anything; refresh later to check again.',
  noRouteForPair: 'There is no route for this currency and asset right now. Choose another one.',
  noRouteForAmount: 'No route can take this amount right now. Try another amount.',
  processing: 'Processing',
  completed: 'Transfer completed',
  pay: (amount: string, currency: string) => `Pay ${amount} ${currency}`,
  payOnProvider: 'Pay on the provider page',
  openPaymentPage: 'Open payment page',
  openStatusPage: 'Open status page',
  reference: 'Reference',
  authorize: 'Authorize your transfer',
  approveOnDevice: 'Approve on your device',
  kycTitle: 'Complete verification',
  kycLink: 'Complete verification',
};

const COPY: Record<PollarLanguage, typeof EN> = {
  en: EN,
  es: {
    assetOn: (code, chain) => `${code} en ${chain}`,
    buy: (what) => `Comprar ${what}`,
    receive: (what) => `Recibir ${what}`,
    convert: (from, to) => `Convertir ${from} a ${to}`,
    sendTo: (where) => `Enviar a ${where}`,
    substitute: (delivered, planned) =>
      `El proveedor envió ${delivered} en lugar de ${planned}. Se convierte a ${planned} en el siguiente paso, así que no se pierde nada.`,
    approveStep: (code) => `Permitir mover ${code ?? 'el activo'}`,
    swapStep: (from, to) => `Cambiar ${from} a ${to}`,
    burnStep: (chain) => `Enviar desde ${chain ?? 'tu billetera'}`,
    attestationStep: 'Circle confirma la transferencia',
    mintStep: (chain) => `Llega a ${chain ?? 'el destino'}`,
    stepDone: 'Listo',
    stepAwaitingApproval: 'Esperando tu aprobación',
    stepConfirmingOnChain: 'Confirmando en la red',
    stepInProgress: 'En curso',
    stepSignsNext: 'Apruebas esto a continuación',
    stepWaiting: 'En espera',
    invalidEmail: 'Ingresa un email válido.',
    checkField: (label, hint) => (hint ? `Revisa el campo ${label}: ${hint}` : `Revisa el campo ${label}.`),
    limitMin: (side, amount) => `Esta ruta ${side === 'in' ? 'acepta' : 'paga'} al menos ${amount}. Prueba con un monto mayor.`,
    limitMax: (side, amount) =>
      `Esta ruta ${side === 'in' ? 'acepta' : 'paga'} como máximo ${amount}. Prueba con un monto menor.`,
    trustAsset: (code) =>
      `Tu billetera Stellar debe confiar en ${code} para recibirlo. Agrega la trustline de ${code} e intenta de nuevo.`,
    walletSteps: {
      create_wallet: ['Crear billetera', 'Creando…'],
      set_up_wallet: ['Configurar billetera', 'Configurando…'],
      migrate_custody: ['Mover billetera', 'Moviendo…'],
      set_up_recovery: ['Configurar recuperación', 'Abriendo…'],
    },
    heldStartAgain:
      'La orden del proveedor venció antes de que le llegara el pago. Tus fondos están seguros en tu billetera: intenta de nuevo para crear una orden nueva al precio actual.',
    requirementForm: 'Responde unas preguntas para ver esta ruta',
    requirementRegistration: 'Regístrate con el proveedor para ver esta ruta',
    requirementRegistryPending: 'Tus datos están en revisión',
    requirementRegistry: 'Confirma tus datos para ver esta ruta',
    requirementExpired: 'Tu verificación venció',
    requirementInProgress: 'Verificación en curso',
    requirementDuplicate: 'Este documento ya está vinculado a otra cuenta, así que nuestro equipo lo está revisando.',
    requirementUnderReview: 'Tu verificación está en revisión',
    requirementRejected: 'La verificación no fue aprobada',
    requirementVerify: 'Verifica tu identidad para ver esta ruta',
    actionContinue: 'Continuar',
    actionConfirm: 'Confirmar',
    actionVerifyAgain: 'Verificar de nuevo',
    actionVerify: 'Verificar',
    trustlineLowReserve: (code) =>
      `Tu billetera necesita unos 0.5 XLM para agregar la trustline de ${code}. Agrega XLM e intenta de nuevo.`,
    trustlineExternal: (code) =>
      `Tu billetera agrega la trustline de ${code} por su cuenta. Agrégala desde tu billetera y luego busca la ruta de nuevo.`,
    trustlineNotApproved: (code) => `La trustline de ${code} no fue aprobada. Intenta de nuevo.`,
    trustlineFailed: (code) => `No se pudo agregar la trustline de ${code}. Intenta de nuevo.`,
    noRouteRejected: 'Tu verificación de identidad no fue aprobada, así que no hay ninguna ruta disponible.',
    noRouteUnderReview: 'Tu verificación está en revisión. No necesitas hacer nada; actualiza más tarde para volver a revisar.',
    noRouteForPair: 'No hay ninguna ruta para esta moneda y este activo en este momento. Elige otra.',
    noRouteForAmount: 'Ninguna ruta acepta este monto en este momento. Prueba con otro monto.',
    processing: 'Procesando',
    completed: 'Transferencia completada',
    pay: (amount, currency) => `Paga ${amount} ${currency}`,
    payOnProvider: 'Pagar en la página del proveedor',
    openPaymentPage: 'Abrir página de pago',
    openStatusPage: 'Abrir página de estado',
    reference: 'Referencia',
    authorize: 'Autoriza tu transferencia',
    approveOnDevice: 'Aprueba en tu dispositivo',
    kycTitle: 'Completa la verificación',
    kycLink: 'Completar verificación',
  },
  pt: {
    assetOn: (code, chain) => `${code} na ${chain}`,
    buy: (what) => `Comprar ${what}`,
    receive: (what) => `Receber ${what}`,
    convert: (from, to) => `Converter ${from} em ${to}`,
    sendTo: (where) => `Enviar para ${where}`,
    substitute: (delivered, planned) =>
      `O provedor enviou ${delivered} em vez de ${planned}. Ele é convertido em ${planned} na próxima etapa, então nada se perde.`,
    approveStep: (code) => `Permitir mover ${code ?? 'o ativo'}`,
    swapStep: (from, to) => `Trocar ${from} por ${to}`,
    burnStep: (chain) => `Enviar de ${chain ?? 'sua carteira'}`,
    attestationStep: 'A Circle confirma a transferência',
    mintStep: (chain) => (chain ? `Chega na ${chain}` : 'Chega ao destino'),
    stepDone: 'Concluído',
    stepAwaitingApproval: 'Aguardando sua aprovação',
    stepConfirmingOnChain: 'Confirmando na rede',
    stepInProgress: 'Em andamento',
    stepSignsNext: 'Você aprova isto em seguida',
    stepWaiting: 'Aguardando',
    invalidEmail: 'Digite um email válido.',
    checkField: (label, hint) => (hint ? `Verifique o campo ${label}: ${hint}` : `Verifique o campo ${label}.`),
    limitMin: (side, amount) => `Esta rota ${side === 'in' ? 'aceita' : 'paga'} no mínimo ${amount}. Tente um valor maior.`,
    limitMax: (side, amount) => `Esta rota ${side === 'in' ? 'aceita' : 'paga'} no máximo ${amount}. Tente um valor menor.`,
    trustAsset: (code) =>
      `Sua carteira Stellar precisa confiar em ${code} para recebê-lo. Adicione a trustline de ${code} e tente novamente.`,
    walletSteps: {
      create_wallet: ['Criar carteira', 'Criando…'],
      set_up_wallet: ['Configurar carteira', 'Configurando…'],
      migrate_custody: ['Mover carteira', 'Movendo…'],
      set_up_recovery: ['Configurar recuperação', 'Abrindo…'],
    },
    heldStartAgain:
      'A ordem do provedor expirou antes de o pagamento chegar. Seus fundos estão seguros na sua carteira: tente novamente para criar uma nova ordem pelo preço atual.',
    requirementForm: 'Responda algumas perguntas para ver esta rota',
    requirementRegistration: 'Cadastre-se no provedor para ver esta rota',
    requirementRegistryPending: 'Seus dados estão em análise',
    requirementRegistry: 'Confirme seus dados para ver esta rota',
    requirementExpired: 'Sua verificação expirou',
    requirementInProgress: 'Verificação em andamento',
    requirementDuplicate: 'Este documento já está vinculado a outra conta, então nossa equipe está analisando.',
    requirementUnderReview: 'Sua verificação está em análise',
    requirementRejected: 'A verificação não foi aprovada',
    requirementVerify: 'Verifique sua identidade para ver esta rota',
    actionContinue: 'Continuar',
    actionConfirm: 'Confirmar',
    actionVerifyAgain: 'Verificar de novo',
    actionVerify: 'Verificar',
    trustlineLowReserve: (code) =>
      `Sua carteira precisa de cerca de 0,5 XLM para adicionar a trustline de ${code}. Adicione XLM e tente novamente.`,
    trustlineExternal: (code) =>
      `Sua carteira adiciona a trustline de ${code} por conta própria. Adicione-a pela sua carteira e depois busque a rota de novo.`,
    trustlineNotApproved: (code) => `A trustline de ${code} não foi aprovada. Tente novamente.`,
    trustlineFailed: (code) => `Não foi possível adicionar a trustline de ${code}. Tente novamente.`,
    noRouteRejected: 'Sua verificação de identidade não foi aprovada, então nenhuma rota está disponível.',
    noRouteUnderReview:
      'Sua verificação está em análise. Você não precisa fazer nada; atualize mais tarde para conferir de novo.',
    noRouteForPair: 'Não há rota para esta moeda e este ativo no momento. Escolha outra.',
    noRouteForAmount: 'Nenhuma rota aceita este valor no momento. Tente outro valor.',
    processing: 'Processando',
    completed: 'Transferência concluída',
    pay: (amount, currency) => `Pague ${amount} ${currency}`,
    payOnProvider: 'Pagar na página do provedor',
    openPaymentPage: 'Abrir página de pagamento',
    openStatusPage: 'Abrir página de status',
    reference: 'Referência',
    authorize: 'Autorize sua transferência',
    approveOnDevice: 'Aprove no seu dispositivo',
    kycTitle: 'Conclua a verificação',
    kycLink: 'Concluir verificação',
  },
};

const nodeName = (node: RampOrderLeg['to'], language: PollarLanguage) =>
  node.kind === 'fiat' ? node.currency : COPY[language].assetOn(node.code, CHAIN_NAME[node.chain] ?? node.chain);

/** What a leg does, in the user's terms: "Pay in BOB", "Convert USDT to USDC", "Send USDC to Stellar". */
export function rampLegTitle(leg: Pick<RampOrderLeg, 'kind' | 'from' | 'to'>, language: PollarLanguage = 'en'): string {
  const copy = COPY[language];
  if (leg.kind === 'PROVIDER_ONRAMP') return copy.buy(nodeName(leg.to, language));
  if (leg.kind === 'PROVIDER_OFFRAMP') return copy.receive(nodeName(leg.to, language));
  if (leg.kind === 'SWAP' && leg.from.kind === 'asset' && leg.to.kind === 'asset')
    return copy.convert(leg.from.code, leg.to.code);
  return copy.sendTo(leg.to.kind === 'asset' ? (CHAIN_NAME[leg.to.chain] ?? leg.to.chain) : nodeName(leg.to, language));
}

/**
 * A line under a leg's title when the provider paid out an accepted substitute
 * (Stereum's USDT for USDC): the swap after it converts the funds, and the user
 * should not read the other asset as a loss. Null when the leg delivered what it planned.
 */
export function rampLegNote(
  leg: Pick<RampOrderLeg, 'kind' | 'to' | 'fundsLocation'>,
  language: PollarLanguage = 'en',
): string | null {
  if (leg.kind !== 'PROVIDER_ONRAMP' || leg.to.kind !== 'asset' || !leg.fundsLocation) return null;
  const delivered = leg.fundsLocation.asset;
  if (delivered.toUpperCase() === leg.to.code.toUpperCase()) return null;
  return COPY[language].substitute(delivered, leg.to.code);
}

const chainName = (chain: string) => CHAIN_NAME[chain] ?? chain;

/** A chain step of a swap or bridge leg, in the user's terms: "Approve USDT", "Circle confirms the transfer". */
export function rampStepTitle(
  step: Pick<RampOrderLegStep, 'kind'>,
  leg: Pick<RampOrderLeg, 'from' | 'to'>,
  language: PollarLanguage = 'en',
): string {
  const copy = COPY[language];
  const from = leg.from.kind === 'asset' ? leg.from : null;
  const to = leg.to.kind === 'asset' ? leg.to : null;
  switch (step.kind) {
    case 'approve':
      return copy.approveStep(from?.code);
    case 'swap':
      return copy
        .swapStep(from?.code ?? '', to?.code ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    case 'burn':
      return copy.burnStep(from ? chainName(from.chain) : null);
    case 'attestation':
      return copy.attestationStep;
    case 'mint':
      return copy.mintStep(to ? chainName(to.chain) : null);
  }
}

/** What a step is doing now, for the line beside its title. */
export function rampStepStatusText(step: Pick<RampOrderLegStep, 'status' | 'signs'>, language: PollarLanguage = 'en'): string {
  const copy = COPY[language];
  switch (step.status) {
    case 'done':
      return copy.stepDone;
    case 'awaiting_approval':
      return copy.stepAwaitingApproval;
    case 'confirming':
      return step.signs ? copy.stepConfirmingOnChain : copy.stepInProgress;
    default:
      return step.signs ? copy.stepSignsNext : copy.stepWaiting;
  }
}

const SIGNING_MODES = new Set(['COSIGNED', 'SELF_CUSTODY', 'EXTERNAL', 'APP_CUSTODY']);

/**
 * The next approval the order will ask for after the one it waits on now, as
 * a title, or null when none is left. A swap or bridge that has not planned
 * its steps yet counts once, by what it does. Every transaction is still
 * approved on its own: this only tells the user one more is coming.
 */
export function rampNextApproval(order: Pick<RampOrder, 'legs'>, language: PollarLanguage = 'en'): string | null {
  for (const leg of order.legs) {
    if (leg.status === 'COMPLETED' || ['HELD', 'FAILED', 'CANCELLED'].includes(leg.status)) continue;
    // An sdk-api that predates chain steps answers legs without `steps`.
    if (leg.steps?.length) {
      const next = leg.steps.find((step) => step.signs && step.status === 'pending');
      if (next) return rampStepTitle(next, leg, language);
      continue;
    }
    if (leg.kind === 'PROVIDER_ONRAMP' || leg.kind === 'PROVIDER_OFFRAMP') continue;
    if (leg.signingMode && SIGNING_MODES.has(leg.signingMode)) return rampLegTitle(leg, language);
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
  language: PollarLanguage = 'en',
): string | null {
  const value = (raw ?? '').trim();
  if (!value || rampFieldValid({ ...field, optional: true }, value)) return null;
  if (field.type === 'email') return COPY[language].invalidEmail;
  return COPY[language].checkField(field.label.toLowerCase(), field.hint);
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
const RESOLUTION: Record<PollarLanguage, Record<string, string>> = {
  en: {
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
    add_trustline: 'Your Stellar wallet must trust the asset this route delivers. Add its trustline and try again.',
    sign_again: 'The signature expired. Sign the step again.',
    start_again: 'This transfer could not go through. Start a new one; nothing was charged.',
    // The app's gas wallet is short, which the user cannot fix: no support call, no order id (none exists yet).
    fund_gas_wallet: 'This route is not available right now. Try again later or choose another route.',
    // The app does not allow the wallet's signing mode for ramps: again nothing the user can do.
    enable_signing_mode: 'This route is not available for your wallet in this app. Choose another route.',
    wait_reconciliation: 'We are confirming where the funds are. You do not need to start again.',
    pollar_follows_up: 'We are looking into it. Your funds are safe; contact support with the order id if you need help.',
    contact_pollar: 'Something went wrong on our side. Contact support with the order id.',
  },
  es: {
    accept_new_quote: 'El precio cambió. Pide una nueva cotización para continuar.',
    add_funds: 'La billetera no tiene suficiente. Agrega fondos e intenta de nuevo.',
    approve_again: 'La aprobación venció. Aprueba el paso otra vez.',
    automatic_retry: 'Se está reintentando solo. No necesitas hacer nada.',
    change_amount: 'Este monto está fuera de lo que acepta la ruta. Prueba con otro monto.',
    complete_verification: 'Completa la verificación de identidad para continuar.',
    correct_input: 'Algunos datos no fueron aceptados. Revísalos y empieza de nuevo.',
    link_wallet: 'Esta ruta necesita una billetera en otra red.',
    create_wallet: 'Necesitas una billetera para recibir esto. Crea una para continuar.',
    set_up_wallet: 'Esta ruta pasa por otra red. Configura tu billetera allí para continuar.',
    migrate_custody:
      'Tu billetera todavía está solo en manos de Pollar. Muévela a la billetera segura de tu app para continuar.',
    set_up_recovery: 'Tu billetera necesita una forma de recuperarse antes de poder firmar. Agrega una e intenta de nuevo.',
    add_trustline:
      'Tu billetera Stellar debe confiar en el activo que entrega esta ruta. Agrega su trustline e intenta de nuevo.',
    sign_again: 'La firma venció. Firma el paso otra vez.',
    start_again: 'Esta transferencia no pudo completarse. Empieza una nueva; no se cobró nada.',
    fund_gas_wallet: 'Esta ruta no está disponible en este momento. Intenta más tarde o elige otra ruta.',
    enable_signing_mode: 'Esta ruta no está disponible para tu billetera en esta app. Elige otra ruta.',
    wait_reconciliation: 'Estamos confirmando dónde están los fondos. No necesitas empezar de nuevo.',
    pollar_follows_up:
      'Lo estamos revisando. Tus fondos están seguros; contacta al soporte con el id de la orden si necesitas ayuda.',
    contact_pollar: 'Algo salió mal de nuestro lado. Contacta al soporte con el id de la orden.',
  },
  pt: {
    accept_new_quote: 'O preço mudou. Peça uma nova cotação para continuar.',
    add_funds: 'A carteira não tem saldo suficiente. Adicione fundos e tente novamente.',
    approve_again: 'A aprovação expirou. Aprove a etapa de novo.',
    automatic_retry: 'Tentando de novo automaticamente. Você não precisa fazer nada.',
    change_amount: 'Este valor está fora do que a rota aceita. Tente outro valor.',
    complete_verification: 'Conclua a verificação de identidade para continuar.',
    correct_input: 'Alguns dados não foram aceitos. Confira-os e comece de novo.',
    link_wallet: 'Esta rota precisa de uma carteira em outra rede.',
    create_wallet: 'Você precisa de uma carteira para receber isto. Crie uma para continuar.',
    set_up_wallet: 'Esta rota passa por outra rede. Configure sua carteira lá para continuar.',
    migrate_custody:
      'Sua carteira ainda está somente sob a guarda da Pollar. Mova-a para a carteira segura do seu app para continuar.',
    set_up_recovery: 'Sua carteira precisa de uma forma de recuperação antes de poder assinar. Adicione uma e tente novamente.',
    add_trustline:
      'Sua carteira Stellar precisa confiar no ativo que esta rota entrega. Adicione a trustline dele e tente novamente.',
    sign_again: 'A assinatura expirou. Assine a etapa de novo.',
    start_again: 'Esta transferência não pôde ser concluída. Comece uma nova; nada foi cobrado.',
    fund_gas_wallet: 'Esta rota não está disponível no momento. Tente mais tarde ou escolha outra rota.',
    enable_signing_mode: 'Esta rota não está disponível para sua carteira neste app. Escolha outra rota.',
    wait_reconciliation: 'Estamos confirmando onde estão os fundos. Você não precisa começar de novo.',
    pollar_follows_up:
      'Estamos analisando. Seus fundos estão seguros; fale com o suporte informando o id da ordem se precisar de ajuda.',
    contact_pollar: 'Algo deu errado do nosso lado. Fale com o suporte informando o id da ordem.',
  },
};

/**
 * A decimal string with its thousands grouped: `14500.5` reads `14,500.5`, and
 * `14.500,5` in Portuguese, where a comma marks the decimals.
 */
function groupedAmount(value: string, language: PollarLanguage): string {
  const [group, decimal] = language === 'pt' ? ['.', ','] : [',', '.'];
  const [whole = '', fraction] = value.split('.');
  let grouped = '';
  for (let i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += group;
    grouped += whole[i];
  }
  return fraction ? `${grouped}${decimal}${fraction}` : grouped;
}

/** The bound the amount broke, worded for the user; null when the rejection names none. */
function limitText(code: string | undefined, limit: RampQuoteLimit | undefined, language: PollarLanguage): string | null {
  if (!limit) return null;
  const copy = COPY[language];
  if (code === 'LIMIT_BELOW_MINIMUM' && limit.min !== null)
    return copy.limitMin(limit.side, `${groupedAmount(limit.min, language)} ${limit.currency}`);
  if (code === 'LIMIT_ABOVE_MAXIMUM' && limit.max !== null)
    return copy.limitMax(limit.side, `${groupedAmount(limit.max, language)} ${limit.currency}`);
  return null;
}

/** The asset a missing trustline names in its `detail` (`CODE:ISSUER`); null for any other detail. */
function trustlineCode(action: string, detail: string | null | undefined): string | null {
  if (action !== 'add_trustline' || !detail) return null;
  const [code, issuer, ...rest] = detail.split(':');
  return code && issuer && !rest.length && /^[A-Za-z0-9]{1,12}$/.test(code) && /^G[A-Z2-7]{55}$/.test(issuer) ? code : null;
}

/**
 * The text for a failure's `resolutionAction`; anything unknown asks the user to contact support.
 * An amount out of a route's limits names the bound when the failure carries it (`limit`), and a
 * missing trustline names its asset.
 */
export function rampResolutionText(
  failure: Pick<RampFailure, 'resolutionAction'> & {
    code?: string;
    detail?: string | null | undefined;
    limit?: RampQuoteLimit | undefined;
  },
  language: PollarLanguage = 'en',
): string {
  const trust = trustlineCode(failure.resolutionAction, failure.detail);
  if (trust) return COPY[language].trustAsset(trust);
  const resolution = RESOLUTION[language];
  return limitText(failure.code, failure.limit, language) ?? resolution[failure.resolutionAction] ?? resolution.contact_pollar!;
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
export function rampWalletStep(
  rejection: Pick<RampQuoteRejection, 'failure'>,
  language: PollarLanguage = 'en',
): RampWalletStep | null {
  const { resolutionAction, detail } = rejection.failure;
  const step = (action: RampWalletStep['action'], chain: RampWalletStep['chain']): RampWalletStep => {
    const [label, busyLabel] = COPY[language].walletSteps[action];
    return { action, chain, label, busyLabel };
  };
  if (resolutionAction === 'create_wallet') return step(resolutionAction, null);
  if (resolutionAction === 'set_up_wallet' && (detail === 'POLYGON' || detail === 'SOLANA'))
    return step(resolutionAction, detail);
  if (resolutionAction === 'migrate_custody') return step(resolutionAction, null);
  if (resolutionAction === 'set_up_recovery') return step(resolutionAction, null);
  return null;
}

/** What a held order asks instead, where it differs: its funds moved and wait where they are. */
const HELD_RESOLUTION = (language: PollarLanguage): Record<string, string> => ({
  start_again: COPY[language].heldStartAgain,
});

/** The text for an order's failure, told apart when the order is held with its funds already moved. */
export function rampOrderResolutionText(
  order: Pick<RampOrder, 'failure' | 'legs'>,
  language: PollarLanguage = 'en',
): string | null {
  if (!order.failure) return null;
  const held = order.legs.some((leg) => leg.status === 'HELD');
  return (
    (held ? HELD_RESOLUTION(language)[order.failure.resolutionAction] : undefined) ??
    rampResolutionText(order.failure, language)
  );
}

/**
 * What a route held back by a verification step says, and the button that opens
 * the step. A step under review or refused has nothing the user can do from the
 * widget, so it offers no button.
 */
export function rampRequirementCopy(
  requirement: Pick<RampQuoteRequirement, 'type' | 'status' | 'reviewReason'>,
  language: PollarLanguage = 'en',
): {
  message: string;
  action: string | null;
} {
  const copy = COPY[language];
  if (requirement.type === 'FORM') return { message: copy.requirementForm, action: copy.actionContinue };
  if (requirement.type === 'PROVIDER_REGISTRATION')
    return { message: copy.requirementRegistration, action: copy.actionContinue };
  if (requirement.type === 'REGISTRY_CHECK')
    return requirement.status === 'pending'
      ? { message: copy.requirementRegistryPending, action: null }
      : { message: copy.requirementRegistry, action: copy.actionConfirm };
  switch (requirement.status) {
    case 'expired':
      return { message: copy.requirementExpired, action: copy.actionVerifyAgain };
    case 'pending':
      if (!requirement.reviewReason) return { message: copy.requirementInProgress, action: copy.actionContinue };
      return {
        message: requirement.reviewReason === 'DUPLICATE_DOCUMENT' ? copy.requirementDuplicate : copy.requirementUnderReview,
        action: null,
      };
    case 'rejected':
      return { message: copy.requirementRejected, action: null };
    default:
      return { message: copy.requirementVerify, action: copy.actionVerify };
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
export function rampTrustlineErrorText(outcome: { code?: string }, assetCode: string, language: PollarLanguage = 'en'): string {
  const copy = COPY[language];
  if (outcome.code === 'TX_LOW_RESERVE') return copy.trustlineLowReserve(assetCode);
  if (outcome.code === 'TX_EXTERNAL_WALLET_SERVER_SIGN') return copy.trustlineExternal(assetCode);
  if (outcome.code?.startsWith('SDK_COSIGN_')) return copy.trustlineNotApproved(assetCode);
  return copy.trustlineFailed(assetCode);
}

/**
 * Why no route was offered: the fix every rejected route shares, else a change of
 * amount. When every route waits on a verification the user cannot act on (under
 * review or refused), it says so instead of asking them to verify.
 */
export function rampNoRouteText(
  rejected: Array<Pick<RampQuoteRejection, 'failure'> & Partial<Pick<RampQuoteRejection, 'requirement'>>>,
  language: PollarLanguage = 'en',
): string {
  const copy = COPY[language];
  const requirements = rejected.map((r) => r.requirement);
  if (requirements.length && requirements.every((req) => req && rampRequirementCopy(req).action === null)) {
    return requirements.every((req) => req!.status === 'rejected') ? copy.noRouteRejected : copy.noRouteUnderReview;
  }
  // Nothing was even tried: no rail joins this currency and asset, whatever the amount.
  if (!rejected.length) return copy.noRouteForPair;
  const texts = [...new Set(rejected.map((r) => rampResolutionText(r.failure, language)))];
  return texts.length === 1 ? texts[0]! : copy.noRouteForAmount;
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
export function describeRampAction(
  order: Pick<RampOrder, 'pendingAction' | 'state'>,
  language: PollarLanguage = 'en',
): {
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
  const copy = COPY[language];
  const action = order.pendingAction;
  const expiresAt = action && 'expiresAt' in action && typeof action.expiresAt === 'string' ? action.expiresAt : null;
  const base = {
    action,
    title: copy.processing,
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
  if (order.state === 'completed') return { ...base, title: copy.completed };
  if (!action) return base;
  switch (action.kind) {
    case 'FIAT_PAYMENT': {
      const instructions = action.instructions;
      const title = copy.pay(instructions.amount, instructions.currency);
      // Past its window a code or account would take money the order no longer waits for.
      if (expiresAt && Date.parse(expiresAt) <= Date.now()) return { ...base, title, paymentClosed: true };
      if (instructions.kind === 'hosted') {
        const link = safeRampUrl(instructions.url);
        return { ...base, title, link, linkLabel: link ? copy.payOnProvider : null, codeMissing: !link };
      }
      const link = instructions.link ? safeRampUrl(instructions.link) : null;
      const page = { link, linkLabel: link ? (instructions.kind === 'qr' ? copy.openPaymentPage : copy.openStatusPage) : null };
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
          ...(instructions.reference ? [{ label: copy.reference, value: instructions.reference }] : []),
        ],
      };
    }
    case 'SIGNATURE':
      return { ...base, title: copy.authorize, canSign: Date.parse(action.expiresAt) > Date.now() };
    case 'COSIGN_APPROVAL':
      return { ...base, title: copy.approveOnDevice, canApprove: true };
    case 'KYC': {
      const link = action.url ? safeRampUrl(action.url) : null;
      return {
        ...base,
        title: copy.kycTitle,
        link,
        linkLabel: link ? copy.kycLink : null,
        note: link ? null : kycNote(action.steps),
      };
    }
    default:
      return base;
  }
}
