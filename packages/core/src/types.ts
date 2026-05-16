import type { KeyManager } from './keys/types';
import type { OnStorageDegrade, Storage } from './storage/types';
import { pollarPaths, StellarNetwork } from './index';
import { WalletAdapterResolver, WalletId } from './wallets';

export type PollarApplicationConfigResponse =
  pollarPaths['/auth/login']['post']['responses'][200]['content']['application/json'];
/** Full `/auth/login` response shape — used in transit but NOT persisted. */
export type PollarApplicationConfigContent = PollarApplicationConfigResponse['content'];

/**
 * What we actually write to `Storage`. Drops the PII subtree (`data.*`)
 * which is held in memory only on `PollarClient._profile` after auth.
 */
export interface PollarPersistedSession {
  clientSessionId: string;
  userId: string | null;
  status: string;
  token: { accessToken: string; refreshToken: string; expiresAt: number };
  user: { id?: string; ready: boolean };
  wallet: { publicKey: string | null; existsOnStellar?: boolean; createdAt?: number };
}

/** In-memory user profile (kept on `PollarClient`, never persisted). */
export interface PollarUserProfile {
  mail: string;
  first_name: string;
  last_name: string;
  avatar: string;
  providers: {
    email: { address: string } | null;
    google: { id: string } | null;
    github: { id: string } | null;
    wallet: { address: string } | null;
  };
}

export interface PollarClientConfig {
  stellarNetwork?: StellarNetwork;
  baseUrl?: string;
  apiKey: string;
  /**
   * Pluggable storage. Defaults to `defaultStorage()` on web (localStorage
   * with memory fallback). On RN you must inject one of the adapters from
   * `@pollar/core/adapters/expo` or `@pollar/core/adapters/react-native-keychain`.
   */
  storage?: Storage;
  /**
   * Pluggable DPoP key manager. Defaults to `defaultKeyManager(storage,
   * apiKeyHash)`: WebCrypto in browsers, `@noble/curves` in RN.
   */
  keyManager?: KeyManager;
  /**
   * Notified when persistent storage silently degrades to in-memory mode
   * (Safari private browsing quota errors, sandboxed iframes, etc.). Useful
   * for telemetry — the SDK keeps working but sessions won't survive reload.
   */
  onStorageDegrade?: OnStorageDegrade;
  /**
   * Resolves a {@link WalletAdapter} for a given wallet id. If omitted, the
   * SDK falls back to its built-in `FreighterAdapter` / `AlbedoAdapter`,
   * which only know `WalletType.FREIGHTER` and `WalletType.ALBEDO`. Inject
   * `@pollar/stellar-wallets-kit-adapter` (or your own resolver) to support
   * additional wallets without bundling those dependencies into `@pollar/core`.
   */
  walletAdapter?: WalletAdapterResolver;
  /**
   * Optional human-friendly label sent at /auth/login time and recorded on
   * the server-side refresh-token row so the user can identify it in the
   * "active sessions" UI (e.g. "iPhone — Safari", "Mac — Chrome 126").
   * If unset, the server-recorded `user_agent` header is the fallback.
   */
  deviceLabel?: string;
}

/**
 * One row in the active-sessions list (returned by `PollarClient.listSessions()`).
 * Mirrors the sdk-api `SessionsListContent` schema.
 */
export interface SessionInfo {
  familyId: string;
  createdAt: string;
  lastUsedAt: string | null;
  userAgent: string | null;
  ipHash: string | null;
  deviceLabel: string | null;
  current: boolean;
  expiresAt: string;
}

export type TxBuildBody = NonNullable<pollarPaths['/tx/build']['post']['requestBody']>['content']['application/json'];
export type TxBuildResponse = pollarPaths['/tx/build']['post']['responses'][200]['content']['application/json'];

export type TxSignAndSendBody = NonNullable<
  pollarPaths['/tx/sign-and-send']['post']['requestBody']
>['content']['application/json'];
export type TxSignSendResponse = pollarPaths['/tx/sign-and-send']['post']['responses'][200]['content']['application/json'];

export type PollarLoginOptions =
  | { provider: 'google' }
  | { provider: 'github' }
  | { provider: 'email'; email: string }
  | { provider: 'wallet'; type: WalletId };

export type TxBuildContent = TxBuildResponse['content'];

export type TransactionState =
  | { step: 'idle' }
  | { step: 'building' }
  | { step: 'built'; buildData: TxBuildContent }
  | { step: 'signing'; buildData?: TxBuildContent; external?: true }
  | { step: 'success'; buildData?: TxBuildContent; hash: string; external?: true }
  | { step: 'error'; details?: string; buildData?: TxBuildContent; external?: true };

