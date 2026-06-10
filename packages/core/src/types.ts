import { pollarPaths, StellarNetwork } from './index';
import type { KeyManager } from './keys/types';
import type { OnStorageDegrade, Storage } from './storage/types';
import type { VisibilityProvider } from './visibility/types';
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
   * Maximum time (ms) the SDK waits for a `walletAdapter` resolver to return.
   * Guards against a broken extension bridge (e.g. Freighter content-script
   * down) hanging the login flow forever. The resolver only constructs the
   * adapter object — it does NOT include the user-facing approval step — so
   * a few seconds is plenty. Defaults to 5000.
   */
  walletResolverTimeoutMs?: number;
  /**
   * Optional human-friendly label sent at /auth/login time and recorded on
   * the server-side refresh-token row so the user can identify it in the
   * "active sessions" UI (e.g. "iPhone — Safari", "Mac — Chrome 126").
   * If unset, the server-recorded `user_agent` header is the fallback.
   */
  deviceLabel?: string;
  /**
   * Foreground-detection signal for the silent-refresh scheduler. When the
   * app is hidden / backgrounded, scheduled refreshes are skipped (saves
   * network + sidesteps browser/RN background timer throttling); they run
   * the moment visibility comes back. Defaults to a web provider in the
   * browser (`visibilitychange` + BFCache + focus) and a noop elsewhere.
   * React Native consumers should inject an `AppState`-backed provider —
   * see TODO on `VisibilityProvider`.
   */
  visibilityProvider?: VisibilityProvider;
  /**
   * If set, the silent-refresh scheduler stops issuing proactive refreshes
   * after this many milliseconds of no client-side HTTP activity. The
   * session is not cleared — the next user action triggers a request that
   * either reuses a still-valid access token or hits 401 → reactive
   * refresh (transparent if the RT is still valid). Defaults to
   * `undefined` = refresh forever as long as the app is visible.
   */
  maxIdleMs?: number;
  /**
   * Strategy for opening the hosted OAuth URL during
   * `login({ provider: 'google' | 'github' })`. Defaults to a browser popup
   * on web. React Native consumers MUST provide one (typically wrapping
   * `expo-web-browser`'s `openAuthSessionAsync`), since `window.open` does
   * not exist there. The SDK still drives the rest of the flow by polling the
   * auth-session status, so the opener only needs to surface the URL — it does
   * NOT need to capture the redirect payload.
   */
  openAuthUrl?: AuthUrlOpener;
  /**
   * Value sent to the backend as `redirect_uri` for hosted OAuth (where the
   * provider returns the user afterwards). Defaults to `window.location.origin`
   * on web. On React Native set this to your app's deep link / scheme — the
   * same URL you pass to `WebBrowser.openAuthSessionAsync`.
   */
  oauthRedirectUri?: string;
}

/**
 * Strategy for opening the hosted OAuth URL. The SDK mints the per-login auth
 * session lazily inside `getUrl()` (call it once; the first call creates the
 * `clientSessionId` and returns the full URL, or `null` if session creation
 * failed). Open the resolved URL however the platform allows — a popup on web,
 * `WebBrowser.openAuthSessionAsync(url, redirectUri)` on React Native — and
 * resolve once the user-facing browser step is done or dismissed. You do NOT
 * need to capture the redirect payload: the SDK polls the auth-session status
 * until the backend marks it READY.
 */
export type AuthUrlOpener = (ctx: AuthOpenContext) => void | Promise<void>;

