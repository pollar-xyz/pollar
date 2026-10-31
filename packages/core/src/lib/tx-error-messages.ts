import type { PollarLanguage } from './language';

/**
 * User-facing text for a failed transaction or co-sign approval. The backend
 * answers with codes only; this is where the SDK turns the ones a sender can
 * hit into a sentence. A code without an entry falls back to `details` when it
 * reads as a sentence, and to a generic message otherwise, so a raw code never
 * reaches the screen.
 */
/**
 * 402: the app ran out of Pollar credits. The user can do nothing about it, so
 * the text never says why; the developer gets the reason in the console.
 */
export const APP_UNAVAILABLE_MESSAGE =
  "This isn't available right now. Please try again later, and if it keeps happening, contact this app's support.";

const APP_UNAVAILABLE: Record<PollarLanguage, string> = {
  en: APP_UNAVAILABLE_MESSAGE,
  es: 'Esto no está disponible en este momento. Intenta de nuevo más tarde y, si sigue pasando, contacta al soporte de esta app.',
  pt: 'Isto não está disponível no momento. Tente novamente mais tarde e, se continuar acontecendo, fale com o suporte deste app.',
};

const MESSAGES: Record<PollarLanguage, Record<string, string>> = {
  en: {
    TX_INSUFFICIENT_BALANCE: 'Not enough balance to cover the amount and the network fee.',
    TX_INSUFFICIENT_FEE: 'The network fee was too low for the network right now. Please try again.',
    TX_FEE_LIMIT_EXCEEDED: 'The network fee is higher than this app allows right now. Please try again later.',
    TX_LOW_RESERVE: 'This wallet would fall below its minimum balance.',
    TX_DESTINATION_NOT_FOUND:
      "You can't send to this account: it doesn't exist on the network yet. It has to be created and funded with XLM first.",
    TX_SOURCE_NOT_FOUND: "This wallet isn't active on the network yet.",
    TX_NO_TRUSTLINE: "The destination can't receive this asset yet.",
    TX_LINE_FULL: "The destination can't hold that much of this asset.",
    TX_NOT_AUTHORIZED: "This account isn't authorized to hold or send this asset.",
    TX_TOO_LATE: 'The transaction expired before it was sent. Please try again.',
    TX_BAD_SEQUENCE: 'Another transaction was sent from this wallet at the same time. Please try again.',
    TX_SUBMIT_FAILED: "The network didn't accept the transaction. Please try again.",
    TX_SUBMIT_UNCONFIRMED: "The transaction was sent but isn't confirmed yet. Check its status before sending again.",
    TX_SIGN_FAILED: "The transaction couldn't be signed. Please try again.",
    SDK_TX_BUILD_ERROR: "The transaction couldn't be prepared. Please try again.",
    VALIDATION_ERROR: "The transaction couldn't be prepared. Please try again.",
    SDK_COSIGN_VERIFICATION_FAILED: "The transaction didn't match what would be signed, so it was not approved.",
    SDK_COSIGN_REQUEST_NOT_PENDING: 'This request is no longer waiting for approval.',
    SDK_COSIGN_REQUEST_NOT_FOUND: 'This request no longer exists.',
    SDK_COSIGN_DEVICE_NOT_ENROLLED: "This device can't approve requests for this wallet.",
    SDK_COSIGN_UPSTREAM_ERROR: "The signing service didn't answer. Please try again.",
    SDK_WALLET_RECOVERY_REQUIRED:
      'Set up a way to recover this wallet first: a passkey, a second device or your email. Without one, losing this device means losing the funds, and nobody can get them back.',
    SDK_COSIGN_TURNKEY_REJECTED: 'The wallet provider refused the request. Please try again in a moment.',
    SDK_COSIGN_GAS_PENDING:
      'The network fee for this step is still on its way to your wallet. Please try again in a few seconds.',
    SDK_COSIGN_CUSTODY_SWITCH_PENDING: 'Finish or cancel the pending approvals before changing how this wallet is secured.',
    SDK_COSIGN_CUSTODY_SWITCH_NOT_ALLOWED: "This app doesn't let you change how your wallet is secured.",
    SDK_COSIGN_PASSKEY_UNAVAILABLE: "Passkeys aren't available on this device.",
    SDK_CREDITS_INSUFFICIENT: APP_UNAVAILABLE.en,
    SDK_BILLING_OVERDUE: APP_UNAVAILABLE.en,
  },
  es: {
    TX_INSUFFICIENT_BALANCE: 'No tienes saldo suficiente para cubrir el monto y la comisión de la red.',
    TX_INSUFFICIENT_FEE: 'La comisión fue demasiado baja para la red en este momento. Intenta de nuevo.',
    TX_FEE_LIMIT_EXCEEDED: 'La comisión de la red es más alta de lo que esta app permite ahora. Intenta de nuevo más tarde.',
    TX_LOW_RESERVE: 'Esta billetera quedaría por debajo de su saldo mínimo.',
    TX_DESTINATION_NOT_FOUND:
      'No puedes enviar a esta cuenta: todavía no existe en la red. Primero hay que crearla y fondearla con XLM.',
    TX_SOURCE_NOT_FOUND: 'Esta billetera todavía no está activa en la red.',
    TX_NO_TRUSTLINE: 'El destino todavía no puede recibir este activo.',
    TX_LINE_FULL: 'El destino no puede tener tanto de este activo.',
    TX_NOT_AUTHORIZED: 'Esta cuenta no está autorizada para tener o enviar este activo.',
    TX_TOO_LATE: 'La transacción venció antes de enviarse. Intenta de nuevo.',
    TX_BAD_SEQUENCE: 'Se envió otra transacción desde esta billetera al mismo tiempo. Intenta de nuevo.',
    TX_SUBMIT_FAILED: 'La red no aceptó la transacción. Intenta de nuevo.',
    TX_SUBMIT_UNCONFIRMED:
      'La transacción se envió, pero todavía no está confirmada. Revisa su estado antes de enviarla otra vez.',
    TX_SIGN_FAILED: 'No se pudo firmar la transacción. Intenta de nuevo.',
    SDK_TX_BUILD_ERROR: 'No se pudo preparar la transacción. Intenta de nuevo.',
    VALIDATION_ERROR: 'No se pudo preparar la transacción. Intenta de nuevo.',
    SDK_COSIGN_VERIFICATION_FAILED: 'La transacción no coincidía con lo que se iba a firmar, así que no se aprobó.',
    SDK_COSIGN_REQUEST_NOT_PENDING: 'Esta solicitud ya no está esperando aprobación.',
    SDK_COSIGN_REQUEST_NOT_FOUND: 'Esta solicitud ya no existe.',
    SDK_COSIGN_DEVICE_NOT_ENROLLED: 'Este dispositivo no puede aprobar solicitudes de esta billetera.',
    SDK_COSIGN_UPSTREAM_ERROR: 'El servicio de firma no respondió. Intenta de nuevo.',
    SDK_WALLET_RECOVERY_REQUIRED:
      'Primero configura una forma de recuperar esta billetera: una passkey, un segundo dispositivo o tu email. Sin una, perder este dispositivo significa perder los fondos, y nadie podrá recuperarlos.',
    SDK_COSIGN_TURNKEY_REJECTED: 'El proveedor de la billetera rechazó la solicitud. Intenta de nuevo en un momento.',
    SDK_COSIGN_GAS_PENDING:
      'La comisión de la red para este paso todavía está llegando a tu billetera. Intenta de nuevo en unos segundos.',
    SDK_COSIGN_CUSTODY_SWITCH_PENDING:
      'Termina o cancela las aprobaciones pendientes antes de cambiar cómo se protege esta billetera.',
    SDK_COSIGN_CUSTODY_SWITCH_NOT_ALLOWED: 'Esta app no te permite cambiar cómo se protege tu billetera.',
    SDK_COSIGN_PASSKEY_UNAVAILABLE: 'Las passkeys no están disponibles en este dispositivo.',
    SDK_CREDITS_INSUFFICIENT: APP_UNAVAILABLE.es,
    SDK_BILLING_OVERDUE: APP_UNAVAILABLE.es,
  },
  pt: {
    TX_INSUFFICIENT_BALANCE: 'Você não tem saldo suficiente para cobrir o valor e a taxa da rede.',
    TX_INSUFFICIENT_FEE: 'A taxa ficou baixa demais para a rede neste momento. Tente novamente.',
    TX_FEE_LIMIT_EXCEEDED: 'A taxa da rede está mais alta do que este app permite agora. Tente novamente mais tarde.',
    TX_LOW_RESERVE: 'Esta carteira ficaria abaixo do saldo mínimo.',
    TX_DESTINATION_NOT_FOUND:
      'Você não pode enviar para esta conta: ela ainda não existe na rede. Primeiro ela precisa ser criada e receber XLM.',
    TX_SOURCE_NOT_FOUND: 'Esta carteira ainda não está ativa na rede.',
    TX_NO_TRUSTLINE: 'O destino ainda não pode receber este ativo.',
    TX_LINE_FULL: 'O destino não pode manter tanto deste ativo.',
    TX_NOT_AUTHORIZED: 'Esta conta não está autorizada a manter ou enviar este ativo.',
    TX_TOO_LATE: 'A transação expirou antes de ser enviada. Tente novamente.',
    TX_BAD_SEQUENCE: 'Outra transação foi enviada desta carteira ao mesmo tempo. Tente novamente.',
    TX_SUBMIT_FAILED: 'A rede não aceitou a transação. Tente novamente.',
    TX_SUBMIT_UNCONFIRMED: 'A transação foi enviada, mas ainda não foi confirmada. Verifique o status antes de enviar de novo.',
    TX_SIGN_FAILED: 'Não foi possível assinar a transação. Tente novamente.',
    SDK_TX_BUILD_ERROR: 'Não foi possível preparar a transação. Tente novamente.',
    VALIDATION_ERROR: 'Não foi possível preparar a transação. Tente novamente.',
    SDK_COSIGN_VERIFICATION_FAILED: 'A transação não correspondia ao que seria assinado, então não foi aprovada.',
    SDK_COSIGN_REQUEST_NOT_PENDING: 'Esta solicitação não está mais aguardando aprovação.',
    SDK_COSIGN_REQUEST_NOT_FOUND: 'Esta solicitação não existe mais.',
    SDK_COSIGN_DEVICE_NOT_ENROLLED: 'Este dispositivo não pode aprovar solicitações desta carteira.',
    SDK_COSIGN_UPSTREAM_ERROR: 'O serviço de assinatura não respondeu. Tente novamente.',
    SDK_WALLET_RECOVERY_REQUIRED:
      'Primeiro configure uma forma de recuperar esta carteira: uma passkey, um segundo dispositivo ou seu email. Sem uma, perder este dispositivo significa perder os fundos, e ninguém poderá recuperá-los.',
    SDK_COSIGN_TURNKEY_REJECTED: 'O provedor da carteira recusou a solicitação. Tente novamente em instantes.',
    SDK_COSIGN_GAS_PENDING:
      'A taxa da rede desta etapa ainda está a caminho da sua carteira. Tente novamente em alguns segundos.',
    SDK_COSIGN_CUSTODY_SWITCH_PENDING:
      'Conclua ou cancele as aprovações pendentes antes de mudar como esta carteira é protegida.',
    SDK_COSIGN_CUSTODY_SWITCH_NOT_ALLOWED: 'Este app não permite mudar como sua carteira é protegida.',
    SDK_COSIGN_PASSKEY_UNAVAILABLE: 'Passkeys não estão disponíveis neste dispositivo.',
    SDK_CREDITS_INSUFFICIENT: APP_UNAVAILABLE.pt,
    SDK_BILLING_OVERDUE: APP_UNAVAILABLE.pt,
  },
};