export const AUTH_ERROR_CODES = {
  SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  EMAIL_VERIFY_FAILED: 'EMAIL_VERIFY_FAILED',
  EMAIL_CODE_EXPIRED: 'EMAIL_CODE_EXPIRED',
  EMAIL_CODE_INVALID: 'EMAIL_CODE_INVALID',
  AUTH_FAILED: 'AUTH_FAILED',
  WALLET_CONNECT_FAILED: 'WALLET_CONNECT_FAILED',
  WALLET_AUTH_FAILED: 'WALLET_AUTH_FAILED',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export type AuthState =
  | { step: 'idle' }
  | { step: 'creating_session' }
  | { step: 'entering_email'; clientSessionId: string }
  | { step: 'sending_email'; email: string }
  | { step: 'entering_code'; clientSessionId: string; email: string }
  | { step: 'verifying_email_code'; clientSessionId: string; email: string }
  | { step: 'opening_oauth'; provider: 'google' | 'github' }
  | { step: 'connecting_wallet'; walletType: WalletId }
  | { step: 'wallet_not_installed'; walletType: WalletId }
  | { step: 'authenticating_wallet' }
  | { step: 'authenticating' }
  | { step: 'authenticated'; session: PollarPersistedSession }
  | {
      step: 'error';
      previousStep: string;
      message: string;
      errorCode: AuthErrorCode;
      clientSessionId?: string;
      email?: string;
    };

export type NetworkState = { step: 'idle' } | { step: 'connected'; network: StellarNetwork };

export class PollarFlowError extends Error {
  readonly code = 'INVALID_FLOW' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PollarFlowError';
  }
}

// ─── Wallet balance types ─────────────────────────────────────────────────────

export type WalletBalanceContent =
  pollarPaths['/wallet/balance']['get']['responses'][200]['content']['application/json']['content'];
export type WalletBalanceRecord = WalletBalanceContent['balances'][number];

export type WalletBalanceState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; data: WalletBalanceContent }
  | { step: 'error'; message: string };

// ─── Tx history types ─────────────────────────────────────────────────────────

export type TxHistoryRecord =
  pollarPaths['/tx/history']['get']['responses'][200]['content']['application/json']['content']['records'][number];

export type TxHistoryParams = NonNullable<pollarPaths['/tx/history']['get']['parameters']['query']>;

export type TxHistoryContent =
  pollarPaths['/tx/history']['get']['responses'][200]['content']['application/json']['content'];

export type TxHistoryState =
  | { step: 'idle' }
  | { step: 'loading'; params: TxHistoryParams }
  | { step: 'loaded'; params: TxHistoryParams; data: TxHistoryContent }
  | { step: 'error'; params: TxHistoryParams; message: string };

// ─── KYC types ────────────────────────────────────────────────────────────────

export type KycLevel = 'basic' | 'intermediate' | 'enhanced';
export type KycStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type KycFlow = 'iframe' | 'form' | 'redirect';

export type KycProvider =
  pollarPaths['/kyc/providers']['get']['responses'][200]['content']['application/json']['content']['providers'][number];
export type KycStartBody = NonNullable<pollarPaths['/kyc/start']['post']['requestBody']>['content']['application/json'];
export type KycStartResponse = pollarPaths['/kyc/start']['post']['responses'][200]['content']['application/json']['content'];

// ─── Ramps types ──────────────────────────────────────────────────────────────

export type RampsQuoteQuery = NonNullable<pollarPaths['/ramps/quote']['get']['parameters']['query']>;
export type RampQuote =
  pollarPaths['/ramps/quote']['get']['responses'][200]['content']['application/json']['content']['quotes'][number];
export type RampsQuoteResponse = pollarPaths['/ramps/quote']['get']['responses'][200]['content']['application/json']['content'];

export type RampsOnrampBody = NonNullable<pollarPaths['/ramps/onramp']['post']['requestBody']>['content']['application/json'];
export type RampsOnrampResponse =
  pollarPaths['/ramps/onramp']['post']['responses'][200]['content']['application/json']['content'];

export type RampsOfframpBody = NonNullable<pollarPaths['/ramps/offramp']['post']['requestBody']>['content']['application/json'];
export type RampsOfframpResponse =
  pollarPaths['/ramps/offramp']['post']['responses'][200]['content']['application/json']['content'];

export type RampsTransactionResponse =
  pollarPaths['/ramps/transaction/{txId}']['get']['responses'][200]['content']['application/json']['content'];
export type RampTxStatus = RampsTransactionResponse['status'];
export type RampDirection = RampsTransactionResponse['direction'];
export type PaymentInstructions = RampsOnrampResponse['paymentInstructions'];

// ─── Distribution types ───────────────────────────────────────────────────────

export type DistributionRule =
  pollarPaths['/distribution/rules']['get']['responses'][200]['content']['application/json']['content']['rules'][number];

export type RulePeriod = DistributionRule['period'];

export type DistributionClaimBody = NonNullable<
  pollarPaths['/distribution/claim']['post']['requestBody']
>['content']['application/json'];

export type DistributionClaimContent =
  pollarPaths['/distribution/claim']['post']['responses'][200]['content']['application/json']['content'];

export type DistributionRulesState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; rules: DistributionRule[] }
  | { step: 'error'; message: string };

// ─── Adapter types ────────────────────────────────────────────────────────────

export type AdapterFn<TParams = unknown> = (params: TParams) => Promise<{ unsignedTransaction: string }>;

export type PollarAdapter = Record<string, AdapterFn<any>>;

export interface PollarAdapters {
  [key: string]: PollarAdapter;
}
