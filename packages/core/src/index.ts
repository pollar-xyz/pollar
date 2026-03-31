export { PollarClient } from './client/client';
export { FreighterAdapter, AlbedoAdapter, WalletType } from './wallets';
export type {
  WalletAdapter,
  ConnectWalletResponse,
  SignTransactionOptions,
  SignTransactionResponse,
  SignAuthEntryOptions,
  SignAuthEntryResponse,
} from './wallets';
export type * from './types';
export { AUTH_ERROR_CODES } from './types';
export { PollarApiClient } from './api/client';
export type { paths as pollarPaths } from './api/schema';
export { isValidSession } from './client/session';
export { StellarClient } from './stellar/StellarClient';
export type { StellarNetwork, StellarClientConfig, StellarBalance } from './stellar/StellarClient';

// ─── KYC endpoints ────────────────────────────────────────────────────────────
export { getKycStatus, getKycProviders, startKyc, resolveKyc, pollKycStatus } from './api/endpoints/kyc';

// ─── Ramps endpoints ──────────────────────────────────────────────────────────
export { getRampsQuote, createOnRamp, createOffRamp, getRampTransaction, pollRampTransaction } from './api/endpoints/ramps';
