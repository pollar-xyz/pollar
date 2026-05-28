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

export const assembleSignedXdr = (tx: Transaction, walletAddress: string, signatureBytes: Buffer): string => {
  const keypair = Keypair.fromPublicKey(walletAddress);
  const decorated = new xdr.DecoratedSignature({
    hint: keypair.signatureHint(),
    signature: signatureBytes,
  });
  tx.signatures.push(decorated);
  return tx.toEnvelope().toXDR('base64');
};