const GENERIC: Record<PollarLanguage, string> = {
  en: 'Something went wrong. Please try again.',
  es: 'Algo salió mal. Intenta de nuevo.',
  pt: 'Algo deu errado. Tente novamente.',
};

const REFUSED_BECAUSE: Record<PollarLanguage, (reason: string) => string> = {
  en: (reason) => `The wallet provider refused the request: ${reason}.`,
  es: (reason) => `El proveedor de la billetera rechazó la solicitud: ${reason}.`,
  pt: (reason) => `O provedor da carteira recusou a solicitação: ${reason}.`,
};

/**
 * Stellar result codes (the RPC's camelCase and Horizon's snake_case) for the
 * failures a sender can understand, mapped to the code that carries the message.
 */
const ON_CHAIN_CODES: Record<string, string> = {
  paymentNoDestination: 'TX_DESTINATION_NOT_FOUND',
  pathPaymentStrictSendNoDestination: 'TX_DESTINATION_NOT_FOUND',
  pathPaymentStrictReceiveNoDestination: 'TX_DESTINATION_NOT_FOUND',
  op_no_destination: 'TX_DESTINATION_NOT_FOUND',
  paymentUnderfunded: 'TX_INSUFFICIENT_BALANCE',
  pathPaymentStrictSendUnderfunded: 'TX_INSUFFICIENT_BALANCE',
  createAccountUnderfunded: 'TX_INSUFFICIENT_BALANCE',
  op_underfunded: 'TX_INSUFFICIENT_BALANCE',
  txInsufficientBalance: 'TX_INSUFFICIENT_BALANCE',
  paymentNoTrust: 'TX_NO_TRUSTLINE',
  pathPaymentStrictSendNoTrust: 'TX_NO_TRUSTLINE',
  op_no_trust: 'TX_NO_TRUSTLINE',
  paymentLineFull: 'TX_LINE_FULL',
  op_line_full: 'TX_LINE_FULL',
  paymentNotAuthorized: 'TX_NOT_AUTHORIZED',
  paymentSrcNotAuthorized: 'TX_NOT_AUTHORIZED',
  op_not_authorized: 'TX_NOT_AUTHORIZED',
  txTooLate: 'TX_TOO_LATE',
  tx_too_late: 'TX_TOO_LATE',
  txBadSeq: 'TX_BAD_SEQUENCE',
  tx_bad_seq: 'TX_BAD_SEQUENCE',
  txInsufficientFee: 'TX_INSUFFICIENT_FEE',
  tx_insufficient_fee: 'TX_INSUFFICIENT_FEE',
  txNoAccount: 'TX_SOURCE_NOT_FOUND',
  tx_no_source_account: 'TX_SOURCE_NOT_FOUND',
};

