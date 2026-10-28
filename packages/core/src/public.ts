// Shared exports re-used by both entry points (`index.ts` for web, `index.rn.ts`
// for React Native). Platform-specific bits (registering the default
// `KeyManager` factory, exporting `NobleKeyManager`) live in those entry
// modules so bundlers can tree-shake unused code paths.

export { PollarClient, isPollarClient } from './client/client';
export * from './ramps/index';
export { POLLAR_CORE_VERSION } from './version';
export { createLogger } from './lib/logger';
export { toBaseUnits, fromBaseUnits } from './lib/units';
export { appUnavailableMessage, cosignRefusalMessage, transactionErrorMessage } from './lib/tx-error-messages';
export { authErrorMessage } from './client/auth/errorMessages';
export type { LogLevel, PollarLogger } from './lib/logger';
export { languageFromTag, localizedText, resolveLanguage } from './lib/language';
export type { PollarLanguage } from './lib/language';

// --- Storage ------------------------------------------------------------------
export type { Storage, OnStorageDegrade, StorageDegradeReason } from './storage/types';
export { defaultStorage } from './storage/autodetect';
export { createLocalStorageAdapter, createMemoryAdapter } from './storage/web';
export type { LocalStorageAdapterOptions } from './storage/web';

// --- KeyManager + DPoP --------------------------------------------------------
export type { KeyManager, KeyManagerOptions, PublicEcJwk } from './keys/types';
export { defaultKeyManager } from './keys/factory';
export { WebCryptoKeyManager } from './keys/web-crypto';
export { computeJwkThumbprint, canonicalEcJwk } from './keys/thumbprint';
export { buildProof, normalizeHtu } from './dpop';

// --- Turnkey co-signed wallets ---------------------------------------------
export { CosignManager } from './cosign/manager';
export { compressedPublicKeyHex, rawSignatureToDer, encodeStamp } from './cosign/encoding';
export { stellarTransactionHashHex } from './cosign/stellar-hash';
export { recognizedSetupRequest, stellarAccountBytes } from './cosign/recognize';
export type { SetupRecognition } from './cosign/recognize';
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
  SignMessageOptions,
  SignMessageResponse,
  SolanaSignInInput,
  SolanaSignInOutput,
  SolanaSignMessageResponse,
  AuthOption,
  InteractiveAuthAdapter,
  ProviderAuthState,
} from './wallets';
export type * from './types';
export {
  AUTH_ERROR_CODES,
  PollarFlowError,
  PollarNetworkError,
  isPollarNetworkError,
  PollarApiError,
  isPollarApiError,
} from './types';
export { RampChain } from './types';
export { WALLET_NOT_READY_CODE, isWalletNotReady, WALLET_REQUIRED_CODE, isWalletRequired } from './types';
export { PollarApiClient } from './api/client';
export type { paths as pollarPaths } from './api/schema';
export { isValidSession } from './client/session';
export { StellarClient } from './stellar/StellarClient';
export { createAuthEntrySigner } from './stellar/auth-entry-signer';
export { completeAuthEntryStep, isAuthEntryAdapterStep } from './adapter-steps';
export type { StellarNetwork, StellarClientConfig, StellarBalance } from './stellar/StellarClient';

// --- KYC endpoints ------------------------------------------------------------
export { getKycStatus, getKycProviders, startKyc, resolveKyc, pollKycStatus, pollKycDecision } from './api/endpoints/kyc';
export {
  getAppRequirements,
  getRequirementForm,
  submitRequirementForm,
  getRegistryCheck,
  submitRegistryCheck,
  getProviderRegistration,
  submitProviderRegistration,
} from './api/endpoints/requirements';

// --- Ramps endpoints ----------------------------------------------------------
export {
  getRampRoutes,
  quoteRamp,
  createRampOrder,
  getRampOrder,
  listRampOrders,
  submitRampLegSignature,
  pollRampOrder,
  isRampOrderSettled,
} from './api/endpoints/ramps';

// --- Distribution endpoints ---------------------------------------------------
export { listDistributionRules, claimDistributionRule } from './api/endpoints/distribution';

// --- Swap endpoints -----------------------------------------------------------
export { quoteSwap, getSwapConfig, getSwapTokens } from './api/endpoints/swap';

// --- Earn endpoints -----------------------------------------------------------
export { getEarnProviders, getEarnOpportunities, getEarnPosition, buildEarnTx } from './api/endpoints/earn';

export {
  describeRampAction,
  rampCountries,
  rampFieldError,
  rampFieldValid,
  rampLegNote,
  rampLegStatus,
  rampLegTimeLeft,
  rampNextApproval,
  rampStepStatusText,
  rampStepTitle,
  rampOrderReceive,
  rampOrderResolutionText,
  rampOrderStopped,
  rampLegTitle,
  rampNoRouteText,
  rampQuoteFields,
  rampRailLabel,
  rampRequirementCopy,
  rampResolutionText,
  rampTrustlineAsset,
  rampTrustlineErrorText,
  rampWalletStep,
} from './ramps/workflow';
export type { RampSigningHandler, RampWalletStep } from './ramps/workflow';
export { assertRampStellarSigner } from './ramps/stellar-signing';
// --- Cards endpoints ----------------------------------------------------------
export {
  getCardProviders,
  getCardHolder,
  createCardHolder,
  submitCardKyc,
  getCardOccupations,
  getCards,
  issueCard,
  getCardBalance,
  getCardTransactions,
  getCardDepositAddresses,
  getCardSecretsPublicKey,
  getCardSecrets,
  createCardFunding,
  submitCardFundingSignature,
  getCardFunding,
  listCardFundings,
  getCardRequirements,
  getCardProviderRegistration,
  submitCardProviderRegistration,
} from './api/endpoints/cards';
export type { EncryptedCardSecrets } from './api/endpoints/cards';
export { createCardSecretsSession, openCardSecrets } from './lib/card-secrets';
export type { CardSecretsSession, CardSecretsEngine } from './lib/card-secrets';
