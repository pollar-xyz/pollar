import { RampChain } from '../types';

/** Reject unknown or incorrectly cased values without silently changing their meaning. */
export function assertRampChain(value: unknown): asserts value is RampChain {
  if (value !== RampChain.STELLAR && value !== RampChain.POLYGON && value !== RampChain.SOLANA)
    throw new Error('Unsupported ramp chain. Expected STELLAR, POLYGON or SOLANA.');
}