/**
 * The SDK error code behind a failed transaction's on-chain result codes (the
 * transaction's own, then each operation's), or undefined when none is one a
 * sender can act on. `txFailed` alone says nothing: the operation codes do.
 */
export function onChainErrorCode(...codes: (string | null | undefined)[]): string | undefined {
  for (const code of codes.flatMap((c) => c?.split(',') ?? [])) {
    const mapped = ON_CHAIN_CODES[code.trim()];
    if (mapped) return mapped;
  }
  return undefined;
}

/** An error code rather than a sentence: SDK codes, and on-chain ones like `txFailed` or `op_no_destination,tx_failed`. */
const CODE_LIKE = /^[A-Za-z0-9_,]+$/;

/**
 * `details` that reads as a sentence comes from the backend in English and is
 * shown as it came, whatever the language.
 */
export function transactionErrorMessage(
  code?: string | null,
  details?: string | null,
  language: PollarLanguage = 'en',
): string {
  const messages = MESSAGES[language];
  if (code && messages[code]) return messages[code];
  if (details && messages[details]) return messages[details];
  const onChain = onChainErrorCode(code, details);
  if (onChain && messages[onChain]) return messages[onChain];
  if (details && !CODE_LIKE.test(details.trim())) return details;
  return GENERIC[language];
}