export interface AuthOpenContext {
  provider: 'google' | 'github';
  /**
   * Mints the auth session (once) and returns the full hosted-OAuth URL, or
   * `null` if session creation failed. On web, call it AFTER reserving the
   * popup window so popup blockers (which only honor `window.open` inside the
   * original user-gesture tick) don't swallow it.
   */
  getUrl: () => Promise<string | null>;
  /** The redirect target passed to the backend as `redirect_uri`. */
  redirectUri: string;
  signal: AbortSignal;
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

// ─── Split flow (new in v0.7.2) ───────────────────────────────────────────────

export type TxSignBody = NonNullable<pollarPaths['/tx/sign']['post']['requestBody']>['content']['application/json'];
export type TxSignResponse = pollarPaths['/tx/sign']['post']['responses'][200]['content']['application/json'];
export type TxSignContent = TxSignResponse['content'];

export type TxSubmitSignedBody = NonNullable<pollarPaths['/tx/submit']['post']['requestBody']>['content']['application/json'];

export type TxBuildSignSubmitBody = NonNullable<
  pollarPaths['/tx/build-sign-submit']['post']['requestBody']
>['content']['application/json'];
export type TxBuildSignSubmitResponse =
  pollarPaths['/tx/build-sign-submit']['post']['responses'][200]['content']['application/json'];
export type TxBuildSignSubmitContent = TxBuildSignSubmitResponse['content'];

export type PollarLoginOptions =
  | { provider: 'google' }
  | { provider: 'github' }
  | { provider: 'email'; email: string }
  | { provider: 'wallet'; type: WalletId };

export type TxBuildContent = TxBuildResponse['content'];

/**
 * Phases the SDK can be in across the build → sign → submit lifecycle.
 *
 * **Granular** steps (`building`, `signing`, `submitting`) are emitted when
 * the SDK can directly observe that phase — i.e. when each is a separate
 * client-driven call (`buildTx`, `signTx`, `submitTx`, external-wallet
 * `signAndSubmitTx`).
 *
 * **Compound** steps (`signing-submitting`, `building-signing-submitting`)
 * are emitted when multiple phases collapse into a single opaque backend
 * round-trip (`signAndSubmitTx` custodial → `/tx/sign-and-send`, and `runTx`
 * / `buildAndSignAndSubmitTx` custodial → `/tx/build-sign-submit`). The SDK
 * can't see when one phase ends and the next begins inside that request, so
 * it honestly reports a single fused state instead of fabricating
 * transitions.
 *
 * **Terminal states** (`success`, `error`) and the post-Horizon-ack pending
 * state (`submitted`) are shared across all paths.
 *
 * On `error`, the `phase` discriminator tells the consumer *where* the
 * failure happened so modal UIs can offer "retry from this step" buttons.
 */
export type TransactionState =
  | { step: 'idle' }
  // ─── Granular phases (observable per-call) ────────────────────────────
  | { step: 'building' }
  | { step: 'built'; buildData: TxBuildContent }
  | { step: 'signing'; buildData?: TxBuildContent }
  | { step: 'signed'; buildData?: TxBuildContent; signedXdr: string; submissionToken?: string }
  | { step: 'submitting'; buildData?: TxBuildContent; signedXdr?: string }
  // ─── Compound phases (custodial-only — backend swallows the boundaries) ──
  | { step: 'signing-submitting'; buildData?: TxBuildContent }
  | { step: 'building-signing-submitting' }
  // ─── Post-Horizon-ack, pre-ledger-confirm (shared) ────────────────────
  | { step: 'submitted'; buildData?: TxBuildContent; hash: string }
  // ─── Terminal success (shared) ────────────────────────────────────────
  | { step: 'success'; buildData?: TxBuildContent; hash: string }
  // ─── Terminal failure with phase context ──────────────────────────────
  | { step: 'error'; phase: TxErrorPhase; details?: string; buildData?: TxBuildContent; signedXdr?: string };

/**
 * Identifies which phase failed when `TransactionState.step === 'error'`.
 * Compound phase names (`signing-submitting`, `building-signing-submitting`)
 * appear here when the failure happened inside an atomic backend call where
 * the SDK can't isolate the failing sub-phase.
 */
export type TxErrorPhase = 'building' | 'signing' | 'submitting' | 'signing-submitting' | 'building-signing-submitting';

/**
 * Per-call outcomes returned by `buildTx`, `signTx`, `submitTx`,
 * `signAndSubmitTx`, and `buildAndSignAndSubmitTx`. These are additive to
 * `TransactionState` — the same operations still drive the state machine for
 * modal-style UIs, but headless callers can `await` the method and inspect
 * the returned outcome directly instead of subscribing to state changes.
 */
export type BuildOutcome = { status: 'built'; buildData: TxBuildContent } | { status: 'error'; details?: string };

export type SignOutcome =
  | { status: 'signed'; signedXdr: string; submissionToken?: string; expiresAt?: number }
  | { status: 'error'; details?: string };

export type SubmitOutcome =
  | { status: 'success'; hash: string; buildData?: TxBuildContent }
  | { status: 'pending'; hash: string; buildData?: TxBuildContent }
  | { status: 'error'; hash?: string; details?: string; resultCode?: string; buildData?: TxBuildContent };

export const AUTH_ERROR_CODES = {
  SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_INVALID: 'SESSION_INVALID',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  EMAIL_VERIFY_FAILED: 'EMAIL_VERIFY_FAILED',
  EMAIL_CODE_EXPIRED: 'EMAIL_CODE_EXPIRED',
  EMAIL_CODE_INVALID: 'EMAIL_CODE_INVALID',
  AUTH_FAILED: 'AUTH_FAILED',
  WALLET_CONNECT_FAILED: 'WALLET_CONNECT_FAILED',
  WALLET_AUTH_FAILED: 'WALLET_AUTH_FAILED',
  WALLET_RESOLVER_TIMEOUT: 'WALLET_RESOLVER_TIMEOUT',
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

export type TxHistoryContent = pollarPaths['/tx/history']['get']['responses'][200]['content']['application/json']['content'];

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
