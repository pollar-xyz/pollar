import { AUTH_ERROR_CODES, type AuthErrorCode } from '../../types';
import { stringField } from '../../api/error-fields';
import type { PollarLanguage } from '../../lib/language';
import { appUnavailableMessage } from '../../lib/tx-error-messages';

/**
 * Maps a backend error `code` (the `ErrorCode` enum returned by sdk-api /
 * wallet-service in `{ code, success: false }`) to a user-facing message and
 * the SDK's coarse `AuthErrorCode` bucket.
 *
 * The backend stays code-only by design - this catalog is the single place the
 * SDK turns those codes into human-readable text, in each language the modals
 * show. Consumers that need another language can switch on `state.errorCode`
 * (the bucket) or the raw `code` instead of the message string.
 */
interface ResolvedAuthError {
  message: string;
  errorCode: AuthErrorCode;
}

interface CatalogEntry {
  message: Record<PollarLanguage, string>;
  errorCode: AuthErrorCode;
}

const appUnavailable = (language: PollarLanguage) => appUnavailableMessage({ code: 'SDK_CREDITS_INSUFFICIENT' }, language)!;

const CATALOG: Record<string, CatalogEntry> = {
  // -- Smart-account deploy / sponsor wallet ----------------------------------
  SPONSOR_NOT_FUNDED: {
    message: {
      en: "This app can't create your wallet yet — its sponsor account isn't funded. Please contact the app's developer.",
      es: 'Esta app todavía no puede crear tu billetera: su cuenta patrocinadora no tiene fondos. Contacta al desarrollador de la app.',
      pt: 'Este app ainda não pode criar sua carteira: a conta patrocinadora dele não tem fundos. Fale com o desenvolvedor do app.',
    },
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  APP_WALLET_NOT_FOUND: {
    message: {
      en: "This app isn't fully set up to create wallets yet. Please contact the app's developer.",
      es: 'Esta app todavía no está configurada para crear billeteras. Contacta al desarrollador de la app.',
      pt: 'Este app ainda não está configurado para criar carteiras. Fale com o desenvolvedor do app.',
    },
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  WALLET_NOT_FOUND: {
    message: {
      en: "This app isn't fully set up to create wallets yet. Please contact the app's developer.",
      es: 'Esta app todavía no está configurada para crear billeteras. Contacta al desarrollador de la app.',
      pt: 'Este app ainda não está configurado para criar carteiras. Fale com o desenvolvedor do app.',
    },
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  PASSKEY_DEPLOY_FAILED: {
    message: {
      en: "We couldn't finish creating your wallet. Please try again in a moment.",
      es: 'No pudimos terminar de crear tu billetera. Intenta de nuevo en un momento.',
      pt: 'Não conseguimos terminar de criar sua carteira. Tente novamente em instantes.',
    },
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },

  // -- The app's Pollar credits --------------------------------------------------
  // The app ran out of credits for what this action costs Pollar (HTTP 402). The
  // end user can do nothing about it: only the app can top up.
  SDK_CREDITS_INSUFFICIENT: {
    message: { en: appUnavailable('en'), es: appUnavailable('es'), pt: appUnavailable('pt') },
    errorCode: AUTH_ERROR_CODES.AUTH_FAILED,
  },
  // The app has an overdue Pollar bill (HTTP 402); the same for the end user.
  SDK_BILLING_OVERDUE: {
    message: { en: appUnavailable('en'), es: appUnavailable('es'), pt: appUnavailable('pt') },
    errorCode: AUTH_ERROR_CODES.AUTH_FAILED,
  },

  // -- Passkey ceremony --------------------------------------------------------
  PASSKEY_ALREADY_REGISTERED: {
    message: {
      en: 'A passkey is already registered for this account. Try signing in instead.',
      es: 'Ya hay una passkey registrada para esta cuenta. Intenta iniciar sesión.',
      pt: 'Já existe uma passkey registrada para esta conta. Tente entrar.',
    },
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  PASSKEY_UNKNOWN_CREDENTIAL: {
    message: {
      en: "We don't recognize this passkey. Try creating a new one.",
      es: 'No reconocemos esta passkey. Intenta crear una nueva.',
      pt: 'Não reconhecemos esta passkey. Tente criar uma nova.',
    },
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  PASSKEY_VERIFICATION_FAILED: {
    message: {
      en: "We couldn't verify your passkey. Please try again.",
      es: 'No pudimos verificar tu passkey. Intenta de nuevo.',
      pt: 'Não conseguimos verificar sua passkey. Tente novamente.',
    },
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  PASSKEY_CHALLENGE_MISSING: {
    message: {
      en: 'Your passkey session expired. Please start again.',
      es: 'Tu sesión de passkey venció. Empieza de nuevo.',
      pt: 'Sua sessão de passkey expirou. Comece de novo.',
    },
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },

  // -- On-chain transaction failures (surfaced during deploy/transfer) ---------
  // These map to the TX_FAILED bucket (not PASSKEY_FAILED) - the precise reason
  // is the entry key itself, surfaced as the raw `code` on the tx outcome.
  TX_INSUFFICIENT_BALANCE: {
    message: {
      en: 'Insufficient balance to complete this transaction.',
      es: 'No tienes saldo suficiente para completar esta transacción.',
      pt: 'Você não tem saldo suficiente para concluir esta transação.',
    },
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_INSUFFICIENT_FEE: {
    message: {
      en: 'Not enough XLM to cover the network fee. Add more XLM to your wallet and try again.',
      es: 'No tienes suficiente XLM para cubrir la comisión de la red. Agrega más XLM a tu billetera e intenta de nuevo.',
      pt: 'Você não tem XLM suficiente para cobrir a taxa da rede. Adicione mais XLM à sua carteira e tente novamente.',
    },
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_FEE_LIMIT_EXCEEDED: {
    message: {
      en: 'The transaction fee is above the allowed limit. Please try again.',
      es: 'La comisión de la transacción supera el límite permitido. Intenta de nuevo.',
      pt: 'A taxa da transação está acima do limite permitido. Tente novamente.',
    },
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_CONTRACT_FAILED: {
    message: {
      en: 'The contract rejected this operation. Check the operation is allowed right now and try again.',
      es: 'El contrato rechazó esta operación. Revisa que la operación esté permitida en este momento e intenta de nuevo.',
      pt: 'O contrato recusou esta operação. Verifique se a operação é permitida neste momento e tente novamente.',
    },
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_DESTINATION_NOT_FOUND: {
    message: {
      en: "The destination account doesn't exist on the network yet.",
      es: 'La cuenta de destino todavía no existe en la red.',
      pt: 'A conta de destino ainda não existe na rede.',
    },
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_NO_TRUSTLINE: {
    message: {
      en: "The destination can't receive this asset yet (no trustline).",
      es: 'El destino todavía no puede recibir este activo (no tiene trustline).',
      pt: 'O destino ainda não pode receber este ativo (não tem trustline).',
    },
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_BAD_SEQUENCE: {
    message: {
      en: 'Something went out of sync. Please try again.',
      es: 'Algo se desincronizó. Intenta de nuevo.',
      pt: 'Algo saiu de sincronia. Tente novamente.',
    },
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
};

/**
 * Resolves a backend error `code` to a friendly message + bucket. Falls back to
 * the supplied default message when the code is unknown or absent, bucketing by
 * the code's domain prefix (`TX_`/`SDK_TX_` -> `TX_FAILED`, else `PASSKEY_FAILED`).
 */
export function resolveAuthError(
  code: string | undefined,
  fallbackMessage: string,
  language: PollarLanguage = 'en',
): ResolvedAuthError {
  const entry = code ? CATALOG[code] : undefined;
  if (entry) return { message: entry.message[language], errorCode: entry.errorCode };
  // Bucket an UNKNOWN code by its domain prefix so a transaction code isn't
  // mislabeled as a passkey failure.
  const errorCode =
    code && (code.startsWith('TX_') || code.startsWith('SDK_TX_'))
      ? AUTH_ERROR_CODES.TX_FAILED
      : AUTH_ERROR_CODES.PASSKEY_FAILED;
  return { message: fallbackMessage, errorCode };
}

/** The catalog's text for a backend error `code`, so a modal can show it in its own language; null for an unknown code. */
export function authErrorMessage(code: string | undefined, language: PollarLanguage): string | null {
  return (code && CATALOG[code]?.message[language]) || null;
}

/**
 * Extracts the backend error `code` from an openapi-fetch result. On a non-2xx
 * response the body lands in `error`; some endpoints also return a code in a
 * 200 `data` body with `success: false`.
 */
export function extractErrorCode(error: unknown, data: unknown): string | undefined {
  return stringField(error, 'code') ?? stringField(data, 'code');
}
