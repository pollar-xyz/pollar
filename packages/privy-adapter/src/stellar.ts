import { FeeBumpTransaction, Keypair, Networks, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import type { StellarNetwork } from './types';

const passphraseFor = (network: StellarNetwork): string => (network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET);

export const parseTx = (txXdr: string, network: StellarNetwork): Transaction => {
  const tx = TransactionBuilder.fromXDR(txXdr, passphraseFor(network));
  if (tx instanceof FeeBumpTransaction) {
    throw new Error('Fee-bump transactions are not supported by this adapter');
  }
  return tx;
};

/**
 * Operation types implied by `restrictToTrustlines`: a `changeTrust` plus the
 * optional reserve-sponsorship sandwich that wraps it.
 */
export const TRUSTLINE_OPERATION_ALLOWLIST = [
  'changeTrust',
  'beginSponsoringFutureReserves',
  'endSponsoringFutureReserves',
] as const;

export interface OperationPolicy {
  allowedOperations?: string[] | undefined;
  restrictToTrustlines?: boolean | undefined;
}

export interface OperationValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Enforces the configured operation allowlist on a parsed transaction.
 *
 * Precedence:
 *  - If neither field is set → no restriction (legacy behavior): `{ ok: true }`.
 *  - `allowedOperations` (when set) is the base allowlist of stellar-sdk
 *    operation type names.
 *  - `restrictToTrustlines: true` adds the trustline preset
 *    (`TRUSTLINE_OPERATION_ALLOWLIST`) to the allowlist — so the effective set is
 *    the UNION of `allowedOperations` and the preset — and additionally requires
 *    the transaction to contain at least one `changeTrust` operation.
 *
 * Returns `{ ok: false, reason }` on the first violation; `reason` is safe to
 * surface to the caller (it names only the offending operation type).
 */
export const validateTxOperations = (tx: Transaction, policy: OperationPolicy): OperationValidation => {
  const restrict = policy.restrictToTrustlines === true;

  // No allowlist configured at all → legacy: sign any (non-fee-bump) tx.
  if (!restrict && !policy.allowedOperations) {
    return { ok: true };
  }

  const allowed = new Set<string>(policy.allowedOperations ?? []);
  if (restrict) {
    for (const op of TRUSTLINE_OPERATION_ALLOWLIST) allowed.add(op);
  }

  for (const op of tx.operations) {
    if (!allowed.has(op.type)) {
      return { ok: false, reason: `Operation '${op.type}' is not allowed` };
    }
  }

  if (restrict && !tx.operations.some((op) => op.type === 'changeTrust')) {
    return { ok: false, reason: 'Transaction must contain at least one changeTrust operation' };
  }

  return { ok: true };
};

export const assembleSignedXdr = (tx: Transaction, walletAddress: string, signatureBytes: Buffer): string => {
  const keypair = Keypair.fromPublicKey(walletAddress);
  const decorated = new xdr.DecoratedSignature({
    hint: keypair.signatureHint(),
    signature: signatureBytes,
  });
  tx.signatures.push(decorated);
  return tx.toEnvelope().toXDR('base64');
};
