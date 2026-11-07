import type { AuthEntryAdapterOutcome, AuthEntryAdapterStep, SignAuthEntryOutcome } from './types';

/** Whether an adapter answered with an auth entry to sign rather than a transaction. */
export function isAuthEntryAdapterStep(value: unknown): value is AuthEntryAdapterStep<any> {
  const v = value as Partial<AuthEntryAdapterStep> | null;
  return typeof v?.unsignedAuthEntry === 'string' && typeof v.validUntilLedger === 'number' && typeof v.complete === 'function';
}

/** Sign the step's entry, then hand it to the adapter; a refusal or a pending vote ends the call there. */
export async function completeAuthEntryStep<TResult>(
  step: AuthEntryAdapterStep<TResult>,
  signAuthEntry: (entryXdr: string, options: { validUntilLedger: number }) => Promise<SignAuthEntryOutcome>,
): Promise<AuthEntryAdapterOutcome<TResult>> {
  const outcome = await signAuthEntry(step.unsignedAuthEntry, { validUntilLedger: step.validUntilLedger });
  if (outcome.status !== 'signed') return outcome;
  return { status: 'completed', result: await step.complete(outcome.signedAuthEntry) };
}
