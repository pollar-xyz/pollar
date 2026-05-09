import { TransactionBuilder, Networks, Keypair, xdr } from '@stellar/stellar-sdk';
import type { StellarNetwork } from './types';

const passphraseFor = (network: StellarNetwork): string =>
  network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

export const computeTxHash = (txXdr: string, network: StellarNetwork): Buffer => {
  const tx = TransactionBuilder.fromXDR(txXdr, passphraseFor(network));
  return tx.hash();
};

export const assembleSignedXdr = (
  txXdr: string,
  network: StellarNetwork,
  walletAddress: string,
  signatureBytes: Buffer,
): string => {
  const tx = TransactionBuilder.fromXDR(txXdr, passphraseFor(network));
  const keypair = Keypair.fromPublicKey(walletAddress);
  const decorated = new xdr.DecoratedSignature({
    hint: keypair.signatureHint(),
    signature: signatureBytes,
  });
  tx.signatures.push(decorated);
  return tx.toEnvelope().toXDR('base64');
};
