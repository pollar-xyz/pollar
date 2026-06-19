/**
 * SEP-10 challenge sanity-check — pure JS, ZERO external dependencies.
 *
 * Hardening for the wallet-login flow: before asking the user's wallet to sign
 * the server's "challenge transaction", we cheaply verify it actually looks like
 * a SEP-10 challenge and not a real, submittable transaction smuggled in by a
 * compromised or MITM'd challenge endpoint.
 *
 * The single most important invariant — and the one this checks — is
 * `sequenceNumber === 0`. A genuine SEP-10 challenge ALWAYS has sequence 0, so it
 * can never be applied to the ledger; a non-zero sequence means it's a live
 * transaction that, once signed, could authorize a real operation. Asserting
 * seq == 0 blocks the most dangerous class of "sign this to log in" attacks.
 *
 * This is deliberately NOT a full SEP-10 verification: it does not check the
 * server signature, home domain, or operation source — that would need a full
 * XDR + crypto library (`@stellar/stellar-base`). The real security boundary
 * remains the server-side `verifyChallengeTxSigners`; this is client-side
 * defense-in-depth, kept dependency-free on purpose.
 *
 * ── Why hand-parsing is safe here ────────────────────────────────────────────
 * The field we read (the transaction `seqNum`) sits at a fixed offset because it
 * comes right after the transaction SOURCE account, which in a SEP-10 challenge
 * is always the SERVER's account: a plain ed25519 G-address. It is never muxed
 * (M-address) and never a contract (C-address) — the user's account appears only
 * as the source of the inner `manageData` operation, which we never touch. So
 * the byte layout up to `seqNum` is fixed. Anything that does NOT match the
 * expected shape — a muxed source, a fee-bump envelope, truncated bytes — makes
 * this return `false`: it FAILS CLOSED and the challenge is rejected before the
 * user can sign it.
 *
 * Smart-account (C-address / passkey) logins do NOT use this SEP-10 path at all
 * (they use the passkey flow), so this check never runs for them.
 *
 * XDR layout (all integers big-endian). `TransactionEnvelope` is an XDR union
 * over `EnvelopeType`:
 *
 *   v1  (ENVELOPE_TYPE_TX = 2):
 *     [envelopeType u32=2][MuxedAccount source][fee u32][seqNum i64] …
 *     MuxedAccount = [keyType u32][…]; KEY_TYPE_ED25519 (0) → 32-byte key.
 *     seqNum offset = 4 (env) + 4 (keyType) + 32 (key) + 4 (fee) = 44.
 *
 *   v0  (ENVELOPE_TYPE_TX_V0 = 0):
 *     [envelopeType u32=0][ed25519 32 (raw, no keyType)][fee u32][seqNum i64] …
 *     seqNum offset = 4 (env) + 32 (key) + 4 (fee) = 40.
 */
import { base64urlDecode } from '../../lib/base64url';

const ENVELOPE_TYPE_TX_V0 = 0;
const ENVELOPE_TYPE_TX = 2;
const KEY_TYPE_ED25519 = 0;

// seqNum byte offsets (see layout above).
const SEQ_OFFSET_V1 = 44;
const SEQ_OFFSET_V0 = 40;

/** Decode standard base64 (`+/`, padded) to bytes via the pure-JS base64url decoder. */
function base64ToBytes(b64: string): Uint8Array {
  // Remap the standard alphabet onto url-safe; padding `=` is stripped by the decoder.
  return base64urlDecode(b64.replace(/\+/g, '-').replace(/\//g, '_'));
}

/** True iff `view` holds a zero 64-bit big-endian int at `offset` (no BigInt; RN-safe). */
function isI64Zero(view: DataView, offset: number): boolean {
  return view.getUint32(offset, false) === 0 && view.getUint32(offset + 4, false) === 0;
}

/**
 * Returns `true` only if `challengeXdr` parses as a SEP-10 challenge transaction
 * with `sequenceNumber === 0` and the expected (ed25519 server source) envelope
 * shape. Any parse error or unexpected structure returns `false` (fail closed),
 * so the caller can safely refuse to sign.
 */
export function isValidSep10Challenge(challengeXdr: string): boolean {
  try {
    const bytes = base64ToBytes(challengeXdr.trim());
    // Need at least the discriminant + a MuxedAccount keyType to classify.
    if (bytes.length < 8) return false;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const envelopeType = view.getUint32(0, false);

    let seqOffset: number;
    if (envelopeType === ENVELOPE_TYPE_TX) {
      // v1: source is a MuxedAccount — require a plain ed25519 key (reject muxed).
      if (view.getUint32(4, false) !== KEY_TYPE_ED25519) return false;
      seqOffset = SEQ_OFFSET_V1;
    } else if (envelopeType === ENVELOPE_TYPE_TX_V0) {
      // v0: raw 32-byte ed25519 source, no key-type prefix.
      seqOffset = SEQ_OFFSET_V0;
    } else {
      // Fee-bump or anything else is never a SEP-10 challenge.
      return false;
    }

    if (bytes.length < seqOffset + 8) return false;
    return isI64Zero(view, seqOffset);
  } catch {
    return false;
  }
}