/**
 * The text for the wallet provider refusing a request (`SDK_COSIGN_TURNKEY_REJECTED`),
 * with the provider's own reason when it gave one; null for any other error.
 */
const EMPTY_DETAILS = '(Details: [])';

export function cosignRefusalMessage(error: unknown, language: PollarLanguage = 'en'): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'SDK_COSIGN_TURNKEY_REJECTED')
    return null;
  const body = 'body' in error && typeof error.body === 'object' && error.body !== null ? error.body : null;
  const raw = body && 'message' in body && typeof body.message === 'string' ? body.message : '';
  let reason = raw.replace(/^Turnkey error \d+:\s*/i, '').trimEnd();
  if (reason.endsWith(EMPTY_DETAILS)) reason = reason.slice(0, -EMPTY_DETAILS.length);
  reason = reason.trim();
  return reason ? REFUSED_BECAUSE[language](reason) : (MESSAGES[language].SDK_COSIGN_TURNKEY_REJECTED ?? GENERIC[language]);
}

/** The text for an error the user cannot fix and the app must (402: out of credits or an overdue bill); null for any other error. */
export function appUnavailableMessage(error: unknown, language: PollarLanguage = 'en'): string | null {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return code === 'SDK_CREDITS_INSUFFICIENT' || code === 'SDK_BILLING_OVERDUE' ? APP_UNAVAILABLE[language] : null;
}
