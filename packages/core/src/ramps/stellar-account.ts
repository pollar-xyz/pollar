import type { RampSigningAction } from './workflow';

/** Bind a built-in Stellar signing request to the connected account before opening its signer. */
export async function assertRampStellarAccount(action: RampSigningAction, address: string): Promise<void> {
  // The browser distribution includes its own Buffer/XDR implementation, including on native.
  const { TransactionBuilder, Networks, extractBaseAddress, FeeBumpTransaction } =
    await import('@stellar/stellar-base/dist/stellar-base.min.js');
  try {
    const envelope = TransactionBuilder.fromXDR(
      action.payload.value,
      action.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
    );
    const feeBump = envelope instanceof FeeBumpTransaction;
    const tx = feeBump ? envelope.innerTransaction : envelope;
    const account = extractBaseAddress(address);
    const matches = (source: string) => extractBaseAddress(source) === account;
    if (action.purpose === 'authentication') {
      // SEP-10 uses the server as transaction source and the user's account on the first manageData operation.
      const first = tx.operations[0];
      if (
        feeBump ||
        tx.sequence !== '0' ||
        first?.type !== 'manageData' ||
        !first.source ||
        !matches(first.source) ||
        tx.operations.slice(1).some((op) => op.type !== 'manageData' || (op.source && op.source !== tx.source))
      )
        throw new Error('Invalid authentication account');
    } else if (!matches(tx.source) || tx.operations.some((op) => !matches(op.source ?? tx.source))) {
      throw new Error('Invalid transaction account');
    }
  } catch {
    throw new Error('Connect the wallet account required by this ramp action.');
  }
}
