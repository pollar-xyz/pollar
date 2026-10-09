import { RampChain, type RampRoute, type RampTerms, type RampsTransactionResponse } from '../types';

/** Reject unknown or incorrectly cased values without silently changing their meaning. */
export function assertRampChain(value: unknown): asserts value is RampChain {
  if (value !== RampChain.STELLAR && value !== RampChain.POLYGON && value !== RampChain.SOLANA)
    throw new Error('Unsupported ramp chain. Expected STELLAR, POLYGON or SOLANA.');
}

export function assertRampRouteChain(route: RampRoute): void {
  assertRampChain(route.asset.chain);
}

export function assertRampTermsChain(terms: RampTerms): void {
  assertRampChain(terms.assetChain);
}

/** Validate only contract fields; user-provided form values may have arbitrary names. */
export function checkedRampSnapshot<T extends Pick<RampsTransactionResponse, 'chain' | 'terms' | 'nextAction'>>(
  snapshot: T,
): T {
  if (snapshot.chain !== undefined) assertRampChain(snapshot.chain);
  if (snapshot.terms) assertRampTermsChain(snapshot.terms);
  const action = snapshot.nextAction;
  if (action?.kind === 'sign_transaction' || action?.kind === 'chain_transfer') assertRampChain(action.chain);
  if (action?.kind === 'chain_transfer') assertRampChain(action.asset.chain);
  return snapshot;
}
