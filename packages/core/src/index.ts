export { PollarClient } from './client/client';

// ─── Storage ──────────────────────────────────────────────────────────────────
export type { Storage, OnStorageDegrade, StorageDegradeReason } from './storage/types';
export { defaultStorage } from './storage/autodetect';
export { createLocalStorageAdapter, createMemoryAdapter } from './storage/web';
export type { LocalStorageAdapterOptions } from './storage/web';

// ─── KeyManager + DPoP ────────────────────────────────────────────────────────
export type { KeyManager, PublicEcJwk } from './keys/types';
export { defaultKeyManager } from './keys/autodetect';
export { WebCryptoKeyManager } from './keys/web-crypto';
export { NobleKeyManager } from './keys/noble';
export { computeJwkThumbprint, canonicalEcJwk } from './keys/thumbprint';
export { buildProof, normalizeHtu } from './dpop';
export type { BuildProofArgs } from './dpop';

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
