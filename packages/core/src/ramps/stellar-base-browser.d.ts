declare module '@stellar/stellar-base/dist/stellar-base.min.js' {
  export const TransactionBuilder: typeof import('@stellar/stellar-base').TransactionBuilder;
  export const Networks: typeof import('@stellar/stellar-base').Networks;
  export const extractBaseAddress: typeof import('@stellar/stellar-base').extractBaseAddress;
  export const FeeBumpTransaction: typeof import('@stellar/stellar-base').FeeBumpTransaction;
}
