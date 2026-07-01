// Shared exports re-used by both entry points (`index.ts` for web, `index.rn.ts`
// for React Native). Platform-specific bits (registering the default
// `KeyManager` factory, exporting `NobleKeyManager`) live in those entry
// modules so bundlers can tree-shake unused code paths.

export { PollarClient } from './client/client';
export { POLLAR_CORE_VERSION } from './version';
export { createLogger } from './lib/logger';
export type { LogLevel, PollarLogger } from './lib/logger';

// ─── Storage ──────────────────────────────────────────────────────────────────
export type { Storage, OnStorageDegrade, StorageDegradeReason } from './storage/types';
export { defaultStorage } from './storage/autodetect';
export { createLocalStorageAdapter, createMemoryAdapter } from './storage/web';
export type { LocalStorageAdapterOptions } from './storage/web';

// ─── KeyManager + DPoP ────────────────────────────────────────────────────────
export type { KeyManager, PublicEcJwk } from './keys/types';
export { defaultKeyManager } from './keys/factory';
export { WebCryptoKeyManager } from './keys/web-crypto';
export { computeJwkThumbprint, canonicalEcJwk } from './keys/thumbprint';
export { buildProof, normalizeHtu } from './dpop';
export type { BuildProofArgs } from './dpop';

export { FreighterAdapter, AlbedoAdapter, WalletType, isInteractiveAuthAdapter } from './wallets';
export type {
  WalletAdapter,
  WalletAdapterMeta,
  WalletId,
  ConnectWalletResponse,
  SignTransactionOptions,
  SignTransactionResponse,
  SignAuthEntryOptions,
  SignAuthEntryResponse,
  AuthOption,
  InteractiveAuthAdapter,
  ProviderAuthState,
} from './wallets';
export type * from './types';
export { AUTH_ERROR_CODES, PollarNetworkError, isPollarNetworkError } from './types';
export { PollarApiClient } from './api/client';
export type { paths as pollarPaths } from './api/schema';
export { isValidSession } from './client/session';
export { StellarClient } from './stellar/StellarClient';
export type { StellarNetwork, StellarClientConfig, StellarBalance } from './stellar/StellarClient';

// ─── KYC endpoints ────────────────────────────────────────────────────────────
export { getKycStatus, getKycProviders, startKyc, resolveKyc, pollKycStatus } from './api/endpoints/kyc';

// ─── Ramps endpoints ──────────────────────────────────────────────────────────
export {
  getRampsQuote,
  createOnRamp,
  createOffRamp,
  completeWithdraw,
  submitRampSignature,
  getRampTransaction,
  pollRampTransaction,
} from './api/endpoints/ramps';

// ─── Distribution endpoints ───────────────────────────────────────────────────
export { listDistributionRules, claimDistributionRule } from './api/endpoints/distribution';

// ─── Swap endpoints ───────────────────────────────────────────────────────────
export { quoteSwap, getSwapConfig } from './api/endpoints/swap';
