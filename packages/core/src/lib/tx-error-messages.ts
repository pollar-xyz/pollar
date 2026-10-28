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

const MESSAGES: Record<string, string> = {
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
  SDK_COSIGN_CUSTODY_SWITCH_PENDING: 'Finish or cancel the pending approvals before changing how this wallet is secured.',
  SDK_COSIGN_CUSTODY_SWITCH_NOT_ALLOWED: "This app doesn't let you change how your wallet is secured.",
  SDK_COSIGN_PASSKEY_UNAVAILABLE: "Passkeys aren't available on this device.",
  SDK_CREDITS_INSUFFICIENT: APP_UNAVAILABLE_MESSAGE,
  SDK_BILLING_OVERDUE: APP_UNAVAILABLE_MESSAGE,
};

const GENERIC = 'Something went wrong. Please try again.';

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

export function transactionErrorMessage(code?: string | null, details?: string | null): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (details && MESSAGES[details]) return MESSAGES[details];
  const onChain = onChainErrorCode(code, details);
  if (onChain && MESSAGES[onChain]) return MESSAGES[onChain];
  if (details && !CODE_LIKE.test(details.trim())) return details;
  return GENERIC;
}

/**
 * The text for the wallet provider refusing a request (`SDK_COSIGN_TURNKEY_REJECTED`),
 * with the provider's own reason when it gave one; null for any other error.
 */
const EMPTY_DETAILS = '(Details: [])';

export function cosignRefusalMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'SDK_COSIGN_TURNKEY_REJECTED')
    return null;
  const body = 'body' in error && typeof error.body === 'object' && error.body !== null ? error.body : null;
  const raw = body && 'message' in body && typeof body.message === 'string' ? body.message : '';
  let reason = raw.replace(/^Turnkey error \d+:\s*/i, '').trimEnd();
  if (reason.endsWith(EMPTY_DETAILS)) reason = reason.slice(0, -EMPTY_DETAILS.length);
  reason = reason.trim();
  return reason ? `The wallet provider refused the request: ${reason}.` : (MESSAGES.SDK_COSIGN_TURNKEY_REJECTED ?? GENERIC);
}

/** The text for an error the user cannot fix and the app must (402: out of credits or an overdue bill); null for any other error. */
export function appUnavailableMessage(error: unknown): string | null {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return code === 'SDK_CREDITS_INSUFFICIENT' || code === 'SDK_BILLING_OVERDUE' ? (MESSAGES[code] ?? null) : null;
}
