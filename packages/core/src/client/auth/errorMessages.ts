import { AUTH_ERROR_CODES, type AuthErrorCode } from '../../types';

/**
 * Maps a backend error `code` (the `ErrorCode` enum returned by sdk-api /
 * wallet-service in `{ code, success: false }`) to a user-facing message and
 * the SDK's coarse `AuthErrorCode` bucket.
 *
 * The backend stays code-only by design — this catalog is the single place the
 * SDK turns those codes into human-readable English. Consumers that need i18n
 * can switch on `state.errorCode` (the bucket) or the raw `code` instead of the
 * message string.
 */
interface ResolvedAuthError {
  message: string;
  errorCode: AuthErrorCode;
}

const CATALOG: Record<string, ResolvedAuthError> = {
  // ── Smart-account deploy / sponsor wallet ──────────────────────────────────
  SPONSOR_NOT_FUNDED: {
    message: "This app can't create your wallet yet — its sponsor account isn't funded. Please contact the app's developer.",
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  APP_WALLET_NOT_FOUND: {
    message: "This app isn't fully set up to create wallets yet. Please contact the app's developer.",
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  WALLET_NOT_FOUND: {
    message: "This app isn't fully set up to create wallets yet. Please contact the app's developer.",
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  PASSKEY_DEPLOY_FAILED: {
    message: "We couldn't finish creating your wallet. Please try again in a moment.",
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },

  // ── Passkey ceremony ────────────────────────────────────────────────────────
  PASSKEY_ALREADY_REGISTERED: {
    message: 'A passkey is already registered for this account. Try signing in instead.',
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  PASSKEY_UNKNOWN_CREDENTIAL: {
    message: "We don't recognize this passkey. Try creating a new one.",
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  PASSKEY_VERIFICATION_FAILED: {
    message: "We couldn't verify your passkey. Please try again.",
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },
  PASSKEY_CHALLENGE_MISSING: {
    message: 'Your passkey session expired. Please start again.',
    errorCode: AUTH_ERROR_CODES.PASSKEY_FAILED,
  },

  // ── On-chain transaction failures (surfaced during deploy/transfer) ─────────
  // These map to the TX_FAILED bucket (not PASSKEY_FAILED) — the precise reason
  // is the entry key itself, surfaced as the raw `code` on the tx outcome.
  TX_INSUFFICIENT_BALANCE: {
    message: 'Insufficient balance to complete this transaction.',
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_INSUFFICIENT_FEE: {
    message: 'Not enough XLM to cover the network fee. Add more XLM to your wallet and try again.',
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_FEE_LIMIT_EXCEEDED: {
    message: 'The transaction fee is above the allowed limit. Please try again.',
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_CONTRACT_FAILED: {
    message: 'The contract rejected this operation. Check the operation is allowed right now and try again.',
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_DESTINATION_NOT_FOUND: {
    message: "The destination account doesn't exist on the network yet.",
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_NO_TRUSTLINE: {
    message: "The destination can't receive this asset yet (no trustline).",
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
  TX_BAD_SEQUENCE: {
    message: 'Something went out of sync. Please try again.',
    errorCode: AUTH_ERROR_CODES.TX_FAILED,
  },
};

/**
 * Resolves a backend error `code` to a friendly message + bucket. Falls back to
 * the supplied default message when the code is unknown or absent, bucketing by
 * the code's domain prefix (`TX_`/`SDK_TX_` → `TX_FAILED`, else `PASSKEY_FAILED`).
 */
export function resolveAuthError(code: string | undefined, fallbackMessage: string): ResolvedAuthError {
  if (code && CATALOG[code]) return CATALOG[code];
  // Bucket an UNKNOWN code by its domain prefix so a transaction code isn't
  // mislabeled as a passkey failure (the historical default).
  const errorCode =
    code && (code.startsWith('TX_') || code.startsWith('SDK_TX_'))
      ? AUTH_ERROR_CODES.TX_FAILED
      : AUTH_ERROR_CODES.PASSKEY_FAILED;
  return { message: fallbackMessage, errorCode };
}

/**
 * Extracts the backend error `code` from an openapi-fetch result. On a non-2xx
 * response the body lands in `error`; some endpoints also return a code in a
 * 200 `data` body with `success: false`.
 */
export function extractErrorCode(error: unknown, data: unknown): string | undefined {
  return (error as { code?: string } | undefined)?.code ?? (data as { code?: string } | undefined)?.code ?? undefined;
}
