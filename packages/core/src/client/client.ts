import { createApiClient, fetchWithTimeout, PollarApiClient } from '../api/client';
import { claimDistributionRule, listDistributionRules } from '../api/endpoints/distribution';
import { getSwapConfig, getSwapTokens, quoteSwap } from '../api/endpoints/swap';
import { buildEarnTx, getEarnOpportunities, getEarnPosition, getEarnProviders } from '../api/endpoints/earn';
import { getKycProviders, getKycStatus, pollKycStatus, resolveKyc, startKyc } from '../api/endpoints/kyc';
import {
  completeWithdraw,
  createOffRamp,
  createOnRamp,
  getRampCountries,
  getRampsQuote,
  getRampTransaction,
  pollRampTransaction,
  submitRampSignature,
} from '../api/endpoints/ramps';
import { buildProof } from '../dpop';
import { defaultKeyManager } from '../keys/factory';
import type { KeyManager } from '../keys/types';
import { hashApiKey } from '../lib/api-key-hash';
import { createLogger, type PollarLogger } from '../lib/logger';
import { redactBody, redactDeep } from '../lib/logging';
import { randomUUID } from '../lib/random-uuid';
import { StellarNetwork } from '../stellar/StellarClient';
import { defaultStorage } from '../storage/autodetect';
import type { OnStorageDegrade, Storage, StorageDegradeReason } from '../storage/types';
import {
  AUTH_ERROR_CODES,
  AuthProviderContext,
  AuthState,
  AuthUrlOpener,
  BuildOutcome,
  DistributionClaimBody,
  DistributionClaimContent,
  DistributionRule,
  SwapQuote,
  SwapQuoteBody,
  SwapQuoteParams,
  SwapToken,
  SwapVenue,
  EarnProviderId,
  EarnOpportunity,
  EarnPosition,
  EarnPositionParams,
  EarnTxParams,
  EnabledAssetRecord,
  EnabledAssetsState,
  KycLevel,
  KycStartBody,
  KycStartResponse,
  KycStatus,
  NetworkState,
  PasskeyCeremony,
  PasskeySigner,
  PollarApplicationConfigContent,
  PollarAuthProvider,
  PollarClientConfig,
  PollarFlowError,
  PollarLoginOptions,
  PollarPersistedSession,
  PollarPersistedWallet,
  isPollarNetworkError,
  PollarUserProfile,
  RampsOfframpBody,
  RampsOfframpResponse,
  RampsOnrampBody,
  RampsOnrampResponse,
  RampsCompleteResponse,
  RampsCountriesResponse,
  RampsQuoteQuery,
  RampsQuoteResponse,
  RampsSignatureBody,
  RampsSignatureResponse,
  RampsTransactionResponse,
  RampTxStatus,
  SessionInfo,
  SessionsState,
  SignAuthEntryOutcome,
  SignOutcome,
  SendPaymentParams,
  SubmitOutcome,
  TransactionState,
  TrustlineOutcome,
  TxBuildBody,
  TxBuildContent,
  TxHistoryParams,
  TxHistoryState,
  TxSignAndSendBody,
  WalletAssetsContent,
  WalletBalanceContent,
  WalletBalanceRecord,
  WalletBalanceState,
  WalletChain,
  WalletInfo,
} from '../types';
import { POLLAR_CORE_VERSION } from '../version';
import { defaultVisibilityProvider } from '../visibility/autodetect';
import type { VisibilityProvider } from '../visibility/types';
import { AlbedoAdapter, FreighterAdapter, WalletAdapter, WalletAdapterMeta, WalletId } from '../wallets';
import { authenticate } from './auth/authenticate';
import { createAuthSession } from './auth/deps';
import { resolveAuthError } from './auth/errorMessages';
import { initEmailSession, sendEmailCode, verifyAndAuthenticate } from './auth/emailFlow';
import { defaultWebOAuthOpener, loginOAuth } from './auth/oauthFlow';
import { smartWalletFlow } from './auth/passkeyFlow';
import { emailProvider, oauthProvider } from './auth/providers';
import { loginWithSolanaAdapter } from './auth/solanaWalletFlow';
import { loginWithAdapter, requestWalletChallenge } from './auth/walletFlow';
import { readStorage, readWalletType, removeStorage, sessionStorageKey, writeStorage, writeWalletType } from './session';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
/** React Native runtime: `navigator.product === 'ReactNative'` (set by the RN runtime). */
const isReactNative = typeof navigator !== 'undefined' && (navigator as { product?: string }).product === 'ReactNative';
/**
 * True wherever the SDK can persist state and do crypto — browser OR React
 * Native. False only in true server-side renders (Node/SSR) where there is no
 * client runtime. Gates everything that previously keyed off `isBrowser`; that
 * check alone wrongly treated RN (no `localStorage`) as server-side.
 */
const isClientRuntime = isBrowser || isReactNative;

/**
 * Live client count per API key, so we can warn on the duplicate-instance
 * footgun: two `PollarClient`s for the same key share one persisted session +
 * DPoP key and run independent refresh loops; the single-use refresh-token
 * rotation then trips server-side reuse-detection and logs all of them out.
 */
const liveClientsByApiKey = new Map<string, number>();

/** Renew the access token this many seconds before its `exp` to absorb clock skew + signing latency. */
const REFRESH_SKEW_SECONDS = 60;

function warnServerSide(method: string): void {
  // Module-level (no client instance / logger yet) — and a misuse warning the
  // developer should always see, so it stays on the raw console.
  console.warn(
    `[PollarClient] ${method}() called server-side — browser APIs unavailable. Use PollarClient only in Client Components.`,
  );
}

export class PollarClient {
  readonly apiKey: string;
  readonly id: string;
  readonly basePath: string;

  private readonly _api: PollarApiClient;
  private readonly _log: PollarLogger;
  private readonly _storage: Storage;
  private readonly _keyManager: KeyManager;
  /** Resolves once `keyManager.init()` and the initial session restore complete. */
  private readonly _initialized: Promise<void>;
  /**
   * Per-API-key storage namespace. Computed asynchronously inside
   * `_initialize()` because SHA-256 lives behind `crypto.subtle.digest`.
   * Accessing `apiKeyHash` before `await client.ready()` throws.
   */
  private _apiKeyHash: string | null = null;

  /**
   * Short SHA-256-derived namespace for this client's persisted state.
   * Available after `await client.ready()` (or any awaited method); throws
   * if read before initialization completes.
   */
  get apiKeyHash(): string {
    if (this._apiKeyHash === null) {
      throw new Error('[PollarClient] apiKeyHash is not available until client.ready() resolves');
    }
    return this._apiKeyHash;
  }

  private _session: PollarPersistedSession | null = null;
  private _profile: PollarUserProfile | null = null;
  /** Last `DPoP-Nonce` we saw from a server response. Carried into the next proof. */
  private _dpopNonce: string | null = null;
  /**
   * Clock skew compensation, in seconds (`serverTime − localTime`), learned from
   * the `Date` header of every server response and added to the DPoP proof
   * `iat`. Keeps proofs inside the server's acceptance window on devices whose
   * clock is wrong, and self-heals when the clock changes mid-session — so a
   * skewed clock can't trigger a proof-rejection → refresh-failure → logout loop.
   */
  private _clockOffsetSec = 0;
  /**
   * Snapshot of each in-flight request's body, taken in `onRequest` before
   * `fetch()` consumes the stream. Needed because `Request.clone()` throws
   * once the body is disturbed, so the auto-retry path (DPoP nonce challenge
   * / 401 refresh) must rebuild the request from scratch instead of cloning.
   */
  private _requestBodyCache = new WeakMap<Request, ArrayBuffer>();
  /** Singleton in-flight refresh — concurrent 401s coalesce into one /auth/refresh call. */
  private _refreshPromise: Promise<void> | null = null;
  /**
   * Bumped on every session teardown/replacement (`_clearSession`,
   * `_storeSession`). An in-flight refresh or resume captures the value before
   * its network round-trip and re-checks it before writing storage / emitting /
   * arming a timer; a mismatch means the session was logged out or replaced
   * mid-flight, so the stale result is discarded. Without this, a refresh that
   * resolves just after a logout silently re-persists the revoked session and
   * re-arms the refresh timer.
   */
  private _sessionGeneration = 0;
  /** Set by `destroy()`; short-circuits timer re-arming and any post-teardown work. */
  private _destroyed = false;
  private _storageEventHandler: ((e: StorageEvent) => void) | null = null;
  /** Optional UI label sent to the server at /auth/login so the sessions UI
   *  can show a recognizable device name. Set via PollarClientConfig.deviceLabel. */
  private readonly _deviceLabel: string | undefined;
  private readonly _visibilityProvider: VisibilityProvider;
  private readonly _maxIdleMs: number | undefined;
  /** Per-attempt HTTP timeout (ms). Also applied to the manual DPoP-nonce retry
   *  that bypasses openapi-fetch's configured fetch. */
  private readonly _requestTimeoutMs: number;
  /** Longer per-request timeout for the submit-family tx calls (see
   *  PollarClientConfig.submitTimeoutMs). Sent as an `x-pollar-timeout-ms`
   *  header the request middleware reads to bound just those calls. */
  private readonly _submitTimeoutMs: number;
  /** Updated by the request middleware. Read by the silent-refresh scheduler
   *  to skip proactive refreshes after `maxIdleMs` of no HTTP activity. */
  private _lastRequestAt: number = Date.now();
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _visibilityUnsubscribe: (() => void) | null = null;

  private _transactionState: TransactionState | null = null;
  private _transactionStateListeners = new Set<(state: TransactionState) => void>();
  // Snapshot of `_sessionGeneration` taken at the start of each tx operation. A
  // tx belongs to the session it began in; if the generation changes mid-flight
  // (logout / new login), `_setTransactionState` drops the now-stale write so a
  // tx resolving after logout can't repopulate or emit the old session's state.
  private _txStartGen = 0;
  private _txHistoryState: TxHistoryState = { step: 'idle' };
  private _txHistoryStateListeners = new Set<(state: TxHistoryState) => void>();
  private _sessionsState: SessionsState = { step: 'idle' };
  private _sessionsStateListeners = new Set<(state: SessionsState) => void>();
  private _walletBalanceState: WalletBalanceState = { step: 'idle' };
  private _walletBalanceStateListeners = new Set<(state: WalletBalanceState) => void>();
  private _enabledAssetsState: EnabledAssetsState = { step: 'idle' };
  private _enabledAssetsStateListeners = new Set<(state: EnabledAssetsState) => void>();
  /**
   * Per-reader request generations. Each reactive fetch (`fetchTxHistory`,
   * `refreshBalance`, `refreshAssets`, `fetchSessions`) bumps its counter and,
   * after awaiting, drops its result if a newer call superseded it — so two
   * overlapping calls (fast pagination, pull-to-refresh spam) can't land
   * last-writer-wins with the wrong page's data.
   */
  private _txHistoryGen = 0;
  private _sessionsGen = 0;
  private _walletBalanceGen = 0;
  private _enabledAssetsGen = 0;
  private _authState: AuthState = { step: 'idle' };
  private _authStateListeners = new Set<(state: AuthState) => void>();
  private _networkState: NetworkState = { step: 'idle' };
  private _networkStateListeners = new Set<(state: NetworkState) => void>();
  /**
   * Latched once the storage adapter degrades. We dedupe (the adapter only
   * fires once anyway) and use it to replay state to late-subscribers — same
   * pattern as `onAuthStateChange` replaying `_authState` on subscribe.
   * Only populated when the SDK constructed the default storage adapter; if
   * the consumer passes `config.storage`, they own degradation notifications.
   */
  private _storageDegraded: { reason: StorageDegradeReason; error?: unknown } | null = null;
  private _storageDegradeListeners = new Set<OnStorageDegrade>();

  private _walletAdapter: WalletAdapter | null = null;
  /** Registered wallet adapters, keyed by id. Seeded with the built-in
   *  Freighter/Albedo, then any `config.walletAdapters` (override by `type`). */
  private readonly _walletAdapters = new Map<WalletId, WalletAdapter>();
  private readonly _passkey: PasskeyCeremony | null;
  private readonly _passkeySign: PasskeySigner | null;
  private _loginController: AbortController | null = null;
  /** Aborts an in-flight `/auth/session/resume` on destroy() or re-trigger. */
  private _resumeController: AbortController | null = null;
  /** Platform strategy for opening the hosted-OAuth URL (popup on web; injected on RN). */
  private readonly _openAuthUrl: AuthUrlOpener;
  /** `redirect_uri` sent to the backend for hosted OAuth. */
  private readonly _oauthRedirectUri: string;
  /**
   * Registry of the built-in auth providers, keyed by provider id (`google`,
   * `github`, `email`). Custom integrations now register as
   * `config.walletAdapters`, not here. `providerAction()` reaches these
   * providers' actions (e.g. email's resend/verify). See {@link PollarAuthProvider}.
   */
  private readonly _providers = new Map<string, PollarAuthProvider>();

  constructor(config: PollarClientConfig) {
    this.apiKey = config.apiKey;
    this.id = randomUUID();
    // v2 is the multichain SDK surface. It is a superset of v1 — every v1 route is
    // re-exposed unchanged, with a `chain` discriminator added where a feature went
    // multichain (today: wallet balance/tokens/transfer). So the whole client rides
    // /v2 and only the shapes that actually changed are handled specially.
    this.basePath = `${config.baseUrl || 'https://sdk.api.pollar.xyz'}/v2`;
    this._log = createLogger(config.logLevel ?? 'info', config.logger);

    this._storage =
      config.storage ??
      defaultStorage({
        logger: this._log,
        onDegrade: (reason, error) => {
          // N6: on React Native the default storage falls back to memory because
          // there is no localStorage — make that misconfiguration obvious rather
          // than letting sessions silently vanish on every cold start.
          if (isReactNative && reason === 'unavailable') {
            this._log.warn(
              '[PollarClient] No persistent storage on React Native — sessions and the DPoP key ' +
                'live in memory only and are lost on cold start (the user is logged out each launch). ' +
                'Pass a Keychain/SecureStore adapter via `config.storage`.',
            );
          }
          // Forward to the legacy one-shot callback (back-compat) and to any
          // subscribers added via `client.onStorageDegrade(cb)`. Both fire
          // exactly once because the underlying adapter dedupes.
          config.onStorageDegrade?.(reason, error);
          this._dispatchStorageDegrade(reason, error);
        },
      });
    this._keyManager = config.keyManager ?? defaultKeyManager(this._storage, config.apiKey);
    this._passkey = config.passkey ?? null;
    this._passkeySign = config.passkeySign ?? null;
    this._deviceLabel = config.deviceLabel;
    this._visibilityProvider = config.visibilityProvider ?? defaultVisibilityProvider();
    this._maxIdleMs = config.maxIdleMs;
    this._requestTimeoutMs = config.requestTimeoutMs ?? 10_000;
    this._submitTimeoutMs = config.submitTimeoutMs ?? 30_000;
    this._openAuthUrl = config.openAuthUrl ?? defaultWebOAuthOpener;
    // `window.location` can be absent even when `isBrowser` is true (some
    // webview/SSR shims expose a partial `window`); read it defensively so the
    // constructor never throws on a missing `.origin`.
    this._oauthRedirectUri = config.oauthRedirectUri ?? (isBrowser ? (window.location?.origin ?? '') : '');

    // Seed built-in auth providers (google/github/email).
    for (const provider of [oauthProvider('google'), oauthProvider('github'), emailProvider()]) {
      this._providers.set(provider.id, provider);
    }
    // Seed built-in wallet adapters, then register config ones (override by type).
    // Read the network from config (not getNetwork(), `_networkState` isn't set yet).
    const albedoNet = (config.stellarNetwork ?? 'testnet') === 'mainnet' ? 'public' : 'testnet';
    for (const adapter of [new FreighterAdapter(), new AlbedoAdapter(albedoNet)] as WalletAdapter[]) {
      this._walletAdapters.set(adapter.type, adapter);
    }
    for (const adapter of config.walletAdapters ?? []) {
      // login() resolves the wallet registry BEFORE the auth-provider registry,
      // so an adapter whose `type` collides with a built-in auth provider
      // ('google'/'github'/'email') would silently steal that login. And a
      // duplicate type across adapters silently drops one (Map overwrite). Warn
      // on both so a config mistake isn't invisible.
      if (this._providers.has(adapter.type)) {
        this._log.warn(
          `[PollarClient] Wallet adapter type '${adapter.type}' shadows the built-in '${adapter.type}' auth provider; login({ provider: '${adapter.type}' }) will run the wallet flow, not the provider.`,
        );
      } else if (this._walletAdapters.has(adapter.type)) {
        this._log.warn(
          `[PollarClient] Wallet adapter type '${adapter.type}' overrides an already-registered adapter of the same type.`,
        );
      }
      this._walletAdapters.set(adapter.type, adapter);
    }

    this._api = createApiClient(this.basePath, {
      timeoutMs: this._requestTimeoutMs,
      retry: config.retry,
      // A DPoP proof is single-use, so the transport-level retry cannot replay
      // the cloned request's header — it hands each new attempt back here to be
      // signed afresh. See `_resignForRetry`.
      resignRetry: (request) => this._resignForRetry(request),
    });
    this._wireMiddlewares();

    this._networkState = { step: 'connected', network: config.stellarNetwork ?? 'testnet' };

    if (!isClientRuntime) {
      warnServerSide('constructor');
      this._initialized = Promise.resolve();
      return;
    }

    this._log.info(
      `[PollarClient] Initialized v${POLLAR_CORE_VERSION} — endpoint: ${this.basePath}, network: ${this._networkState.network}`,
    );

    // N4: warn (don't throw — that would break StrictMode double-mounts / HMR)
    // when a second live client exists for this API key.
    const liveForKey = (liveClientsByApiKey.get(this.apiKey) ?? 0) + 1;
    liveClientsByApiKey.set(this.apiKey, liveForKey);
    if (liveForKey > 1) {
      this._log.warn(
        '[PollarClient] Another PollarClient is already active for this API key. Multiple ' +
          'instances share one persisted session + DPoP key and run independent refresh loops; ' +
          'the single-use refresh-token rotation will trip server-side reuse-detection and log ' +
          'all of them out. Create one client per API key and reuse it (e.g. a module singleton).',
      );
    }

    // N5: on a non-browser client runtime (React Native) the default visibility
    // provider is a no-op, so proactive refresh can't resume when the app
    // returns to the foreground (the OS suspended the timer in the background).
    if (!isBrowser && !config.visibilityProvider) {
      this._log.warn(
        '[PollarClient] No visibilityProvider configured on a non-browser runtime. Proactive ' +
          'token refresh will not resume on foreground (only reactive 401-refresh will). Pass a ' +
          'visibilityProvider (e.g. the React Native AppState adapter) to keep the session fresh.',
      );
    }

    this._initialized = this._initialize();
  }

  /** Awaitable handle for the initial keypair + session restore. */
  ready(): Promise<void> {
    return this._initialized;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  private async _initialize(): Promise<void> {
    // Compute the storage namespace first — every subsequent storage op
    // (including the cross-tab listener below and `_restoreSession`) reads it.
    this._apiKeyHash = await hashApiKey(this.apiKey);

    // Cross-tab session sync. Browser-only — the `storage` event is a DOM
    // feature with no React Native equivalent (each RN process owns its
    // SecureStore/Keychain), so we gate on `isBrowser`, not `isClientRuntime`.
    if (isBrowser) {
      const sessionKey = sessionStorageKey(this._apiKeyHash);
      const handler = (e: StorageEvent): void => {
        // `localStorage.clear()` fires with key === null; a targeted set/remove
        // fires with key === sessionKey. Ignore unrelated keys.
        if (e.key !== null && e.key !== sessionKey) return;

        // Cross-tab LOGOUT: the session key was removed (newValue === null) or
        // all storage was cleared (key === null). Propagate the logout straight
        // from the event WITHOUT re-reading storage — a tab whose adapter
        // degraded to memory (Safari private mode, quota) still holds its own
        // copy of the session, so a re-read would miss the logout and keep using
        // the now-revoked token.
        if (e.key === null || e.newValue === null) {
          if (this._authState.step !== 'idle') {
            void this._clearSession().catch((err) => this._log.error('[PollarClient] Cross-tab logout failed', err));
          }
          return;
        }

        // Cross-tab LOGIN / token rotation: re-sync from storage (this also
        // keeps a verified session verified on a pure rotation — see
        // _restoreSession's same-session fast path).
        this._restoreSession().catch((err) => this._log.error('[PollarClient] Cross-tab restore failed', err));
      };
      window.addEventListener('storage', handler);
      this._storageEventHandler = handler;
    }

    try {
      await this._keyManager.init();
    } catch (err) {
      this._log.warn('[PollarClient] KeyManager init failed; DPoP unavailable for this session', err);
    }
    await this._restoreSession();

    // Wire after restore so the first scheduled refresh — if any — is set up
    // by `_restoreSession` itself, and the visibility listener only fires
    // re-checks for transitions that happen from this point forward.
    this._visibilityUnsubscribe = this._visibilityProvider.onChange((visible) => {
      if (!visible) return;
      void this._maybeProactiveRefresh();
      // B5: if the session is still optimistic (e.g. the startup resume failed
      // offline), retry validation now that the app is foreground again.
      if (this._authState.step === 'authenticated' && !this._authState.verified) {
        void this._resume();
      }
    });
  }

  /** Detach the cross-tab storage listener and abort any in-flight login. */
  destroy(): void {
    // Latch first so anything still in flight (a refresh resolving, a queued
    // proactive-refresh timer callback) sees a destroyed client and bails
    // instead of re-arming a timer or writing state after teardown.
    if (this._destroyed) return; // idempotent — don't double-decrement the registry
    this._destroyed = true;
    if (isClientRuntime) {
      const remaining = (liveClientsByApiKey.get(this.apiKey) ?? 1) - 1;
      if (remaining <= 0) liveClientsByApiKey.delete(this.apiKey);
      else liveClientsByApiKey.set(this.apiKey, remaining);
    }
    if (this._storageEventHandler && isBrowser) {
      window.removeEventListener('storage', this._storageEventHandler);
      this._storageEventHandler = null;
    }
    this._loginController?.abort();
    this._loginController = null;
    this._resumeController?.abort();
    this._resumeController = null;
    this._clearRefreshTimer();
    if (this._visibilityUnsubscribe) {
      this._visibilityUnsubscribe();
      this._visibilityUnsubscribe = null;
    }
    // Drop subscribers so the host's forgotten listeners aren't retained for
    // the client's GC lifetime.
    this._authStateListeners.clear();
    this._transactionStateListeners.clear();
    this._txHistoryStateListeners.clear();
    this._sessionsStateListeners.clear();
    this._walletBalanceStateListeners.clear();
    this._enabledAssetsStateListeners.clear();
    this._networkStateListeners.clear();
    this._storageDegradeListeners.clear();
  }

  // ─── Middlewares (DPoP + auto-refresh) ────────────────────────────────────

  private _wireMiddlewares(): void {
    // Aliasing `this` is deliberate: every middleware callback below is an
    // arrow function so `this` would resolve correctly, but the file reads
    // significantly easier with one stable name across ~150 lines of
    // request/response/refresh interleaving. Don't refactor without
    // re-running the smoke tests for refresh coalescing + DPoP nonce flow.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this._api.use({
      onRequest: async ({ request }: { request: Request }) => {
        request.headers.set('x-pollar-api-key', self.apiKey);
        self._lastRequestAt = Date.now();
        // Every request waits until the client is initialized — EXCEPT a
        // /auth/refresh: the expired-AT restore (F5) issues one from WITHIN
        // _restoreSession (before `_initialized` resolves), so awaiting here would
        // deadlock. Post-init this is a no-op (already resolved), and the refresh
        // has everything it needs by then (keyManager init'd, `_session` set).
        if (!request.url.includes('/auth/refresh')) await self._initialized;
        // Cache the body before fetch() disturbs the stream — retries can't
        // call request.clone() once the body is consumed. Gate only on the
        // method: GET/HEAD carry no body. Do NOT gate on `request.body` — in
        // RN's fetch polyfill that getter is `undefined` even for a POST with a
        // JSON body, so the old `request.body != null` check silently skipped
        // the snapshot and a /auth/refresh retry (after a DPoP nonce challenge)
        // was replayed with an empty body → server 400 "Malformed JSON". We
        // snapshot via clone().arrayBuffer() (works in RN by reading the
        // polyfill's internal body) and only store non-empty buffers so a
        // genuinely body-less POST never gets a phantom body on retry.
        const cacheMethod = request.method.toUpperCase();
        const cacheBodyAllowed = cacheMethod !== 'GET' && cacheMethod !== 'HEAD';
        if (cacheBodyAllowed) {
          try {
            // TODO(files): this assumes a JSON-string body. If/when an endpoint
            // sends FormData/Blob (e.g. a KYC file upload), arrayBuffer() on RN's
            // fetch polyfill is unreliable for those — the DPoP-nonce retry could
            // replay an empty body (same class as the rc.1 bug). Handle multipart
            // bodies explicitly before adding any non-JSON upload route.
            const snapshot = await request.clone().arrayBuffer();
            if (snapshot.byteLength > 0) self._requestBodyCache.set(request, snapshot);
          } catch (err) {
            this._log.warn('[PollarClient] Could not snapshot request body for retry', err);
          }
        }
        // The refresh endpoint must not wait on its own in-flight refresh —
        // that would deadlock the singleton. Other requests wait so they
        // pick up the freshly-rotated token.
        const isRefresh = request.url.includes('/auth/refresh');
        // Swallow the refresh outcome: this request only needs to wait until the
        // rotation settles, then proceed with whatever token is current. If the
        // refresh REJECTED, that's the refreshing caller's problem — an
        // unrelated request must not inherit/re-throw it (and a bare `await`
        // would surface it as an unhandled rejection here).
        if (!isRefresh && self._refreshPromise) await self._refreshPromise.catch(() => {});

        if (isRefresh) {
          // RFC 9449 §5 / §6.1: token-endpoint proofs MUST NOT carry `ath`
          // and MUST NOT use the access token in the Authorization header.
          // The DPoP proof alone authenticates the request; the RT goes in
          // the body and binds via `cnf.jkt`.
          const refreshProof = await self._buildProofForRequest(request, undefined);
          if (refreshProof) request.headers.set('DPoP', refreshProof);
          return request;
        }

        const accessToken = self._session?.token?.accessToken;
        if (!accessToken) return request;

        const proof = await self._buildProofForRequest(request, accessToken);
        if (proof) {
          request.headers.set('Authorization', `DPoP ${accessToken}`);
          request.headers.set('DPoP', proof);
        } else {
          // DPoP unavailable (HTTP origin / SubtleCrypto missing). Fall back
          // to Bearer; the server will reject if the AT is DPoP-bound.
          request.headers.set('Authorization', `Bearer ${accessToken}`);
        }
        return request;
      },
      onResponse: async ({ request, response }: { request: Request; response: Response }) => {
        const newNonce = response.headers.get('DPoP-Nonce');
        if (newNonce) self._dpopNonce = newNonce;

        // Learn the clock skew from the server's `Date` header BEFORE any retry
        // or refresh below, so a proof rejected for a bad `iat` is rebuilt with
        // the corrected offset on the very next attempt (no logout loop). Every
        // HTTP response carries `Date`; we recompute each time so a clock that
        // changes mid-session self-heals.
        const serverDate = response.headers.get('Date');
        if (serverDate) {
          const serverSec = Math.floor(Date.parse(serverDate) / 1000);
          // Only learn the offset from a PLAUSIBLE absolute server time (the
          // server clock is always ~now). This still compensates any local-clock
          // skew (the offset is server−local), but ignores a garbage/hostile
          // `Date` (epoch, year 2099, a CDN error page's wrong clock) that would
          // otherwise poison every proof's `iat` and wedge auth. Window: 2020–2100.
          if (Number.isFinite(serverSec) && serverSec > 1_577_836_800 && serverSec < 4_102_444_800) {
            self._clockOffsetSec = serverSec - Math.floor(Date.now() / 1000);
          }
        }

        if (response.status !== 401) return self._logHttp(request, response);

        // Case-insensitive: RFC 9449 carries this as `error="use_dpop_nonce"`,
        // but header casing isn't guaranteed end-to-end (a proxy/CDN can rewrite
        // it). A case-sensitive match would misclassify the nonce challenge as a
        // plain token-expiry 401 → a pointless refresh and, for a POST, no retry
        // (POSTs don't auto-retry after a token refresh), surfacing as a spurious
        // failure on the first DPoP request behind such infra.
        const wwwAuth = response.headers.get('WWW-Authenticate') ?? '';
        const isNonceChallenge = wwwAuth.toLowerCase().includes('use_dpop_nonce');

        // A replayed proof is not an expired token, and refreshing cannot fix
        // it: the server rejected the `jti`, having never processed the request.
        // Treating it as an expiry (the default 401 path) burns a refresh per
        // occurrence, which on a polling loop is enough to hit the /auth/refresh
        // rate limit and take the session down with it. Retrying is all it
        // needs — `_retryRequest` mints a brand-new proof.
        const isProofReplay = !isNonceChallenge && (await self._isDpopReplay(response));

        // The refresh endpoint has special handling: don't recursively trigger
        // refresh from inside itself. But DO honor a nonce challenge — the
        // fresh `DPoP-Nonce` was already captured above, so a single retry
        // with the new nonce succeeds. Any other 401 (RT expired, reused,
        // invalid) propagates to `_doRefresh` which clears the session.
        if (request.url.includes('/auth/refresh')) {
          if (isNonceChallenge || isProofReplay) return self._logHttp(request, await self._retryRequest(request));
          return self._logHttp(request, response);
        }

        if (!isNonceChallenge && !isProofReplay) {
          try {
            await self.refresh();
          } catch {
            return self._logHttp(request, response);
          }
          // Token-expired retries (post-refresh) are only safe for idempotent
          // methods. POST/PUT/DELETE/PATCH might have already executed
          // server-side before auth was rejected — replaying could duplicate
          // effects (double-create a transaction, etc.). The original 401
          // bubbles up so the caller decides; the access token is now fresh,
          // so a manual retry by the caller will succeed. Nonce-challenge and
          // replayed-proof 401s don't go through this branch (the server
          // rejected the proof before the handler ran, so it processed
          // nothing), which is why any method retries safely above.
          const method = request.method.toUpperCase();
          if (method !== 'GET' && method !== 'HEAD') {
            return self._logHttp(request, response);
          }
        }
        return self._logHttp(request, await self._retryRequest(request));
      },
    });
  }

  /**
   * Logs the final outcome of an SDK API call exactly once: successes (`2xx`) at
   * `debug` (method + path + status, no body), failures (`4xx`/`5xx`) at `error`
   * with the redacted request body and the response error body. Returns the
   * response so it can be chained at the middleware's return points. The error
   * body is read off a synchronous `clone()` so it never disturbs the body the
   * caller consumes.
   */
  private _logHttp(request: Request, response: Response): Response {
    const path = this._httpPath(request.url);
    const label = `[PollarClient:http] ${request.method.toUpperCase()} ${path} ${response.status}`;
    if (response.ok) {
      this._log.debug(label);
    } else {
      void this._logHttpError(label, request, response.clone());
    }
    return response;
  }

  /** Reads the redacted request body + JSON response body and logs at `error`. */
  private async _logHttpError(label: string, request: Request, response: Response): Promise<void> {
    let requestBody: unknown;
    const cached = this._requestBodyCache.get(request);
    if (cached) {
      try {
        requestBody = redactBody(JSON.parse(new TextDecoder().decode(cached)));
      } catch {
        // Non-JSON / unparseable body — omit it rather than log raw bytes.
      }
    }

    let responseBody: unknown;
    if ((response.headers.get('content-type') ?? '').includes('application/json')) {
      try {
        // Recursively redact: an error response can carry nested token material
        // (e.g. `content.token.accessToken`) that the shallow request redactor
        // wouldn't catch. Never log a raw response body.
        responseBody = redactDeep(await response.json());
      } catch {
        // Body already consumed or not valid JSON — omit it.
      }
    }

    this._log.error(label, {
      ...(requestBody !== undefined ? { requestBody } : {}),
      ...(responseBody !== undefined ? { responseBody } : {}),
    });
  }

  /** Strips origin + the `/vN` version prefix from a request URL for compact logs. */
  private _httpPath(url: string): string {
    try {
      const { pathname } = new URL(url);
      return /^\/v\d+\//.test(pathname) ? pathname.slice(pathname.indexOf('/', 1)) : pathname;
    } catch {
      return url;
    }
  }

  private async _buildProofForRequest(request: Request, accessToken: string | undefined): Promise<string | null> {
    try {
      const htu = request.url.split('?')[0]!.split('#')[0]!;
      return await buildProof(
        {
          htm: request.method,
          htu,
          ...(accessToken ? { accessToken } : {}),
          ...(this._dpopNonce !== null ? { nonce: this._dpopNonce } : {}),
          clockOffsetSec: this._clockOffsetSec,
        },
        this._keyManager,
      );
    } catch (err) {
      this._log.warn('[PollarClient] DPoP proof build failed', err);
      return null;
    }
  }

  /**
   * Is this 401 a rejected DPoP proof REPLAY (`jti` already seen)?
   *
   * The distinction matters because the default 401 path assumes an expired
   * access token and spends a `/auth/refresh` on it. A replay is neither: the
   * server refused the proof and never ran the handler, so the token is fine and
   * a refresh only burns rate-limit budget. Narrowed to the replay `reason`
   * specifically — every other DPoP failure (thumbprint mismatch, `ath`
   * mismatch) genuinely can be fixed by re-issuing a token bound to the current
   * key, so those keep the refresh.
   *
   * Reads a `clone()`, so the caller's body stays untouched. Any parse failure
   * answers `false` and leaves the existing behaviour in place.
   */
  private async _isDpopReplay(response: Response): Promise<boolean> {
    try {
      const body = (await response.clone().json()) as { code?: unknown; reason?: unknown };
      return body?.code === 'SDK_AUTH_DPOP_INVALID' && body?.reason === 'jti-replay';
    } catch {
      return false;
    }
  }

  /**
   * Mints a fresh DPoP proof for a request the transport layer is about to
   * re-send after a network failure (see `resignRetry` in `api/client.ts`).
   *
   * The retry there is a `request.clone()`, which copies the `DPoP` header the
   * failed attempt already spent; re-sending it is a `jti` replay and the server
   * rejects it with 401 even though the original failure was purely a dropped
   * connection. Rebuilding the proof (and re-reading the access token, which a
   * concurrent refresh may have rotated in the meantime) is what makes the retry
   * actually retry.
   *
   * Returns `null` when the request can no longer be signed — no session (a
   * concurrent logout) or no DPoP key — so the caller drops the retry instead of
   * replaying revoked credentials. Only reached for GET/HEAD, so there is no
   * body to carry over.
   */
  private async _resignForRetry(request: Request): Promise<Request | null> {
    // Not proof-bound (public endpoint, or Bearer fallback on an HTTP origin):
    // nothing is single-use, so the clone can be replayed as-is.
    if (!request.headers.has('DPoP')) return request;

    const accessToken = this._session?.token?.accessToken;
    if (!accessToken) return null;

    const proof = await this._buildProofForRequest(request, accessToken);
    if (!proof) return null;

    const headers = new Headers(request.headers);
    headers.set('Authorization', `DPoP ${accessToken}`);
    headers.set('DPoP', proof);
    return new Request(request, { headers });
  }

  private async _retryRequest(originalRequest: Request): Promise<Response> {
    // Rebuild instead of clone(): the original's body stream was consumed by
    // the first fetch() and clone() would throw `Request body is already used`.
    // openapi-fetch runs onResponse a single time per request, so no
    // RETRIED_HEADER guard is needed — the retry's response is returned to
    // the caller directly and never re-enters this middleware.
    const headers = new Headers(originalRequest.headers);
    const isRefresh = originalRequest.url.includes('/auth/refresh');

    if (isRefresh) {
      // Token-endpoint proof per RFC 9449 §5 / §6.1: NO `ath`, NO
      // Authorization header. Mirrors the initial-request branch in
      // `onRequest`. The DPoP header is rebuilt so it picks up the fresh
      // server-issued nonce captured in `onResponse`.
      const proof = await this._buildProofForRequest(originalRequest, undefined);
      headers.delete('Authorization');
      if (proof) headers.set('DPoP', proof);
      else headers.delete('DPoP');
    } else {
      // Strip any stale auth copied from the original request FIRST: if the
      // session was cleared between the original send and this retry (e.g. a
      // concurrent logout), `accessToken` is undefined and we must NOT replay the
      // old — now revoked — Authorization/DPoP headers. Mirrors the refresh
      // branch above, which always deletes them.
      headers.delete('Authorization');
      headers.delete('DPoP');
      const accessToken = this._session?.token?.accessToken;
      if (accessToken) {
        const proof = await this._buildProofForRequest(originalRequest, accessToken);
        if (proof) {
          headers.set('Authorization', `DPoP ${accessToken}`);
          headers.set('DPoP', proof);
        } else {
          headers.set('Authorization', `Bearer ${accessToken}`);
        }
      }
    }

    // Never attach a body to a GET/HEAD retry — the Fetch API (and RN's
    // polyfill) throws "Body not allowed for GET or HEAD requests". This is
    // the retry that the `/auth/session/resume` GET hits after a DPoP nonce
    // challenge.
    const retryMethod = originalRequest.method.toUpperCase();
    const retryBodyAllowed = retryMethod !== 'GET' && retryMethod !== 'HEAD';
    const cachedBody = retryBodyAllowed ? this._requestBodyCache.get(originalRequest) : undefined;
    const retried = new Request(originalRequest.url, {
      method: originalRequest.method,
      headers,
      body: cachedBody && cachedBody.byteLength > 0 ? cachedBody : null,
      credentials: originalRequest.credentials,
      mode: originalRequest.mode,
      redirect: originalRequest.redirect,
      referrer: originalRequest.referrer,
      integrity: originalRequest.integrity,
      // Preserve cancellation: the original may carry an AbortSignal (e.g. the
      // `/auth/session/resume` GET, which `destroy()` aborts). Without this the
      // retried fetch would ignore aborts and could write state after teardown.
      signal: originalRequest.signal,
    });
    // Bound this retry too: it calls `fetch` directly, bypassing the
    // timeout/retry wrapper openapi-fetch is configured with, so without this a
    // stalled nonce-retry would hang forever just like the original bug. The
    // submit-family endpoints get the longer submit budget (the per-request
    // `x-pollar-timeout-ms` header was already stripped upstream, so key off the
    // URL here); otherwise a first-submit-after-login nonce retry would fall
    // back to the 10s default and could cut a submit that is actually working.
    const isSubmit = /\/tx\/(submit|sign-and-send|build-sign-submit)(\?|$)/.test(originalRequest.url);
    return fetchWithTimeout(retried, isSubmit ? this._submitTimeoutMs : this._requestTimeoutMs);
  }

  // ─── Refresh (race-safe singleton) ───────────────────────────────────────

  /**
   * Coalesce concurrent refresh attempts. The first caller does the work;
   * everyone else awaits the same promise and sees the new tokens.
   */
  refresh(): Promise<void> {
    if (this._destroyed) return Promise.resolve();
    if (this._refreshPromise) return this._refreshPromise;
    this._refreshPromise = this._doRefresh().finally(() => {
      this._refreshPromise = null;
    });
    return this._refreshPromise;
  }

  /**
   * Tear down the session ONLY if it's still the one identified by `gen`. A
   * refresh that fails AFTER a logout/login landed must not `_clearSession()` —
   * that would wipe a session it no longer owns (the new login's, or re-clear an
   * already-cleared one). Used by `_doRefresh`'s error branches.
   */
  private async _clearIfCurrent(gen: number): Promise<void> {
    if (!this._destroyed && this._sessionGeneration === gen) await this._clearSession();
  }

  private async _doRefresh(): Promise<void> {
    // Snapshot the session identity before the network round-trip. If a logout
    // or a fresh login lands while `/auth/refresh` is in flight, the generation
    // changes and we discard the rotated token below instead of resurrecting a
    // revoked session or clobbering a newer one.
    const gen = this._sessionGeneration;
    const refreshToken = this._session?.token?.refreshToken;
    if (!refreshToken) {
      this._log.warn('[PollarClient] Refresh skipped: no refresh token in session');
      await this._clearSession();
      throw new Error('No refresh token available');
    }

    let data: unknown;
    let error: unknown;
    try {
      const response = await this._api.POST('/auth/refresh', { body: { refreshToken } });
      data = response.data;
      error = response.error;
    } catch (err) {
      // A transient transport failure (timeout / dropped connection) must NOT
      // tear down the session: the refresh token is almost certainly still
      // valid — the network just hiccuped — so clearing here would log the user
      // out over a momentary stall. Keep the session and rethrow a catchable
      // error; the caller can fall back to the cached token, and the next
      // request (or proactive timer) will refresh once connectivity returns.
      // Genuine refresh failures (4xx/5xx, malformed) still clear, below.
      if (isPollarNetworkError(err)) {
        this._log.warn('[PollarClient] /auth/refresh timed out; keeping session for retry', err);
        throw err;
      }
      this._log.error('[PollarClient] /auth/refresh request threw', err);
      await this._clearIfCurrent(gen);
      throw err;
    }

    if (error || !data) {
      this._log.error('[PollarClient] /auth/refresh returned error', { error: redactDeep(error) });
      await this._clearIfCurrent(gen);
      throw new Error('Refresh failed');
    }
    const successData = data as { success?: boolean; content?: { token?: PollarPersistedSession['token'] } };
    if (!successData.success || !successData.content?.token) {
      // Don't log `successData` — its `content.token` would write access/refresh
      // tokens to the console. Log only the non-sensitive shape.
      this._log.error('[PollarClient] /auth/refresh response malformed', {
        success: successData.success,
        hasToken: !!successData.content?.token,
      });
      await this._clearIfCurrent(gen);
      throw new Error('Refresh response malformed');
    }

    const newToken = successData.content.token;
    if (
      typeof newToken.accessToken !== 'string' ||
      typeof newToken.refreshToken !== 'string' ||
      // `typeof NaN === 'number'`, so the old check let NaN/Infinity through —
      // require a finite, positive Unix-seconds value.
      !Number.isFinite(newToken.expiresAt) ||
      newToken.expiresAt <= 0
    ) {
      // Log the field TYPES, never the token values themselves (`expiresAt` is a
      // timestamp, not a secret, so its value is safe to log).
      this._log.error('[PollarClient] /auth/refresh token shape invalid', {
        accessToken: typeof newToken.accessToken,
        refreshToken: typeof newToken.refreshToken,
        expiresAt: newToken.expiresAt,
      });
      await this._clearIfCurrent(gen);
      throw new Error('Refresh response token shape invalid');
    }
    // Sanity (non-fatal): `expiresAt` is Unix SECONDS. A value implausibly far
    // ahead (e.g. the server mistakenly sending milliseconds) would silently
    // disable proactive refresh — the scheduler clamps the huge delay — so the
    // token would only ever be refreshed reactively on a 401. Surface it.
    if (newToken.expiresAt > Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60) {
      this._log.warn('[PollarClient] /auth/refresh expiresAt is implausibly far ahead (seconds vs ms?)', {
        expiresAt: newToken.expiresAt,
      });
    }

    // Discard the result if the session was torn down or replaced (logout / new
    // login), or the client was destroyed, while the request was in flight —
    // writing it back would undo a logout or re-arm a timer post-teardown.
    if (this._destroyed || this._sessionGeneration !== gen || !this._session) {
      this._log.info('[PollarClient] Refresh result discarded: session changed during refresh');
      return;
    }

    this._session = { ...this._session, token: newToken };
    try {
      await writeStorage(this._storage, this.apiKeyHash, this._session);
      this._log.info('[PollarClient] Tokens refreshed');
    } catch (err) {
      this._log.error('[PollarClient] Failed to persist refreshed session', err);
      // In-memory state is still updated; the session works for this
      // process but won't survive reload. Don't clear — that'd surprise
      // the user with a logout for what's essentially a storage hiccup.
    }

    // Re-check after the awaited write — a logout could have landed during it.
    if (this._destroyed || this._sessionGeneration !== gen) return;

    // Emit the rotated session so getAuthState()/onAuthStateChange consumers
    // observe the fresh token. The SDK's own requests read `_session`
    // directly and already see the rotation, but external readers (e.g. code
    // that forwards the access token to a customer backend, or a
    // `getFreshAccessToken` helper that awaits an onAuthStateChange emission)
    // only see `_authState` — without this they keep handing out the stale,
    // now-expired token. Preserve `step`/`verified`; only swap the session.
    if (this._authState.step === 'authenticated') {
      this._setAuthState({ ...this._authState, session: this._session });
    }
    this._scheduleNextRefresh();
  }

  // ─── Silent refresh scheduler ────────────────────────────────────────────────

  /**
   * Arm a single setTimeout to fire shortly before the current access token
   * expires. Idempotent — clearing any previous timer first. Safe to call
   * from any session-write site (initial login, restore-from-storage, after
   * a successful rotation). No-op if there's no session in memory.
   *
   * Browser/RN background-tab throttling makes long-running setTimeouts
   * unreliable on their own; the `visibilitychange` listener compensates by
   * re-invoking `_maybeProactiveRefresh` whenever the app comes back to the
   * foreground, catching any timer that fired late or never fired at all.
   */
  private _scheduleNextRefresh(): void {
    this._clearRefreshTimer();
    if (this._destroyed) return;
    const expiresAt = this._session?.token?.expiresAt;
    if (typeof expiresAt !== 'number') return;
    // Clamp to the 32-bit setTimeout ceiling: a delay past ~24.8 days overflows
    // and fires immediately, which a bogus/huge `expiresAt` would turn into a
    // tight reschedule loop. Real AT TTLs are minutes, so this only guards bad data.
    const MAX_TIMEOUT_MS = 2_147_483_647;
    const dueInMs = Math.min(
      MAX_TIMEOUT_MS,
      Math.max(0, (expiresAt - Math.floor(Date.now() / 1000) - REFRESH_SKEW_SECONDS) * 1000),
    );
    this._refreshTimer = setTimeout(() => {
      void this._maybeProactiveRefresh();
    }, dueInMs);
  }

  /**
   * Decide whether to actually run a refresh right now. Called both from the
   * scheduler timer and from the visibility-change listener.
   *
   * Skip if:
   *   - no session / no RT (nothing to refresh)
   *   - app is hidden — wait for the visibility listener to re-trigger us
   *   - `maxIdleMs` configured and no client request since that window — let
   *     the next reactive 401-refresh handle it whenever the user comes back
   *   - the AT still has more than `REFRESH_SKEW_SECONDS` of life — reschedule
   *
   * Otherwise call `refresh()`, which uses the existing in-flight singleton
   * so we never collide with a reactive 401-triggered refresh. On a genuine
   * failure `_doRefresh` clears the session (listeners see `step:'idle'`); on a
   * transient network timeout it keeps the session and rejects — we just log and
   * leave it for the next reactive refresh / foreground re-trigger.
   */
  private async _maybeProactiveRefresh(): Promise<void> {
    if (this._destroyed) return;
    if (!this._session?.token?.refreshToken) return;
    if (!this._visibilityProvider.isVisible()) return;
    if (this._maxIdleMs !== undefined && Date.now() - this._lastRequestAt > this._maxIdleMs) return;
    const expiresAt = this._session.token.expiresAt;
    if (Math.floor(Date.now() / 1000) < expiresAt - REFRESH_SKEW_SECONDS) {
      this._scheduleNextRefresh();
      return;
    }
    try {
      await this.refresh();
    } catch (err) {
      this._log.warn('[PollarClient] Proactive refresh failed', err);
    }
  }

  private _clearRefreshTimer(): void {
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  // ─── Auth state ──────────────────────────────────────────────────────────────

  /**
   * Copy an auth state so an external reader can't mutate the live `_authState` /
   * `_session` — which the SDK's own request middleware reads
   * (`_session.token.accessToken`) and the next writeStorage() serializes —
   * through the object it received. Clones the nested `token`/`wallet`/`user`
   * too: a shallow session copy still shares those object refs, so
   * `state.session.token.accessToken = …` (or `.user.ready = …`) would otherwise
   * corrupt the live session the SDK signs with and persists.
   */
  private _cloneAuthState(s: AuthState): AuthState {
    if (s.step !== 'authenticated') return { ...s };
    return {
      ...s,
      session: {
        ...s.session,
        token: { ...s.session.token },
        wallet: { ...s.session.wallet },
        user: { ...s.session.user },
      },
    };
  }

  getAuthState(): AuthState {
    return this._cloneAuthState(this._authState);
  }

  onAuthStateChange(cb: (state: AuthState) => void): () => void {
    this._authStateListeners.add(cb);
    // Emit a clone on subscribe too, for the same reason as `_setAuthState`.
    cb(this._cloneAuthState(this._authState));
    return () => this._authStateListeners.delete(cb);
  }

  /**
   * Subscribe to persistent-storage degradation (Safari private mode,
   * sandboxed iframes, quota errors, etc.). The SDK keeps running off
   * in-memory storage after degrade, but sessions won't survive reload — a
   * host UI typically wants to show "your session won't be saved" so the
   * user isn't blindsided after a refresh.
   *
   * Fires at most once per client lifetime (the underlying adapter dedupes).
   * Late subscribers receive the latched state synchronously on subscribe.
   *
   * Only fires when the SDK constructs the default storage adapter. If you
   * pass a custom `config.storage`, wire your own notification path through
   * that adapter's API — the SDK has no hook into it.
   */
  onStorageDegrade(cb: OnStorageDegrade): () => void {
    this._storageDegradeListeners.add(cb);
    if (this._storageDegraded) {
      cb(this._storageDegraded.reason, this._storageDegraded.error);
    }
    return () => this._storageDegradeListeners.delete(cb);
  }

  private _dispatchStorageDegrade(reason: StorageDegradeReason, error?: unknown): void {
    if (this._storageDegraded) return;
    this._storageDegraded = { reason, error };
    for (const cb of this._storageDegradeListeners) {
      try {
        cb(reason, error);
      } catch (err) {
        this._log.error('[PollarClient] onStorageDegrade listener threw', err);
      }
    }
  }

  /** PII (email, names, avatar, providers). Held in memory only — never persisted. */
  getUserProfile(): PollarUserProfile | null {
    return this._profile;
  }

  // ─── Login (unified entry point) ─────────────────────────────────────────

  login(options: PollarLoginOptions): void {
    if (!isClientRuntime) {
      warnServerSide('login');
      return;
    }
    // A registered wallet adapter (freighter/albedo/privy/xbull/solana…): run the
    // wallet flow for its chain — SEP-10 for Stellar, SIWS for Solana. It yields a
    // persistent adapter reused for signing long after login.
    const walletAdapter = this._walletAdapters.get(options.provider);
    if (walletAdapter) {
      const walletController = this._newController();
      const deps = this._flowDeps(walletController.signal);
      const flow =
        walletAdapter.chain === 'SOLANA' ? loginWithSolanaAdapter(walletAdapter, deps) : loginWithAdapter(walletAdapter, deps);
      flow.catch((err) => this._handleFlowError(err, walletController.signal));
      return;
    }

    const provider = this._providers.get(options.provider);
    if (!provider?.login) {
      this._setAuthState({
        step: 'error',
        previousStep: this._authState.step,
        message: `No auth provider registered for '${options.provider}'`,
        errorCode: AUTH_ERROR_CODES.AUTH_FAILED,
      });
      return;
    }

    const controller = this._newController();
    // Wrap in Promise.resolve().then so a custom provider that throws
    // SYNCHRONOUSLY (before returning its promise) is routed through
    // _handleFlowError too, instead of escaping login()'s public API.
    Promise.resolve()
      .then(() => provider.login?.(this._providerContext(controller.signal), options))
      .catch((err) => this._handleFlowError(err, controller.signal));
  }

  /**
   * Invoke a named secondary step on a registered provider (e.g. email's
   * `sendCode` / `verifyCode`, or a custom provider's multi-step continuation).
   * Reuses the in-flight login `AbortController` when one exists so the step
   * stays cancellable via `cancelLogin()`; otherwise starts a fresh one. The
   * built-in email steps also have dedicated typed methods
   * ({@link sendEmailCode} / {@link verifyEmailCode}) — prefer those for email.
   */
  providerAction(provider: string, action: string, payload?: unknown): void {
    if (!isClientRuntime) {
      warnServerSide('providerAction');
      return;
    }
    const fn = this._providers.get(provider)?.actions?.[action];
    if (!fn) {
      throw new PollarFlowError(`Auth provider '${provider}' has no action '${action}'`);
    }
    const signal = this._activeLoginSignal();
    // See login() — guard against a custom action throwing synchronously.
    Promise.resolve()
      .then(() => fn(this._providerContext(signal), payload))
      .catch((err) => this._handleFlowError(err, signal));
  }

  // ─── Email OTP flow (3 steps) ─────────────────────────────────────────────

  beginEmailLogin(): void {
    if (!isClientRuntime) {
      warnServerSide('beginEmailLogin');
      return;
    }
    const controller = this._newController();
    initEmailSession(this._providerContext(controller.signal)).catch((err) => this._handleFlowError(err, controller.signal));
  }

  sendEmailCode(email: string): void {
    if (!isClientRuntime) {
      warnServerSide('sendEmailCode');
      return;
    }
    if (this._authState.step !== 'entering_email') {
      throw new PollarFlowError(`sendEmailCode() requires step 'entering_email', current step is '${this._authState.step}'`);
    }
    const { clientSessionId } = this._authState;
    // Reuse the active login controller if present, else mint one — matching the
    // other entry points; mint a fresh controller if there's none or the
    // existing one is already aborted (else this resend would hit a dead signal).
    const signal = this._activeLoginSignal();
    sendEmailCode(email, clientSessionId, this._providerContext(signal)).catch((err) => this._handleFlowError(err, signal));
  }

  verifyEmailCode(code: string): void {
    if (!isClientRuntime) {
      warnServerSide('verifyEmailCode');
      return;
    }
    const isRetryableError =
      this._authState.step === 'error' &&
      this._authState.clientSessionId != null &&
      (this._authState.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_INVALID ||
        this._authState.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_EXPIRED ||
        // A generic verify failure (transient 5xx / contract drift) is also
        // retryable — its error state now carries the clientSessionId/email.
        this._authState.errorCode === AUTH_ERROR_CODES.EMAIL_VERIFY_FAILED);

    if (this._authState.step !== 'entering_code' && !isRetryableError) {
      throw new PollarFlowError(`verifyEmailCode() requires step 'entering_code', current step is '${this._authState.step}'`);
    }
    const state = this._authState;
    const clientSessionId =
      state.step === 'entering_code' ? state.clientSessionId : (state as { clientSessionId?: string }).clientSessionId!;
    const email = state.step === 'entering_code' ? state.email : ((state as { email?: string }).email ?? '');

    const controller = this._newController();
    verifyAndAuthenticate(code, clientSessionId, email, this._providerContext(controller.signal)).catch((err) =>
      this._handleFlowError(err, controller.signal),
    );
  }

  /**
   * "Smart Wallet" login: runs the passkey (WebAuthn) `get()` ceremony for a
   * returning user and signs them in. Use {@link createSmartWallet} for a new
   * user. Requires the `passkey` ceremony to be configured (e.g. via
   * `@pollar/react`).
   */
  loginSmartWallet(): void {
    if (!isClientRuntime) {
      warnServerSide('loginSmartWallet');
      return;
    }
    const controller = this._newController();
    smartWalletFlow(this._flowDeps(controller.signal), 'login').catch((err) => this._handleFlowError(err, controller.signal));
  }

  /**
   * "Smart Wallet" registration: runs the passkey (WebAuthn) `create()` ceremony
   * for a new user and deploys a sponsored smart-account C-address. Use
   * {@link loginSmartWallet} for a returning user. Requires the `passkey`
   * ceremony to be configured (e.g. via `@pollar/react`).
   */
  createSmartWallet(): void {
    if (!isClientRuntime) {
      warnServerSide('createSmartWallet');
      return;
    }
    const controller = this._newController();
    smartWalletFlow(this._flowDeps(controller.signal), 'register').catch((err) =>
      this._handleFlowError(err, controller.signal),
    );
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────

  cancelLogin(): void {
    this._loginController?.abort();
    this._loginController = null;
    // Only reset to idle if a login was actually in progress. Don't flap an
    // already-authenticated session to idle — the session stays in storage and
    // would re-surface, a confusing visible logout-then-login. (Use logout() to
    // end an authenticated session.)
    if (this._authState.step !== 'authenticated') this._setAuthState({ step: 'idle' });
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  /**
   * Revoke the current session server-side, then clear local storage.
   *
   * Server revocation is best-effort: if the POST fails (offline, server
   * down), local state is wiped regardless. The orphan refresh token then
   * remains unused until its natural expiry. The in-flight access token
   * stays valid until its own TTL elapses (≤10 min for DPoP-bound tokens).
   *
   * Pass `everywhere: true` to revoke every active session for this user
   * across all devices.
   */
  async logout(options: { everywhere?: boolean } = {}): Promise<void> {
    if (!isClientRuntime) {
      warnServerSide('logout');
      return;
    }
    this._log.info('[PollarClient] Logout requested', { everywhere: !!options.everywhere });

    if (this._session?.token?.accessToken) {
      try {
        await this._api.POST('/auth/logout', {
          body: options.everywhere ? { everywhere: true } : {},
        });
      } catch (err) {
        this._log.warn('[PollarClient] Server logout failed (continuing with local clear)', err);
      }
    }

    // Tear down the active wallet adapter's own provider session (e.g. Privy)
    // on an explicit logout. `_clearSession()` only drops the in-memory adapter
    // reference; without this, the provider session persists across a reload and
    // the auto-login effect in `@pollar/react` (which subscribes to
    // `onProviderAuthChange`) silently re-authenticates the user. Only done here,
    // in the user-initiated logout path — not inside `_clearSession()`, which
    // also runs on transient refresh/resume failures where the provider session
    // must survive. Best-effort: a disconnect failure must not block the clear.
    const adapter = this._walletAdapter;
    if (adapter) {
      try {
        await adapter.disconnect();
      } catch (err) {
        this._log.warn('[PollarClient] Wallet adapter disconnect during logout failed', err);
      }
    }

    try {
      await this._clearSession();
    } catch (err) {
      this._log.warn('[PollarClient] Local logout cleanup failed', err);
    }
  }

  /** Convenience: revoke every active session for this user (all devices). */
  logoutEverywhere(): Promise<void> {
    return this.logout({ everywhere: true });
  }

  /**
   * List active sessions for the authenticated user. Returns one entry per
   * refresh-token family with the metadata captured at issuance time. The
   * `current` flag identifies which entry corresponds to this client.
   */
  async listSessions(): Promise<SessionInfo[]> {
    if (!isClientRuntime) {
      warnServerSide('listSessions');
      return [];
    }
    if (!this._session?.token?.accessToken) {
      throw new Error('[PollarClient] listSessions requires an authenticated session');
    }
    const { data, error } = await this._api.GET('/auth/sessions');
    if (error || !data?.success) {
      throw new Error('[PollarClient] Failed to list sessions');
    }
    return data.content.sessions;
  }

  getSessionsState(): SessionsState {
    return this._sessionsState;
  }

  onSessionsStateChange(cb: (state: SessionsState) => void): () => void {
    this._sessionsStateListeners.add(cb);
    cb(this._sessionsState);
    return () => this._sessionsStateListeners.delete(cb);
  }

  /**
   * Fire-and-forget variant of {@link listSessions} that drives the observable
   * `SessionsState` store instead of returning the array. UI layers subscribe
   * via `onSessionsStateChange` and stay pure readers — mirrors `fetchTxHistory`.
   */
  async fetchSessions(): Promise<void> {
    const gen = ++this._sessionsGen;
    this._setSessionsState({ step: 'loading' });
    try {
      const sessions = await this.listSessions();
      if (gen !== this._sessionsGen) return; // a newer fetch superseded this one
      this._setSessionsState({ step: 'loaded', sessions });
    } catch (err) {
      if (gen !== this._sessionsGen) return;
      const message = err instanceof Error ? err.message : 'Failed to load sessions';
      this._setSessionsState({ step: 'error', message });
    }
  }

  /**
   * Revoke a specific refresh-token family (a single device session). Use
   * `listSessions` to enumerate the familyIds. Revoking the current session
   * does NOT clear local state — call `logout()` for that case.
   */
  async revokeSession(familyId: string): Promise<void> {
    if (!isClientRuntime) {
      warnServerSide('revokeSession');
      return;
    }
    if (!this._session?.token?.accessToken) {
      throw new Error('[PollarClient] revokeSession requires an authenticated session');
    }
    const { error } = await this._api.DELETE('/auth/sessions/{familyId}', {
      params: { path: { familyId } },
    });
    if (error) {
      throw new Error('[PollarClient] Failed to revoke session');
    }
  }

  // ─── Network ──────────────────────────────────────────────────────────────

  getNetwork(): StellarNetwork {
    return this._networkState.step === 'connected' ? this._networkState.network : 'testnet';
  }

  getNetworkState(): NetworkState {
    return this._networkState;
  }

  /**
   * The client's level-gated logger (built from `logLevel` / `logger`). Exposed
   * so the runtime layer (`@pollar/react`) can route its own logs through the
   * same level and sink instead of calling `console` directly.
   */
  getLogger(): PollarLogger {
    return this._log;
  }

  setNetwork(network: StellarNetwork): void {
    this._setNetworkState({ step: 'connected', network });
  }

  onNetworkStateChange(cb: (state: NetworkState) => void): () => void {
    this._networkStateListeners.add(cb);
    cb(this._networkState);
    return () => this._networkStateListeners.delete(cb);
  }

  // ─── Transaction state ────────────────────────────────────────────────────

  getTransactionState(): TransactionState | null {
    return this._transactionState;
  }

  onTransactionStateChange(cb: (state: TransactionState) => void): () => void {
    this._transactionStateListeners.add(cb);
    if (this._transactionState) cb(this._transactionState);
    return () => this._transactionStateListeners.delete(cb);
  }

  /**
   * Reset the transaction state machine back to `idle`. Modal UIs (send / swap /
   * earn) call this when they (re)open so a prior terminal state — a `success`
   * or `error` left over from an earlier flow — can't leak in as a stale "Done!"
   * or error screen.
   */
  resetTransactionState(): void {
    // Align the tx generation with the live session so the stale-write guard in
    // `_setTransactionState` doesn't drop this reset.
    this._txStartGen = this._sessionGeneration;
    this._setTransactionState({ step: 'idle' });
  }

  // ─── Tx history ──────────────────────────────────────────────────────────

  getTxHistoryState(): TxHistoryState {
    return this._txHistoryState;
  }

  onTxHistoryStateChange(cb: (state: TxHistoryState) => void): () => void {
    this._txHistoryStateListeners.add(cb);
    cb(this._txHistoryState);
    return () => this._txHistoryStateListeners.delete(cb);
  }

  async fetchTxHistory(params: TxHistoryParams = {}): Promise<void> {
    const gen = ++this._txHistoryGen;
    this._setTxHistoryState({ step: 'loading', params });
    try {
      const { data, error } = await this._api.GET('/tx/history', { params: { query: params } });
      if (gen !== this._txHistoryGen) return; // a newer fetch superseded this one
      if (!error && data?.success && data.content) {
        this._setTxHistoryState({ step: 'loaded', params, data: data.content });
      } else {
        const message = (error as { message?: string } | undefined)?.message ?? 'Failed to load history';
        this._setTxHistoryState({ step: 'error', params, message });
      }
    } catch {
      if (gen !== this._txHistoryGen) return;
      this._setTxHistoryState({ step: 'error', params, message: 'Failed to load history' });
    }
  }

  // ─── Wallet balance ───────────────────────────────────────────────────────

  getWalletBalanceState(): WalletBalanceState {
    return this._walletBalanceState;
  }

  onWalletBalanceStateChange(cb: (state: WalletBalanceState) => void): () => void {
    this._walletBalanceStateListeners.add(cb);
    cb(this._walletBalanceState);
    return () => this._walletBalanceStateListeners.delete(cb);
  }

  /**
   * Refreshes the balances of the authenticated user's OWN wallet. The wallet
   * and network are resolved server-side from the session — no arguments. Drives
   * `walletBalanceState`. For an arbitrary wallet, use {@link getWalletBalance}.
   */
  async refreshBalance(): Promise<void> {
    if (!this._session?.wallet?.address) {
      ++this._walletBalanceGen; // supersede any in-flight load (e.g. wallet went away)
      this._setWalletBalanceState({ step: 'error', message: 'No wallet connected' });
      return;
    }
    const gen = ++this._walletBalanceGen;
    this._setWalletBalanceState({ step: 'loading' });
    try {
      const { data, error } = await this._api.GET('/wallet/balance');
      if (gen !== this._walletBalanceGen) return; // a newer refresh superseded this one
      if (!error && data?.success && data.content) {
        // v2 returns one entry per chain the app is provisioned on; flatten into a
        // single asset list tagged with each asset's chain (see _flattenBalances).
        this._setWalletBalanceState({
          step: 'loaded',
          data: this._flattenBalances(data.content, this._session?.wallet?.address ?? ''),
        });
      } else {
        this._setWalletBalanceState({ step: 'error', message: 'Failed to load balance' });
      }
    } catch {
      if (gen !== this._walletBalanceGen) return;
      this._setWalletBalanceState({ step: 'error', message: 'Failed to load balance' });
    }
  }

  /**
   * Collapses the v2 multichain balance (`{ balances: [{ chain, ... }] }`) into the
   * flat, chain-tagged {@link WalletBalanceContent} the UI consumes.
   *
   * Every chain reports the same `balances` array — its native coin plus each token
   * the app enabled — so one loop handles all three. `multichain` is set when more
   * than one chain came back: the modal uses it to decide whether to show a
   * per-asset network tag. A chain that failed to resolve carries `error` instead
   * of `balances` and contributes nothing.
   */
  private _flattenBalances(content: unknown, ownAddress: string): WalletBalanceContent {
    const chains = (content as { chains?: unknown[] })?.chains ?? [];
    const flat: WalletBalanceRecord[] = [];
    let exists = false;
    let network = this.getNetwork() as string;

    for (const entry of chains as Array<Record<string, unknown>>) {
      const chain = entry.chain as WalletChain | undefined;
      if (!chain || entry.error) continue;
      if (entry.exists) exists = true;
      // Only Stellar's entry carries the session's network; the other chains ride
      // the same testnet/mainnet choice and don't restate it.
      if (chain === 'STELLAR' && typeof entry.network === 'string') network = entry.network;

      for (const b of (entry.balances as Array<Record<string, unknown>>) ?? []) {
        // null balance = the chain could not be read. Preserved, never coerced to
        // '0', so the UI can tell "unavailable" from "empty".
        const balance = typeof b.balance === 'string' ? b.balance : null;
        const available = typeof b.available === 'string' ? b.available : balance;
        flat.push({
          chain,
          ...(typeof b.type === 'string' ? { type: b.type as NonNullable<WalletBalanceRecord['type']> } : {}),
          code: String(b.code ?? ''),
          ...(typeof b.issuer === 'string' ? { issuer: b.issuer } : {}),
          ...(typeof b.decimals === 'number' ? { decimals: b.decimals } : {}),
          balance,
          available,
          ...(typeof b.limit === 'string' ? { limit: b.limit } : {}),
          ...(typeof b.enabledInApp === 'boolean' ? { enabledInApp: b.enabledInApp } : {}),
          ...(typeof b.trustlineRemoved === 'boolean' ? { trustlineRemoved: b.trustlineRemoved } : {}),
          ...(typeof b.sponsored === 'boolean' ? { sponsored: b.sponsored } : {}),
        });
      }
    }

    return {
      publicKey: ownAddress,
      network,
      exists,
      multichain: chains.length > 1,
      balances: flat,
    };
  }

  /**
   * The {@link _flattenBalances} twin for `/wallet/assets`: collapses the v2
   * per-chain answer into one chain-tagged catalog. Same envelope (`chains`),
   * same rules — a chain carrying `error` contributes nothing, and only Stellar
   * restates the network.
   */
  private _flattenAssets(content: unknown, ownAddress: string): WalletAssetsContent {
    const chains = (content as { chains?: unknown[] })?.chains ?? [];
    const flat: EnabledAssetRecord[] = [];
    let exists = false;
    let network = this.getNetwork() as string;

    for (const entry of chains as Array<Record<string, unknown>>) {
      const chain = entry.chain as WalletChain | undefined;
      if (!chain || entry.error) continue;
      if (entry.exists) exists = true;
      if (chain === 'STELLAR' && typeof entry.network === 'string') network = entry.network;

      for (const a of (entry.assets as Array<Record<string, unknown>>) ?? []) {
        flat.push({
          chain,
          ...(typeof a.type === 'string' ? { type: a.type as NonNullable<EnabledAssetRecord['type']> } : {}),
          code: String(a.code ?? ''),
          ...(typeof a.issuer === 'string' ? { issuer: a.issuer } : {}),
          ...(typeof a.decimals === 'number' ? { decimals: a.decimals } : {}),
          ...(typeof a.name === 'string' ? { name: a.name } : {}),
          ...(typeof a.trustlineEstablished === 'boolean' ? { trustlineEstablished: a.trustlineEstablished } : {}),
          ...(typeof a.limit === 'string' ? { limit: a.limit } : {}),
          ...(typeof a.enabledInApp === 'boolean' ? { enabledInApp: a.enabledInApp } : {}),
          ...(typeof a.sponsored === 'boolean' ? { sponsored: a.sponsored } : {}),
        });
      }
    }

    return { publicKey: ownAddress, network, exists, multichain: chains.length > 1, assets: flat };
  }

  /**
   * General-purpose balance lookup for ANY wallet on ANY network — not scoped
   * to this application. Enumerates the account's real on-chain holdings via
   * Horizon (server-side) and returns the data directly (no reactive state).
   * `network` defaults to the client's current network.
   */
  async getWalletBalance(publicKey: string, network?: StellarNetwork): Promise<WalletBalanceContent> {
    const { data, error } = await this._api.GET('/wallet/{publicKey}/balance', {
      params: { path: { publicKey }, query: { network: network ?? this.getNetwork() } },
    });
    if (error || !data?.success || !data.content) {
      throw new Error('[PollarClient] Failed to load wallet balance');
    }
    return data.content;
  }

  // ─── Enabled assets ───────────────────────────────────────────────────────

  getEnabledAssetsState(): EnabledAssetsState {
    return this._enabledAssetsState;
  }

  onEnabledAssetsStateChange(cb: (state: EnabledAssetsState) => void): () => void {
    this._enabledAssetsStateListeners.add(cb);
    cb(this._enabledAssetsState);
    return () => this._enabledAssetsStateListeners.delete(cb);
  }

  /**
   * Loads the application's enabled assets paired with the authenticated
   * wallet's on-chain trustline state — so the SDK knows which trustlines still
   * need to be added. Wallet and network are resolved server-side from the
   * session. Drives `enabledAssetsState`; mirrors {@link refreshBalance}.
   */
  async refreshAssets(): Promise<void> {
    if (!this._session?.wallet?.address) {
      ++this._enabledAssetsGen; // supersede any in-flight load (e.g. wallet went away)
      this._setEnabledAssetsState({ step: 'error', message: 'No wallet connected' });
      return;
    }
    const gen = ++this._enabledAssetsGen;
    this._setEnabledAssetsState({ step: 'loading' });
    try {
      const { data, error } = await this._api.GET('/wallet/assets');
      if (gen !== this._enabledAssetsGen) return; // a newer refresh superseded this one
      if (!error && data?.success && data.content) {
        // v2 answers per chain; flatten into one chain-tagged list (see
        // _flattenAssets), the same way refreshBalance does.
        this._setEnabledAssetsState({
          step: 'loaded',
          data: this._flattenAssets(data.content, this._session?.wallet?.address ?? ''),
        });
      } else {
        this._setEnabledAssetsState({ step: 'error', message: 'Failed to load assets' });
      }
    } catch {
      if (gen !== this._enabledAssetsGen) return;
      this._setEnabledAssetsState({ step: 'error', message: 'Failed to load assets' });
    }
  }

  /**
   * Establishes (omit `limit`) or removes (`limit: '0'`) a trustline for an asset.
   *
   * The app config decides who pays, server-side — the SDK never pre-decides.
   * Sponsorship is **on by default** (the app covers the 0.5 XLM reserve + fee
   * when eligible); pass `skipSponsorship` to force the user's own wallet to pay,
   * mirroring the opt-out on the payment / swap / contract fee-bump surfaces. The
   * route is by wallet type, and each server endpoint sponsors-or-self-pays:
   *  - **Custodial** (internal wallet, no adapter) → one call to
   *    `/wallet/assets/trustline`: the server holds the trustor key and either
   *    sponsors or self-pays, then submits, returning the refreshed asset list.
   *  - **External/adapter** → `/wallet/assets/trustline/build` returns a
   *    `changeTrust` XDR (sponsor-signed when covered, or a plain self-pay one
   *    otherwise); the user's own wallet adds the trustor signature and submits.
   *  - **`skipSponsorship`** → a plain self-pay `change_trust` via {@link runTx},
   *    bypassing the sponsoring endpoints for both wallet types.
   *
   * Does not refresh on its own — callers should `refreshAssets()` afterwards.
   */
  async setTrustline(
    asset: { code: string; issuer: string },
    opts?: {
      limit?: string;
      /**
       * Force self-pay even when the app would sponsor the trustline — the
       * opt-out that mirrors `skipSponsorship` on the payment / swap / contract
       * fee-bump surfaces.
       */
      skipSponsorship?: boolean;
    },
  ): Promise<TrustlineOutcome> {
    const limit = opts?.limit;
    const walletType = this._session?.wallet?.type;

    if (!this._session?.wallet?.address) {
      return { status: 'error', details: 'No wallet connected' };
    }
    if (walletType === 'smart') {
      // Passkey C-addresses hold SAC tokens — they don't use classic trustlines.
      return { status: 'error', details: 'Trustlines do not apply to smart wallets' };
    }
    // A Stellar asset code is 1–12 chars (alphanum4 ≤4, alphanum12 5–12). Reject
    // out-of-range codes up front — otherwise the self-paid path would emit an
    // empty-code alphanum4 or an invalid >12 alphanum12 and the backend 400s.
    if (asset.code.length < 1 || asset.code.length > 12) {
      return { status: 'error', details: 'Asset code must be 1–12 characters' };
    }

    // The backend's change_trust schema is a discriminated union on `type`, so
    // derive it from the code length (1–4 → alphanum4, 5–12 → alphanum12).
    const changeTrustParams = {
      asset: {
        type: asset.code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12',
        code: asset.code,
        issuer: asset.issuer,
      },
      ...(limit !== undefined && { limit }),
    } as TxBuildBody['params'];

    // Client-forced self-pay: bypass the sponsoring endpoints and sign a plain
    // change_trust with the user's own wallet.
    if (opts?.skipSponsorship) {
      return this.runTx('change_trust', changeTrustParams);
    }

    // Custodial: one server call. The server sponsors when the app config allows
    // and self-pays otherwise, submitting either way and returning the refreshed
    // asset list — the client no longer decides the route.
    if (!this._walletAdapter && walletType === 'internal') {
      try {
        const { data, error } = await this._api.POST('/wallet/assets/trustline', {
          body: { code: asset.code, issuer: asset.issuer, ...(limit !== undefined && { limit }) },
        });
        if (!error && data?.success) {
          if (data.content) {
            // Bump the assets generation so a refreshAssets() that was in flight
            // can't clobber this post-trustline (fresher) snapshot.
            ++this._enabledAssetsGen;
            this._setEnabledAssetsState({ step: 'loaded', data: data.content });
          }
          return { status: 'success' };
        }
        const details =
          (error as { details?: string; code?: string } | undefined)?.details ??
          (error as { code?: string } | undefined)?.code;
        return { status: 'error', ...(details && { details }) };
      } catch (err) {
        const details = err instanceof Error ? err.message : undefined;
        return { status: 'error', ...(details && { details }) };
      }
    }

    // External/adapter: the trustor key lives client-side. The server returns a
    // changeTrust XDR — sponsor-signed when the app covers it, or a plain self-pay
    // one otherwise — and we add the trustor signature with the user's own wallet
    // and submit either way.
    try {
      const { data, error } = await this._api.POST('/wallet/assets/trustline/build', {
        body: { code: asset.code, issuer: asset.issuer, ...(limit !== undefined && { limit }) },
      });
      // Sponsor-signed when the app covers it, plain self-pay otherwise; sign + submit either.
      const xdr = data?.content?.sponsorSignedXdr ?? data?.content?.unsignedXdr;
      if (error || !data?.success || !xdr) {
        const details =
          (error as { details?: string; code?: string } | undefined)?.details ??
          (error as { code?: string } | undefined)?.code;
        return { status: 'error', ...(details && { details }) };
      }
      const signed = await this.signTx(xdr);
      if (signed.status === 'error') {
        return { status: 'error', ...(signed.details && { details: signed.details }) };
      }
      return this.submitTx(signed.signedXdr);
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      return { status: 'error', ...(details && { details }) };
    }
  }

  /**
   * Create this wallet's account on the Stellar network when it doesn't exist
   * yet. For EXTERNAL wallets (Freighter / client-side Privy) whose key the
   * platform doesn't hold: the server builds a sponsored `createAccount` (the new
   * account starts at "0" balance; the app's sponsor wallet pays the base reserve
   * and fee) and signs only the sponsor. This client adds the new-account
   * signature with the user's own wallet and broadcasts it via the submit path.
   *
   * Not applicable to custodial (internal) wallets — those are created on the
   * server at login — nor to smart (C-address) wallets, which don't use classic
   * accounts. Trustlines are a separate step: see {@link setTrustline}.
   */
  async createAccount(): Promise<SubmitOutcome> {
    const walletType = this._session?.wallet?.type;
    if (!this._session?.wallet?.address) {
      return { status: 'error', details: 'No wallet connected' };
    }
    if (walletType === 'smart') {
      return { status: 'error', details: 'Account creation does not apply to smart wallets' };
    }
    if (!this._walletAdapter && walletType === 'internal') {
      return { status: 'error', details: 'Custodial wallets are created on the server at login' };
    }

    try {
      const { data, error } = await this._api.POST('/wallet/account/create/build', {});
      if (error || !data?.success || !data.content?.sponsorSignedXdr) {
        const details =
          (error as { details?: string; code?: string } | undefined)?.details ?? (error as { code?: string } | undefined)?.code;
        return { status: 'error', ...(details && { details }) };
      }
      const signed = await this.signTx(data.content.sponsorSignedXdr);
      if (signed.status === 'error') {
        return { status: 'error', ...(signed.details && { details: signed.details }) };
      }
      return this.submitTx(signed.signedXdr);
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      return { status: 'error', ...(details && { details }) };
    }
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  /**
   * Builds an unsigned XDR. Drives `_setTransactionState` for modal-style UIs
   * AND returns a {@link BuildOutcome} so headless callers can `await` and
   * inspect the result without subscribing to state changes.
   */
  async buildTx(
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ): Promise<BuildOutcome> {
    this._txStartGen = this._sessionGeneration;
    if (!this._session?.wallet?.address) {
      const details = 'No wallet connected';
      this._setTransactionState({ step: 'error', phase: 'building', details });
      return { status: 'error', details };
    }

    const body = {
      address: this._session.wallet.address,
      operation,
      params,
      options: options ?? {},
    } as TxBuildBody;

    try {
      this._setTransactionState({ step: 'building' });
      const { data, error } = await this._api.POST('/tx/build', { body });
      if (!error && data?.success && data.content) {
        this._setTransactionState({ step: 'built', buildData: data.content });
        return { status: 'built', buildData: data.content };
      }
      const details = (error as { details?: string } | undefined)?.details;
      this._setTransactionState({ step: 'error', phase: 'building', ...(details && { details }) });
      return { status: 'error', ...(details && { details }) };
    } catch (err) {
      this._log.error('[PollarClient] buildTx failed', err);
      this._setTransactionState({ step: 'error', phase: 'building' });
      return { status: 'error' };
    }
  }

  getWalletType(): WalletId | null {
    return this._walletAdapter?.type ?? null;
  }

  /**
   * The registered wallet adapters (built-in Freighter/Albedo first, then any
   * `config.walletAdapters`), as `{ id, meta }` for the login UI to render one
   * button per adapter. Reach a login via `login({ provider: id })`.
   */
  listWalletAdapters(): { id: WalletId; meta: WalletAdapterMeta }[] {
    return Array.from(this._walletAdapters.values()).map((a) => ({ id: a.type, meta: this._safeMeta(a.meta) }));
  }

  /**
   * Get a registered wallet adapter instance by id. Used by the login UI to reach
   * an adapter's interactive-login methods (see {@link isInteractiveAuthAdapter})
   * before handing off to `login({ provider: id })`.
   */
  getWalletAdapter(id: WalletId): WalletAdapter | undefined {
    return this._walletAdapters.get(id);
  }

  /**
   * Sanitize adapter-supplied meta before exposing it to a login UI. A
   * third-party `walletAdapters` entry is consumer-chosen code, but a buggy or
   * hostile one could set `iconUrl` to an arbitrary URL that the login modal
   * fetches on render (a tracking beacon leaking "user opened login" + IP).
   * Only allow `https:` and inline `data:image/` icons; drop anything else.
   */
  private _safeMeta(meta: WalletAdapterMeta): WalletAdapterMeta {
    if (!meta.iconUrl) return meta;
    const ok = /^https:\/\//i.test(meta.iconUrl) || /^data:image\//i.test(meta.iconUrl);
    if (ok) return meta;
    this._log.warn(
      `[PollarClient] Dropped wallet adapter '${meta.label}' iconUrl with a disallowed scheme (use https: or data:image/).`,
    );
    // Omit iconUrl entirely (exactOptionalPropertyTypes forbids `iconUrl: undefined`).
    const { iconUrl: _dropped, ...safe } = meta;
    return safe;
  }

  /**
   * The authenticated user's wallet as a {@link WalletInfo} discriminated union,
   * or `null` when there's no session (or the session carries no address yet).
   *
   * `custody` strictly determines `provider` (the mapping is 1:1 and fixed at
   * account creation server-side): `external` reports the connected adapter id
   * (`getWalletType()`), `smart` is always `'passkey'`, and `internal` reports
   * the login method the backend recorded (`null` for pre-provider sessions).
   */
  getWallet(): WalletInfo | null {
    // `chain` is omitted: this field is Stellar by definition, and saying so
    // explicitly would imply the caller can find a non-Stellar value here.
    return this._toWalletInfo(this._session?.wallet, { includeChain: false });
  }

  /**
   * Every wallet the user holds, one per chain, as {@link WalletInfo} values —
   * a superset of {@link getWallet}. Each entry carries `chain` when the
   * backend reported it.
   *
   * Returns `[]` when there is no session. A session that predates the
   * backend's multi-chain `wallets[]` has nothing to enumerate, so this falls
   * back to the single Stellar wallet rather than reporting `[]` and making a
   * funded user look walletless. Entries with no address yet (e.g. a smart
   * account mid-deploy) are dropped, matching `getWallet()`'s `null`.
   */
  getWallets(): WalletInfo[] {
    const session = this._session;
    if (!session) return [];

    const source = session.wallets ?? [session.wallet];
    return source.map((w) => this._toWalletInfo(w, { includeChain: true })).filter((w): w is WalletInfo => w !== null);
  }

  /**
   * Maps a persisted wallet to the public {@link WalletInfo} union. Shared by
   * `getWallet` and `getWallets` so the two can never disagree about how a
   * given custody is presented.
   */
  private _toWalletInfo(w: PollarPersistedWallet | undefined, opts: { includeChain: boolean }): WalletInfo | null {
    if (!w || !w.address) return null;
    // Wallet-status extras carried on every custody (see WalletInfo).
    const extra = {
      ...(opts.includeChain && w.chain !== undefined ? { chain: w.chain } : {}),
      ...(w.existsOnStellar !== undefined ? { existsOnStellar: w.existsOnStellar } : {}),
      ...(w.fundingMode !== undefined ? { fundingMode: w.fundingMode } : {}),
    };
    switch (w.type) {
      case 'external':
        // The on-chain adapter id is only known client-side, from the adapter
        // currently attached — it is never persisted.
        return { custody: 'external', address: w.address, provider: this._walletAdapter?.type ?? null, ...extra };
      case 'smart':
        return { custody: 'smart', address: w.address, provider: 'passkey', ...extra };
      case 'internal':
        return { custody: 'internal', address: w.address, provider: (w.provider as string | undefined) ?? null, ...extra };
      default:
        return null;
    }
  }

  /**
   * Signs the given unsigned XDR and returns the signed XDR.
   *
   * - External wallets: signs locally via the wallet adapter.
   * - Custodial wallets: posts to `/tx/sign`. The backend signs (through
   *   wallet-service or the app's customer-managed adapter) and returns the
   *   signed XDR plus an `idempotencyKey` the caller should echo back to
   *   `submitTx`.
   *
   * Drives `_setTransactionState`: emits `signing` while in flight and
   * `signed` on success (or `error[phase: 'signing']` on failure). `buildData`
   * is threaded through if the consumer previously called `buildTx`.
   */
  /**
   * For an EXTERNAL-wallet session whose signing adapter isn't attached (the host
   * didn't re-register the same `walletAdapters` this run, or the persisted
   * walletType row was lost), the custodial signer can't help: the platform holds
   * no key for a user-owned wallet. Return a clear reconnect error so the host can
   * prompt the user, instead of POSTing to the custodial endpoint for a confusing
   * 4xx. The session stays valid (reads/refresh still work); only signing needs the
   * wallet reconnected, so this is an error, NOT a logout.
   */
  private _externalSignerMissing(): { status: 'error'; details: string } | null {
    if (this._session?.wallet?.type === 'external' && !this._walletAdapter) {
      return { status: 'error', details: 'Wallet not connected. Reconnect your wallet to sign.' };
    }
    return null;
  }

  async signTx(unsignedXdr: string, options?: { skipSponsorship?: boolean }): Promise<SignOutcome> {
    this._txStartGen = this._sessionGeneration;
    const noSigner = this._externalSignerMissing();
    if (noSigner) return noSigner;
    // Smart-wallet (C-address/passkey) sessions sign via signAndSubmitTx
    // (_signSubmitSmart's passkey ceremony), not signTx. Bail BEFORE emitting any
    // tx state so a UI subscribed to onTransactionStateChange isn't stranded on
    // 'signing' (mirrors signAuthEntry, which emits no tx state for this case).
    if (this._session?.wallet?.type === 'smart') {
      return {
        status: 'error',
        details: 'signTx is not supported for smart (passkey) wallets; use signAndSubmitTx.',
      };
    }
    const buildData = this._currentBuildData();
    this._setTransactionState({ step: 'signing', ...(buildData && { buildData }) });

    // External adapter signs directly (smart sessions already returned above).
    if (this._walletAdapter) {
      const accountToSign = this._session?.wallet?.address;
      const signOpts = accountToSign
        ? { networkPassphrase: this._networkPassphrase(), accountToSign }
        : { networkPassphrase: this._networkPassphrase() };
      // Stellar XDR signing. A non-Stellar adapter never reaches the /tx pipeline
      // (Solana uses the atomic transfer), so a missing method is a bug, not flow.
      if (!this._walletAdapter.signTransaction) {
        throw new Error(`[PollarClient] wallet adapter "${this._walletAdapter.type}" cannot sign a Stellar transaction`);
      }
      try {
        const { signedTxXdr } = await this._walletAdapter.signTransaction(unsignedXdr, signOpts);
        this._setTransactionState({
          step: 'signed',
          signedXdr: signedTxXdr,
          ...(buildData && { buildData }),
        });
        return { status: 'signed', signedXdr: signedTxXdr };
      } catch (err) {
        const details = err instanceof Error ? err.message : undefined;
        this._setTransactionState({
          step: 'error',
          phase: 'signing',
          ...(buildData && { buildData }),
          ...(details && { details }),
        });
        return { status: 'error', ...(details && { details }) };
      }
    }

    // Custodial path: backend signs and returns the XDR + idempotencyKey. By
    // default the backend also applies sponsorship (per the app's dashboard
    // config), returning a fee-bumped envelope the caller can broadcast directly
    // — the app pays the fee. Pass `skipSponsorship` to force the user to pay.
    const address = this._session?.wallet?.address ?? '';
    try {
      const { data, error } = await this._api.POST('/tx/sign', {
        body: { address, unsignedXdr, ...(options?.skipSponsorship && { skipSponsorship: true }) },
      });
      if (!error && data?.success && data.content?.signedXdr) {
        const { signedXdr, idempotencyKey, sponsored } = data.content;
        this._setTransactionState({
          step: 'signed',
          signedXdr,
          submissionToken: idempotencyKey,
          ...(buildData && { buildData }),
        });
        return { status: 'signed', signedXdr, submissionToken: idempotencyKey, sponsored };
      }
      const { details, code, message } = this._resolveTxApiError(error, data);
      this._setTransactionState({
        step: 'error',
        phase: 'signing',
        ...(buildData && { buildData }),
        ...(details && { details }),
        ...(code && { code }),
        ...(message && { message }),
      });
      return { status: 'error', ...(details && { details }), ...(code && { code }), ...(message && { message }) };
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      this._setTransactionState({
        step: 'error',
        phase: 'signing',
        ...(buildData && { buildData }),
        ...(details && { details }),
      });
      return { status: 'error', ...(details && { details }) };
    }
  }

  /**
   * Sign a single Soroban authorization entry (`SorobanAuthorizationEntry`).
   *
   * Use this when a contract is the transaction source (e.g. it sponsors the
   * gas and swaps the fee out of the user's token) and only needs the user's
   * address-credentials authorization, not a full signed envelope. The signed
   * entry is returned as base64 XDR for the caller to compose into its tx.
   *
   * - External wallets (Freighter/Albedo) sign the entry via the provider.
   * - Custodial wallets are signed by the backend, which FIRST validates the
   *   entry's invocation tree against the app's contract/function allowlist and
   *   caps the validity window — entries touching a non-allowlisted contract or
   *   function, or expiring too far ahead, are rejected.
   *
   * @param entryXdr base64 XDR of the unsigned `SorobanAuthorizationEntry`.
   * @param options.validUntilLedger absolute ledger the signature expires at
   *   (computed from the network's latest ledger). Ignored on the external-wallet
   *   path, where the provider sets its own expiration.
   */
  async signAuthEntry(entryXdr: string, options: { validUntilLedger: number }): Promise<SignAuthEntryOutcome> {
    const noSigner = this._externalSignerMissing();
    if (noSigner) return noSigner;
    // External adapter: the provider signs the entry directly. Skip it for a
    // smart-wallet session (passkey-signed) so a stale/foreign adapter can't
    // hijack signing — consistent with the type-first signing paths.
    if (this._walletAdapter && this._session?.wallet?.type !== 'smart') {
      const accountToSign = this._session?.wallet?.address;
      // Soroban auth-entry signing is Stellar-only; a non-Stellar adapter never
      // reaches this path.
      if (!this._walletAdapter.signAuthEntry) {
        throw new Error(`[PollarClient] wallet adapter "${this._walletAdapter.type}" cannot sign a Soroban auth entry`);
      }
      try {
        const { signedAuthEntry } = await this._walletAdapter.signAuthEntry(entryXdr, {
          // Pass the CURRENT network (like signTx) so an external adapter signs
          // on the configured network even after a mid-session setNetwork(), not
          // a network captured when the adapter was constructed.
          networkPassphrase: this._networkPassphrase(),
          ...(accountToSign ? { accountToSign } : {}),
        });
        return { status: 'signed', signedAuthEntry };
      } catch (err) {
        const details = err instanceof Error ? err.message : undefined;
        return { status: 'error', ...(details && { details }) };
      }
    }

    // Smart-wallet (C-address/passkey) sessions sign auth entries with their
    // passkey credential, NOT the custodial endpoint. Standalone signAuthEntry
    // doesn't run that ceremony, so return an explicit, actionable error instead
    // of silently POSTing to /tx/sign-auth-entry (which would sign with the wrong
    // key / 4xx). Mirrors the smart guards on the signing paths.
    if (this._session?.wallet?.type === 'smart') {
      return {
        status: 'error',
        details: 'signAuthEntry is not supported for smart (passkey) wallets in this SDK build.',
      };
    }

    // Custodial path: backend enforces the app's auth-entry policy, then signs.
    const address = this._session?.wallet?.address ?? '';
    try {
      const { data, error } = await this._api.POST('/tx/sign-auth-entry', {
        body: { address, entryXdr, validUntilLedger: options.validUntilLedger },
      });
      if (!error && data?.success && data.content?.signedAuthEntry) {
        return { status: 'signed', signedAuthEntry: data.content.signedAuthEntry };
      }
      const details = (error as { details?: string } | undefined)?.details;
      return { status: 'error', ...(details && { details }) };
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      return { status: 'error', ...(details && { details }) };
    }
  }

  /**
   * Submits a signed XDR via `/tx/submit` regardless of wallet type
   * (custodial or external). Routing through sdk-api gives us:
   *   - End-to-end tx_records persistence with full phase lifecycle so the
   *     developer dashboard can show every tx (both custodial and external
   *     wallet flows) at `/apps/:id/monitor/transactions`.
   *   - Idempotency tracking via `submissionToken` (returned by `signTx`).
   *   - A single response shape (SUCCESS / PENDING / FAILED) shared by both
   *     flows — previously external wallets could only return SUCCESS or
   *     error since the direct-to-Horizon path was synchronous.
   *
   * The extra hop adds ~50–150 ms vs. the legacy direct-Horizon path; the
   * persistence + observability win is worth it.
   *
   * Drives `_setTransactionState`: emits `submitting` while in flight,
   * `submitted` on Horizon ack (pending), `success` on ledger confirmation,
   * or `error[phase: 'submitting']` on failure.
   */
  /**
   * Normalize a backend API error into { details, code, message }. `code` is the
   * precise backend ErrorCode (e.g. `TX_FEE_LIMIT_EXCEEDED`) for programmatic
   * handling; `message` is a friendly string from the error catalog; `details`
   * is the raw diagnostic. Lets tx flows surface a typed reason instead of an
   * opaque details string.
   */
  private _resolveTxApiError(error: unknown, data?: unknown): { details?: string; code?: string; message?: string } {
    // On a non-2xx the failure envelope is in `error`; on a 2xx with
    // `success:false` it rides in `data` — fall back to it so the backend's
    // code/message contract isn't dropped on the 2xx-failure path.
    const e = (error ?? data) as { details?: string; code?: string; message?: string } | undefined;
    const details = e?.details ?? e?.message;
    const code = e?.code;
    if (!code) return details ? { details } : {};
    const { message } = resolveAuthError(code, details ?? code);
    return { code, message, ...(details && { details }) };
  }

  /**
   * Fetch a transaction's on-chain status by hash via `GET /tx/status`.
   * `PENDING` means it is not yet ledger-confirmed (or outside the RPC retention
   * window). Useful for headless callers polling a `pending` {@link SubmitOutcome}
   * themselves; the built-in submit flow already polls internally (see
   * {@link _awaitTxConfirmation}).
   */
  async getTxStatus(hash: string): Promise<{
    hash: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    resultCode?: string;
    message?: string;
    ledger?: number;
  }> {
    const { data, error } = await this._api.GET('/tx/status', {
      params: { query: { hash } },
    });
    if (!error && data?.success && data.content) return data.content;
    const { details } = this._resolveTxApiError(error, data);
    throw new Error(details ?? 'Failed to fetch transaction status');
  }

  /**
   * A submit endpoint acked the tx (`PENDING`) without waiting for ledger
   * confirmation, because the SDK sends `waitForConfirmation: false`, so the
   * one HTTP call returns in ~1-3s instead of blocking up to ~30s (which used to
   * exceed the request timeout, trip a transport retry, and get rejected as a
   * DPoP `jti-replay`). We finish the job here by polling `GET /tx/status` with
   * short, DPoP-authed GETs, driving the state machine `submitted` to `success` /
   * `error` and returning the final outcome. If the window elapses still-pending,
   * we leave `submitted` and return `pending` (the tx may yet confirm; the caller
   * can re-check via {@link getTxStatus}).
   *
   * `errorPhase` matches the calling flow so a FAILED tx stamps the right phase.
   */
  private async _awaitTxConfirmation(
    hash: string,
    errorPhase: 'submitting' | 'signing-submitting' | 'building-signing-submitting',
    buildData: TxBuildContent | undefined,
    outcomeExtra: { buildData?: TxBuildContent },
  ): Promise<SubmitOutcome> {
    const gen = this._txStartGen;
    // ~40s window (ledgers close every ~5s). Polls are cheap; poll a bit faster
    // than ledger cadence so we observe confirmation promptly without hammering.
    const POLL_INTERVAL_MS = 2_500;
    const MAX_POLLS = 16;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      // A logout / new login landed mid-poll; this tx belongs to the old
      // session. Stop touching state and report the last known status.
      if (this._sessionGeneration !== gen) return { status: 'pending', hash, ...outcomeExtra };
      let status: Awaited<ReturnType<PollarClient['getTxStatus']>>;
      try {
        status = await this.getTxStatus(hash);
      } catch {
        continue; // transient RPC / network blip; keep polling
      }
      if (status.status === 'SUCCESS') {
        this._setTransactionState({ step: 'success', hash, ...(buildData && { buildData }) });
        return { status: 'success', hash, ...outcomeExtra };
      }
      if (status.status === 'FAILED') {
        this._setTransactionState({
          step: 'error',
          phase: errorPhase,
          ...(buildData && { buildData }),
          ...(status.resultCode && { details: status.resultCode }),
          ...(status.message && { message: status.message }),
        });
        return {
          status: 'error',
          hash,
          ...outcomeExtra,
          ...(status.resultCode && { details: status.resultCode, resultCode: status.resultCode }),
          ...(status.message && { message: status.message }),
        };
      }
      // PENDING: keep polling
    }
    // Still pending after the window; leave `submitted`, the tx may yet confirm.
    return { status: 'pending', hash, ...outcomeExtra };
  }

  async submitTx(signedXdr: string, opts?: { submissionToken?: string }): Promise<SubmitOutcome> {
    this._txStartGen = this._sessionGeneration;
    const buildData = this._currentBuildData();
    const outcomeExtra: { buildData?: TxBuildContent } = buildData ? { buildData } : {};
    this._setTransactionState({ step: 'submitting', signedXdr, ...(buildData && { buildData }) });

    const address = this._session?.wallet?.address ?? '';
    try {
      const { data, error } = await this._api.POST('/tx/submit', {
        body: {
          address,
          signedXdr,
          ...(opts?.submissionToken && { idempotencyKey: opts.submissionToken }),
          // Return on network ack (fast) instead of blocking ~30s for ledger
          // confirmation; we poll GET /tx/status below. Keeps the one request
          // well under the timeout, so it can't trip a transport-retry replay.
          waitForConfirmation: false,
        },
        // Custodial submit does server-side work (wallet-service sign + network
        // submit) that can exceed the 10s default; give it the longer budget.
        headers: { 'x-pollar-timeout-ms': String(this._submitTimeoutMs) },
      });
      if (!error && data?.success && data.content) {
        const { hash, status: backendStatus, resultCode } = data.content;
        if (backendStatus === 'SUCCESS') {
          this._setTransactionState({ step: 'success', hash, ...(buildData && { buildData }) });
          return { status: 'success', hash, ...outcomeExtra };
        }
        if (backendStatus === 'PENDING') {
          this._setTransactionState({ step: 'submitted', hash, ...(buildData && { buildData }) });
          return this._awaitTxConfirmation(hash, 'submitting', buildData, outcomeExtra);
        }
        this._setTransactionState({
          step: 'error',
          phase: 'submitting',
          ...(buildData && { buildData }),
          ...(resultCode && { details: resultCode }),
        });
        return {
          status: 'error',
          hash,
          ...outcomeExtra,
          ...(resultCode && { details: resultCode, resultCode }),
        };
      }
      const { details, code, message } = this._resolveTxApiError(error, data);
      this._setTransactionState({
        step: 'error',
        phase: 'submitting',
        ...(buildData && { buildData }),
        ...(details && { details }),
        ...(code && { code }),
        ...(message && { message }),
      });
      return {
        status: 'error',
        ...outcomeExtra,
        ...(details && { details }),
        ...(code && { code }),
        ...(message && { message }),
      };
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      this._setTransactionState({
        step: 'error',
        phase: 'submitting',
        ...(buildData && { buildData }),
        ...(details && { details }),
      });
      return { status: 'error', ...outcomeExtra, ...(details && { details }) };
    }
  }

  /**
   * Signs and submits in one logical step. Returns a {@link SubmitOutcome}.
   *
   * - **External wallets**: composes `signTx` + `submitTx` client-side. State
   *   machine sees the full granular sequence `signing → signed → submitting
   *   → success` because the underlying methods each emit.
   * - **Custodial wallets**: atomic `/tx/sign-and-send` round-trip. State
   *   machine emits the compound `signing-submitting` step (the SDK can't
   *   observe when one phase ends and the next begins inside that single
   *   backend call) and then transitions to `submitted` (Horizon ack only) or
   *   `success` (ledger-confirmed), or `error[phase: 'signing-submitting']`.
   */
  async signAndSubmitTx(unsignedXdr?: string): Promise<SubmitOutcome> {
    this._txStartGen = this._sessionGeneration;
    const noSigner = this._externalSignerMissing();
    if (noSigner) return noSigner;
    // Smart wallet: there is no unsigned XDR — sign the prepared auth digest
    // with the passkey and submit, using the build already on the state machine.
    if (this._session?.wallet?.type === 'smart') {
      const buildData = this._currentBuildData();
      if (!buildData?.smart) {
        const details = 'no prepared smart transaction; call buildTx first';
        this._setTransactionState({ step: 'error', phase: 'signing', details });
        return { status: 'error', details };
      }
      return this._signSubmitSmart(buildData);
    }

    if (!unsignedXdr) {
      this._setTransactionState({ step: 'error', phase: 'signing', details: 'missing unsigned transaction' });
      return { status: 'error', details: 'missing unsigned transaction' };
    }

    if (this._walletAdapter) {
      // External — the composed signTx+submitTx already emit the granular
      // state-machine sequence. We just pass outcomes through.
      const signed = await this.signTx(unsignedXdr);
      if (signed.status === 'error') {
        const buildData = this._currentBuildData();
        return {
          status: 'error',
          ...(buildData && { buildData }),
          ...(signed.details && { details: signed.details }),
        };
      }
      return this.submitTx(signed.signedXdr);
    }

    // Custodial — atomic single backend call. Compound state.
    const buildData = this._currentBuildData();
    const outcomeExtra: { buildData?: TxBuildContent } = buildData ? { buildData } : {};

    this._setTransactionState({ step: 'signing-submitting', ...(buildData && { buildData }) });

    const body: TxSignAndSendBody = {
      address: this._session?.wallet?.address ?? '',
      unsignedXdr,
      // Async ack + client-side status poll (see submitTx / _awaitTxConfirmation).
      waitForConfirmation: false,
    };
    try {
      const { data, error } = await this._api.POST('/tx/sign-and-send', {
        body,
        headers: { 'x-pollar-timeout-ms': String(this._submitTimeoutMs) },
      });
      if (!error && data?.success && data.content?.hash) {
        const {
          hash,
          status: backendStatus,
          resultCode,
        } = data.content as {
          hash: string;
          status: 'SUCCESS' | 'FAILED' | 'PENDING';
          resultCode?: string;
        };
        if (backendStatus === 'SUCCESS') {
          this._setTransactionState({ step: 'success', hash, ...(buildData && { buildData }) });
          return { status: 'success', hash, ...outcomeExtra };
        }
        if (backendStatus === 'PENDING') {
          this._setTransactionState({ step: 'submitted', hash, ...(buildData && { buildData }) });
          return this._awaitTxConfirmation(hash, 'signing-submitting', buildData, outcomeExtra);
        }
        // backendStatus === 'FAILED'
        this._setTransactionState({
          step: 'error',
          phase: 'signing-submitting',
          ...(buildData && { buildData }),
          ...(resultCode && { details: resultCode }),
        });
        return {
          status: 'error',
          hash,
          ...outcomeExtra,
          ...(resultCode && { details: resultCode, resultCode }),
        };
      }
      const { details, code, message } = this._resolveTxApiError(error, data);
      this._setTransactionState({
        step: 'error',
        phase: 'signing-submitting',
        ...(buildData && { buildData }),
        ...(details && { details }),
        ...(code && { code }),
        ...(message && { message }),
      });
      return {
        status: 'error',
        ...outcomeExtra,
        ...(details && { details }),
        ...(code && { code }),
        ...(message && { message }),
      };
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      this._setTransactionState({
        step: 'error',
        phase: 'signing-submitting',
        ...(buildData && { buildData }),
        ...(details && { details }),
      });
      return { status: 'error', ...outcomeExtra, ...(details && { details }) };
    }
  }

  /**
   * One-shot: build → sign → submit, returning the final {@link SubmitOutcome}.
   *
   * - **External wallets**: composes `buildTx` + `signAndSubmitTx` client-side.
   *   State machine sees the full granular sequence (`building → built →
   *   signing → signed → submitting → success`) because each composed call
   *   emits its own transitions.
   * - **Custodial wallets**: single round-trip to `/tx/build-sign-submit`. The
   *   signed XDR never leaves the backend. State machine emits the compound
   *   `building-signing-submitting` step (the SDK can't observe individual
   *   phase boundaries inside one atomic call) and then transitions to
   *   `submitted` / `success` / `error[phase: 'building-signing-submitting']`.
   *
   * If you need granular UI feedback for custodial flows (separate
   * "Building…", "Signing…", "Submitting…" indicators), call `buildTx`,
   * `signTx`, and `submitTx` separately instead.
   */
  async buildAndSignAndSubmitTx(
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ): Promise<SubmitOutcome> {
    this._txStartGen = this._sessionGeneration;
    const noSigner = this._externalSignerMissing();
    if (noSigner) return noSigner;
    // Smart wallet (passkey / C-address): build (prepare) → sign the auth digest
    // with the passkey → submit. The signed entry is assembled server-side.
    if (this._session?.wallet?.type === 'smart') {
      return this._runSmartTx(operation, params, options);
    }

    if (this._walletAdapter) {
      const built = await this.buildTx(operation, params, options);
      if (built.status === 'error') {
        return { status: 'error', ...(built.details && { details: built.details }) };
      }
      if (!built.buildData.unsignedXdr) {
        return { status: 'error', details: 'build returned no unsigned transaction' };
      }
      return this.signAndSubmitTx(built.buildData.unsignedXdr);
    }

    // Custodial path — single backend call, compound state-machine step.
    if (!this._session?.wallet?.address) {
      this._setTransactionState({ step: 'error', phase: 'building-signing-submitting', details: 'No wallet connected' });
      return { status: 'error', details: 'No wallet connected' };
    }
    this._setTransactionState({ step: 'building-signing-submitting' });
    try {
      const { data, error } = await this._api.POST('/tx/build-sign-submit', {
        body: {
          address: this._session.wallet.address,
          operation,
          params,
          options: options ?? {},
          // Async ack + client-side status poll (see submitTx / _awaitTxConfirmation).
          waitForConfirmation: false,
        } as TxBuildBody & { idempotencyKey?: string; waitForConfirmation?: boolean },
        // Atomic build + sign + submit is the slowest tx call; give it the
        // longer submit budget so a real success isn't cut at the 10s default.
        headers: { 'x-pollar-timeout-ms': String(this._submitTimeoutMs) },
      });
      if (!error && data?.success && data.content) {
        // This endpoint is multichain now, so its 200 is a union and only the
        // Stellar member carries `resultCode`. This call always sends a Stellar
        // body, but the type still has to be narrowed to say so.
        const { hash, status: backendStatus } = data.content;
        const resultCode = 'resultCode' in data.content ? data.content.resultCode : undefined;
        if (backendStatus === 'SUCCESS') {
          this._setTransactionState({ step: 'success', hash });
          return { status: 'success', hash };
        }
        if (backendStatus === 'PENDING') {
          this._setTransactionState({ step: 'submitted', hash });
          return this._awaitTxConfirmation(hash, 'building-signing-submitting', undefined, {});
        }
        this._setTransactionState({
          step: 'error',
          phase: 'building-signing-submitting',
          ...(resultCode && { details: resultCode }),
        });
        return { status: 'error', hash, ...(resultCode && { details: resultCode, resultCode }) };
      }
      const { details, code, message } = this._resolveTxApiError(error, data);
      this._setTransactionState({
        step: 'error',
        phase: 'building-signing-submitting',
        ...(details && { details }),
        ...(code && { code }),
        ...(message && { message }),
      });
      return { status: 'error', ...(details && { details }), ...(code && { code }), ...(message && { message }) };
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      this._setTransactionState({
        step: 'error',
        phase: 'building-signing-submitting',
        ...(details && { details }),
      });
      return { status: 'error', ...(details && { details }) };
    }
  }

  /**
   * Send a payment on any chain the user holds a wallet on.
   *
   * One entry point, two mechanisms, because the chains genuinely differ:
   * Stellar routes through {@link buildAndSignAndSubmitTx} (which still handles
   * external adapters and passkey wallets via the split flow), while a chain
   * whose signature expires does the whole thing in one server-side call.
   *
   * Custodial-only outside Stellar: a non-Stellar external wallet would have to
   * sign client-side, and that path is not wired yet.
   */
  async sendPayment(params: SendPaymentParams): Promise<SubmitOutcome> {
    if (params.chain === undefined || params.chain === 'STELLAR') {
      return this.buildAndSignAndSubmitTx(
        'payment',
        { destination: params.destination, amount: params.amount, asset: params.asset },
        params.options,
      );
    }

    if (params.chain !== 'SOLANA') {
      return { status: 'error', details: `Sending on ${params.chain} is not supported yet.` };
    }

    this._txStartGen = this._sessionGeneration;
    if (!this._session?.wallet?.address) {
      this._setTransactionState({ step: 'error', phase: 'building-signing-submitting', details: 'No wallet connected' });
      return { status: 'error', details: 'No wallet connected' };
    }

    this._setTransactionState({ step: 'building-signing-submitting' });
    try {
      const { data, error } = await this._api.POST('/tx/build-sign-submit', {
        body: {
          chain: 'SOLANA',
          operation: 'payment',
          params: {
            destination: params.destination,
            amount: params.amount,
            ...(params.mint ? { mint: params.mint } : {}),
          },
          // Required on Solana: its submit is a single non-idempotent shot, so
          // the backend dedupes on this key. Minted per call so a transport
          // retry converges on the original transfer instead of sending twice.
          idempotencyKey: randomUUID(),
          waitForConfirmation: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the generated body type is a union; this branch is the Solana member
        } as any,
        headers: { 'x-pollar-timeout-ms': String(this._submitTimeoutMs) },
      });

      if (!error && data?.success && data.content) {
        const { hash, status: backendStatus } = data.content as { hash: string; status: string };
        if (backendStatus === 'SUCCESS') {
          this._setTransactionState({ step: 'success', hash });
          return { status: 'success', hash };
        }
        if (backendStatus === 'PENDING') {
          this._setTransactionState({ step: 'submitted', hash });
          return this._awaitTxConfirmation(hash, 'building-signing-submitting', undefined, {});
        }
        this._setTransactionState({ step: 'error', phase: 'building-signing-submitting' });
        return { status: 'error', hash };
      }

      const { details, code, message } = this._resolveTxApiError(error, data);
      this._setTransactionState({
        step: 'error',
        phase: 'building-signing-submitting',
        ...(details && { details }),
        ...(code && { code }),
        ...(message && { message }),
      });
      return { status: 'error', ...(details && { details }), ...(code && { code }), ...(message && { message }) };
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      this._setTransactionState({ step: 'error', phase: 'building-signing-submitting', ...(details && { details }) });
      return { status: 'error', ...(details && { details }) };
    }
  }

  /** Alias for {@link buildAndSignAndSubmitTx} — shorter "just do the thing" name. */
  async runTx(
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ): Promise<SubmitOutcome> {
    return this.buildAndSignAndSubmitTx(operation, params, options);
  }

  /**
   * Smart-wallet (passkey / C-address) transaction: build (server prepares the
   * SAC transfer + returns the auth digest) → sign the digest with the passkey
   * → submit (server assembles the signed auth entry and broadcasts; the
   * sponsor pays the fee). State machine: building → built → signing →
   * submitting → success.
   */
  private async _runSmartTx(
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ): Promise<SubmitOutcome> {
    this._txStartGen = this._sessionGeneration;
    const address = this._session?.wallet?.address;
    if (!address) {
      this._setTransactionState({ step: 'error', phase: 'building', details: 'No wallet connected' });
      return { status: 'error', details: 'No wallet connected' };
    }
    if (!this._passkeySign) {
      const details = 'Passkey signer not configured';
      this._setTransactionState({ step: 'error', phase: 'signing', details });
      return { status: 'error', details };
    }

    // 1. Build (prepare) — returns the auth digest to sign, not an unsigned XDR.
    this._setTransactionState({ step: 'building' });
    let buildData: TxBuildContent;
    try {
      const body = {
        address,
        operation,
        params,
        options: options ?? {},
      } as TxBuildBody;
      const { data, error } = await this._api.POST('/tx/build', { body });
      if (error || !data?.success || !data.content?.smart) {
        const details = (error as { details?: string } | undefined)?.details ?? 'Failed to build transaction';
        this._setTransactionState({ step: 'error', phase: 'building', details });
        return { status: 'error', details };
      }
      buildData = data.content;
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      this._setTransactionState({ step: 'error', phase: 'building', ...(details && { details }) });
      return { status: 'error', ...(details && { details }) };
    }
    this._setTransactionState({ step: 'built', buildData });

    return this._signSubmitSmart(buildData);
  }

  /**
   * Steps 2–3 of the smart-wallet flow: sign the prepared auth digest with the
   * passkey, then submit. Shared by `_runSmartTx` (atomic) and `signAndSubmitTx`
   * (split flow, when a smart build is already on the state machine).
   */
  private async _signSubmitSmart(buildData: TxBuildContent): Promise<SubmitOutcome> {
    this._txStartGen = this._sessionGeneration;
    const address = this._session?.wallet?.address;
    const smart = buildData.smart;
    if (!address || !smart) {
      const details = 'no prepared smart transaction';
      this._setTransactionState({ step: 'error', phase: 'signing', buildData, details });
      return { status: 'error', buildData, details };
    }
    if (!this._passkeySign) {
      const details = 'Passkey signer not configured';
      this._setTransactionState({ step: 'error', phase: 'signing', buildData, details });
      return { status: 'error', buildData, details };
    }

    // 2. Sign the auth digest with the passkey (biometric prompt).
    this._setTransactionState({ step: 'signing', buildData });
    let assertion: Awaited<ReturnType<PasskeySigner>>;
    try {
      assertion = await this._passkeySign({ credentialId: smart.credentialId, challenge: smart.digest });
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      this._setTransactionState({ step: 'error', phase: 'signing', buildData, ...(details && { details }) });
      return { status: 'error', buildData, ...(details && { details }) };
    }

    // 3. Submit — server assembles the signed auth entry and broadcasts.
    this._setTransactionState({ step: 'submitting', buildData });
    const outcomeExtra: { buildData: TxBuildContent } = { buildData };
    try {
      const { data, error } = await this._api.POST('/tx/submit', {
        body: {
          address,
          smart: { entryXdr: smart.entryXdr, funcXdr: smart.funcXdr, assertion },
        },
        headers: { 'x-pollar-timeout-ms': String(this._submitTimeoutMs) },
      });
      if (!error && data?.success && data.content) {
        const { hash, status: backendStatus, resultCode } = data.content;
        if (backendStatus === 'SUCCESS') {
          this._setTransactionState({ step: 'success', hash, buildData });
          return { status: 'success', hash, ...outcomeExtra };
        }
        if (backendStatus === 'PENDING') {
          this._setTransactionState({ step: 'submitted', hash, buildData });
          return this._awaitTxConfirmation(hash, 'submitting', buildData, outcomeExtra);
        }
        this._setTransactionState({
          step: 'error',
          phase: 'submitting',
          buildData,
          ...(resultCode && { details: resultCode }),
        });
        return { status: 'error', hash, ...outcomeExtra, ...(resultCode && { details: resultCode, resultCode }) };
      }
      const { details, code, message } = this._resolveTxApiError(error, data);
      this._setTransactionState({
        step: 'error',
        phase: 'submitting',
        buildData,
        ...(details && { details }),
        ...(code && { code }),
        ...(message && { message }),
      });
      return {
        status: 'error',
        ...outcomeExtra,
        ...(details && { details }),
        ...(code && { code }),
        ...(message && { message }),
      };
    } catch (err) {
      const details = err instanceof Error ? err.message : undefined;
      this._setTransactionState({ step: 'error', phase: 'submitting', buildData, ...(details && { details }) });
      return { status: 'error', ...outcomeExtra, ...(details && { details }) };
    }
  }

  // ─── App config ───────────────────────────────────────────────────────────

  async getAppConfig(): Promise<unknown> {
    try {
      const { data, error } = await this._api.GET('/applications/config');
      if (!data || error) return null;
      return data.content;
    } catch {
      return null;
    }
  }

  // ─── KYC ──────────────────────────────────────────────────────────────────

  getKycStatus(providerId?: string) {
    return getKycStatus(this._api, providerId);
  }

  getKycProviders(country: string) {
    return getKycProviders(this._api, country);
  }

  startKyc(body: KycStartBody): Promise<KycStartResponse> {
    return startKyc(this._api, body);
  }

  resolveKyc(providerId: string, level?: KycLevel) {
    return resolveKyc(this._api, providerId, level);
  }

  pollKycStatus(providerId: string, opts?: { intervalMs?: number; timeoutMs?: number }): Promise<KycStatus> {
    return pollKycStatus(this._api, providerId, opts);
  }

  // ─── Ramps ────────────────────────────────────────────────────────────────

  getRampsQuote(query: RampsQuoteQuery): Promise<RampsQuoteResponse> {
    return getRampsQuote(this._api, query);
  }

  /** Countries (+ fiat currency) the app's enabled ramp anchors support on its network. */
  getRampCountries(): Promise<RampsCountriesResponse> {
    return getRampCountries(this._api);
  }

  createOnRamp(body: RampsOnrampBody): Promise<RampsOnrampResponse> {
    return createOnRamp(this._api, body);
  }

  createOffRamp(body: RampsOfframpBody): Promise<RampsOfframpResponse> {
    return createOffRamp(this._api, body);
  }

  /** Complete an offramp once anchor KYC is done (build + sign + submit the withdraw payment). */
  completeWithdraw(txId: string): Promise<RampsCompleteResponse> {
    return completeWithdraw(this._api, txId);
  }

  /** Resume an EXTERNAL-wallet ramp after the client signs a pending XDR (sep10 / withdraw_payment). */
  submitRampSignature(txId: string, body: RampsSignatureBody): Promise<RampsSignatureResponse> {
    return submitRampSignature(this._api, txId, body);
  }

  getRampTransaction(txId: string): Promise<RampsTransactionResponse> {
    return getRampTransaction(this._api, txId);
  }

  pollRampTransaction(txId: string, opts?: { intervalMs?: number; timeoutMs?: number }): Promise<RampTxStatus> {
    return pollRampTransaction(this._api, txId, opts);
  }

  // ─── Distribution ─────────────────────────────────────────────────────────

  listDistributionRules(): Promise<DistributionRule[]> {
    return listDistributionRules(this._api);
  }

  claimDistributionRule(body: DistributionClaimBody): Promise<DistributionClaimContent> {
    return claimDistributionRule(this._api, body);
  }

  // ─── Swap (DEX/AMM) ───────────────────────────────────────────────────────

  /**
   * Quote an asset-to-asset swap across the requested venue(s). Read-only: no
   * funds move. Returns quotes ranked by output (best first) — pick `[0]` for the
   * best price, or let the user choose a route. An empty array means no route
   * exists for the pair on this network. `provider` defaults to `'auto'` (the best
   * of every available venue); `slippageBps` defaults to 50 (0.5%) and sets the
   * on-chain minimum each quote's `build` will accept.
   */
  /**
   * The swap venues this app exposes to end-users (operator's dashboard
   * selection, intersected with server capability). An empty array means swap is
   * disabled for this app — hide any swap UI. `'auto'` is not returned here; add
   * it client-side when the list is non-empty.
   */
  async getSwapConfig(): Promise<SwapVenue[]> {
    const content = await getSwapConfig(this._api);
    return content.venues;
  }

  /**
   * The curated "buy" tokens this app opted into (admin catalog), for the key's
   * network. The SDK merges these into the swap buy list on top of the wallet's
   * balances and the app's enabled assets.
   */
  async getSwapTokens(): Promise<SwapToken[]> {
    const content = await getSwapTokens(this._api);
    return content.tokens;
  }

  async getSwapQuote(params: SwapQuoteParams): Promise<SwapQuote[]> {
    const wallet = this.getWallet();
    if (!wallet) throw new Error('No wallet connected');
    const body: SwapQuoteBody = {
      address: wallet.address,
      sellAsset: params.sellAsset,
      buyAsset: params.buyAsset,
      amount: params.amount,
      ...(params.provider !== undefined && { provider: params.provider }),
      ...(params.slippageBps !== undefined && { slippageBps: params.slippageBps }),
    };
    const content = await quoteSwap(this._api, body);
    return content.quotes;
  }

  /**
   * Execute a swap from a quote returned by {@link getSwapQuote}. When the asset
   * being received is a credit asset on a classic (G-address) wallet, its
   * trustline is established first (unless `opts.autoTrustline` is false); native
   * XLM and smart (C-address) wallets need none. The quote's `build` payload then
   * runs through the normal tx pipeline, so it re-simulates server-side and the
   * on-chain `minReceived` enforces slippage. Drives the same transaction state
   * machine as {@link runTx} — subscribe via {@link onTransactionStateChange}.
   */
  async swap(quote: SwapQuote, opts?: { autoTrustline?: boolean }): Promise<SubmitOutcome> {
    const wallet = this.getWallet();
    if (!wallet) return { status: 'error', details: 'No wallet connected' };

    // TODO(phase-4 / C-address swaps): smart (passkey C-address) wallets can't
    // swap yet. The backend smart-account build path (buildSmartAccountTransfer →
    // wallet-service prepareTransfer) only supports `payment`, and the AMM router
    // plus its SAC sub-invocations must be allowlisted in SorobanAuthPolicy.
    // Fail fast with a clear message until that lands, instead of a confusing
    // "smart-account build supports only payment" error from runTx.
    if (wallet.custody === 'smart') {
      return { status: 'error', details: 'Swaps are not yet supported for smart (passkey) wallets' };
    }

    // Smart (C-address) wallets already returned above; here custody is G-address
    // or external, so a credit buy-asset may need a classic trustline first.
    const buy = quote.buyAsset;
    const needsTrustline = (opts?.autoTrustline ?? true) && buy.type !== 'native';
    if (needsTrustline && (buy.type === 'credit_alphanum4' || buy.type === 'credit_alphanum12')) {
      let assetsState = this.getEnabledAssetsState();
      if (assetsState.step !== 'loaded') {
        await this.refreshAssets();
        assetsState = this.getEnabledAssetsState();
      }
      const record =
        assetsState.step === 'loaded'
          ? assetsState.data.assets.find((a) => a.code === buy.code && a.issuer === buy.issuer)
          : undefined;
      if (!record?.trustlineEstablished) {
        // Sponsorship is derived automatically from the app config now — no flag.
        const tl = await this.setTrustline({ code: buy.code, issuer: buy.issuer });
        if (tl.status === 'error') {
          return { status: 'error', details: `Trustline for ${buy.code} failed: ${tl.details ?? 'unknown error'}` };
        }
        await this.refreshAssets();
      }
    }

    // Soroswap returns a prebuilt XDR (submit as-is); Aquarius/SDEX return an
    // operation + params that runTx re-builds server-side (fresh sequence).
    const build = quote.build;
    if ('unsignedXdr' in build) return this.signAndSubmitTx(build.unsignedXdr);
    return this.runTx(build.operation, build.params);
  }

  // ─── Earn (yield vaults / lending) ──────────────────────────────────────────

  /**
   * The yield providers this app exposes to end-users (enabled + server-capable).
   * An empty array means Earn is disabled for this app — hide any Earn UI.
   */
  async getEarnProviders(): Promise<EarnProviderId[]> {
    const content = await getEarnProviders(this._api);
    return content.providers;
  }

  /**
   * The vaults (DeFindex) or pools (Blend) a provider exposes on this app's
   * network, each with its live APY. Read-only.
   */
  async getEarnOpportunities(provider: EarnProviderId): Promise<EarnOpportunity[]> {
    const content = await getEarnOpportunities(this._api, provider);
    return content.opportunities;
  }

  /**
   * The connected wallet's position (balance + APY) in a specific vault/pool.
   * Read-only — poll it to show the position updating live. `withdrawUnit` tells
   * you whether {@link earnWithdraw} expects an asset amount (Blend) or a share
   * count (DeFindex); `withdrawable` is the max in that unit.
   */
  async getEarnPosition(params: EarnPositionParams): Promise<EarnPosition> {
    const wallet = this.getWallet();
    if (!wallet) throw new Error('No wallet connected');
    return getEarnPosition(this._api, {
      provider: params.provider,
      opportunity: params.opportunity,
      address: wallet.address,
    });
  }

  /**
   * Deposit into a vault/pool. The provider builds the unsigned XDR server-side
   * (contract-direct for Blend, via the DeFindex API for DeFindex) and this signs
   * + submits it, driving the same transaction state machine as {@link runTx}.
   *
   * The `amount` is the underlying asset amount. The deposit asset's trustline
   * must already exist on classic (G-address) wallets — auto-trustline is a
   * follow-up (the opportunity does not yet expose the asset's classic issuer).
   */
  async earnDeposit(params: EarnTxParams): Promise<SubmitOutcome> {
    return this._earnBuildAndSubmit('deposit', params);
  }

  /**
   * Withdraw from a vault/pool. The `amount` is in the position's `withdrawUnit`
   * (asset amount for Blend, share count for DeFindex) — read it from
   * {@link getEarnPosition}. Signs + submits the provider-built XDR.
   */
  async earnWithdraw(params: EarnTxParams): Promise<SubmitOutcome> {
    return this._earnBuildAndSubmit('withdraw', params);
  }

  private async _earnBuildAndSubmit(action: 'deposit' | 'withdraw', params: EarnTxParams): Promise<SubmitOutcome> {
    const wallet = this.getWallet();
    if (!wallet) return { status: 'error', details: 'No wallet connected' };

    // Both providers return a prebuilt XDR, which smart (passkey C-address)
    // wallets can't sign — their build path must run server-side and return a
    // passkey digest. Fail fast until that lands (same limitation as swap).
    if (wallet.custody === 'smart') {
      return { status: 'error', details: 'Earn is not yet supported for smart (passkey) wallets' };
    }

    const { build } = await buildEarnTx(this._api, {
      action,
      provider: params.provider,
      opportunity: params.opportunity,
      amount: params.amount,
      address: wallet.address,
    });
    // Both current providers return a prebuilt XDR (submit as-is); the
    // invoke_contract shape is reserved for a future provider and runs through
    // runTx (re-simulated server-side), mirroring swap.
    if ('unsignedXdr' in build) return this.signAndSubmitTx(build.unsignedXdr);
    return this.runTx(build.operation, build.params);
  }

  private _setTxHistoryState(next: TxHistoryState): void {
    this._txHistoryState = next;
    for (const cb of this._txHistoryStateListeners) cb(next);
  }

  private _setSessionsState(next: SessionsState): void {
    this._sessionsState = next;
    for (const cb of this._sessionsStateListeners) cb(next);
  }

  private _setWalletBalanceState(next: WalletBalanceState): void {
    this._walletBalanceState = next;
    for (const cb of this._walletBalanceStateListeners) cb(next);
  }

  private _setEnabledAssetsState(next: EnabledAssetsState): void {
    this._enabledAssetsState = next;
    for (const cb of this._enabledAssetsStateListeners) cb(next);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _newController(): AbortController {
    this._loginController?.abort();
    this._loginController = new AbortController();
    return this._loginController;
  }

  /**
   * Signal for a continuation of the current login (e.g. `sendEmailCode`,
   * `providerAction`). Reuses the active login controller, but mints a fresh one
   * if there's none OR the existing one is already aborted — a prior terminal
   * flow can leave `_loginController` set-but-aborted, and reusing that dead
   * signal would make the continuation's first request reject immediately and
   * drop the user to `idle`.
   */
  private _activeLoginSignal(): AbortSignal {
    if (this._loginController && !this._loginController.signal.aborted) return this._loginController.signal;
    return this._newController().signal;
  }

  /**
   * Build the {@link AuthProviderContext} facade for one login attempt. Wraps
   * the internal `FlowDeps` so providers get only the curated primitives —
   * `createSession`, `authenticate`, `requestChallenge`, `startHostedOAuth` —
   * while storage / wallet-adapter / key-manager internals stay private. All
   * legs share the same `signal`, so `cancelLogin()` aborts the whole chain.
   */
  private _providerContext(signal: AbortSignal): AuthProviderContext {
    const deps = this._flowDeps(signal);
    return {
      signal,
      api: this._api,
      basePath: this.basePath,
      apiKey: this.apiKey,
      logger: this._log,
      // Use the signal-guarded wrapper from `deps` (see `_flowDeps`) so a
      // cancelled/superseded provider flow can't clobber the active state.
      setAuthState: deps.setAuthState,
      createSession: () => createAuthSession(deps),
      authenticate: (clientSessionId: string) => authenticate(clientSessionId, deps),
      requestChallenge: (clientSessionId: string, walletAddress: string) =>
        requestWalletChallenge(clientSessionId, walletAddress, deps),
      startHostedOAuth: (provider) =>
        loginOAuth(provider, {
          ...deps,
          basePath: this.basePath,
          apiKey: this.apiKey,
          openAuthUrl: this._openAuthUrl,
          redirectUri: this._oauthRedirectUri,
        }),
    };
  }

  private _flowDeps(signal: AbortSignal) {
    return {
      api: this._api,
      logger: this._log,
      basePath: this.basePath,
      networkPassphrase: this._networkPassphrase(),
      // SSE status streaming works on web; React Native's `fetch` has no
      // readable `response.body`, so those clients poll the non-streaming
      // status endpoint instead. `isBrowser` is false in RN and SSR alike.
      useStreaming: isBrowser,
      signal,
      // Suppress terminal writes from a flow that was CANCELLED or SUPERSEDED
      // (its `signal` is aborted) so a late-resolving loser can't clobber the
      // active flow's state or, via clearSession, tear down a newer session /
      // reset the DPoP key. The active flow's signal is never aborted, so the
      // happy path is unchanged. (Completes the C1 guard — covers error/clear
      // writes, not just storeSession.)
      setAuthState: (state: AuthState) => {
        if (!signal.aborted) this._setAuthState(state);
      },
      storeSession: (session: PollarApplicationConfigContent) =>
        signal.aborted ? Promise.resolve() : this._storeSession(session),
      clearSession: () => (signal.aborted ? Promise.resolve() : this._clearSession()),
      getPublicJwk: () => this._keyManager.getPublicJwk(),
      storeWalletAdapter: async (adapter: WalletAdapter, id: WalletId) => {
        // A cancelled/superseded flow must not leave a dangling adapter +
        // persisted walletType row with no session (the same reason the other
        // flow deps no-op on an aborted signal). The active flow is never
        // aborted, so the happy path is unchanged.
        if (signal.aborted) return;
        this._walletAdapter = adapter;
        try {
          await writeWalletType(this._storage, this.apiKeyHash, id);
        } catch (err) {
          // The adapter is set in memory and works for this session; persistence
          // is best-effort (the wallet just won't auto-restore on next cold
          // start). Never let a storage failure break the login.
          this._log.warn('[PollarClient] Could not persist wallet type', err);
        }
      },
      ...(this._passkey ? { passkey: this._passkey } : {}),
      ...(this._deviceLabel ? { deviceLabel: this._deviceLabel } : {}),
    };
  }

  private _handleFlowError(error: unknown, signal?: AbortSignal): void {
    // A cancelled/superseded flow's signal is aborted — drop its terminal write
    // so it can't clobber the active flow (e.g. flash `idle`/`error` over a new
    // login). cancelLogin already set the right state.
    if (signal?.aborted) return;
    if (error instanceof Error && error.name === 'AbortError') {
      this._log.debug('[PollarClient] Login cancelled');
      this._setAuthState({ step: 'idle' });
      return;
    }
    if (error instanceof Error && (error as { code?: string }).code === AUTH_ERROR_CODES.WALLET_RESOLVER_TIMEOUT) {
      this._log.error('[PollarClient] Wallet resolver timeout', error.message);
      this._setAuthState({
        step: 'error',
        previousStep: this._authState.step,
        message: error.message,
        errorCode: AUTH_ERROR_CODES.WALLET_RESOLVER_TIMEOUT,
      });
      return;
    }
    this._log.error('[PollarClient] Unexpected error in auth flow', error);
    this._setAuthState({
      step: 'error',
      previousStep: this._authState.step,
      message: 'An unexpected error occurred',
      errorCode: AUTH_ERROR_CODES.UNEXPECTED_ERROR,
    });
  }

  private async _restoreSession(): Promise<void> {
    // Capture the pre-restore state so we can tell a genuine restore (cold
    // start, or another user's session) apart from a cross-tab token ROTATION
    // of the session we already have verified.
    const prevState = this._authState;
    const prevSession = this._session;
    this._session = await readStorage(this._storage, this.apiKeyHash, this._log);
    if (this._session) {
      // A DIFFERENT session was restored (e.g. a cross-tab login as another user
      // overwrote storage): invalidate any refresh/resume still in flight against
      // the OLD session, so its rotated token can't be written over the
      // newly-restored one. (A same-session cross-tab rotation keeps the same
      // clientSessionId and is handled by the verified fast path below — no bump,
      // so it doesn't disturb an in-flight refresh of the very same session.)
      if (prevSession && prevSession.clientSessionId !== this._session.clientSessionId) {
        this._sessionGeneration++;
      }
      // Only restore an adapter for an EXTERNAL session — those are the only ones
      // signed via an adapter. `internal` is custodial (server-signed) and `smart`
      // is passkey-signed; attaching an adapter to either (from a stale walletType
      // row left by a prior external login that was switched away from without a
      // logout) would mis-route their signing to the wrong key. (`_storeSession`
      // nulls the in-memory adapter on a switch but doesn't remove the persisted
      // row, so guard on the SESSION type here, not the row's presence.)
      const storedType =
        this._session.wallet?.type === 'external' ? await readWalletType(this._storage, this.apiKeyHash) : null;
      if (storedType) {
        // Look the adapter up in the registry. If it's no longer registered
        // (e.g. the consumer dropped the kit-adapter package), the session stays
        // valid; signing falls back to the server-side custodial path until the
        // user reconnects a wallet.
        const restored = this._walletAdapters.get(storedType);
        if (restored) this._walletAdapter = restored;
        else this._log.warn('[PollarClient] No registered wallet adapter for stored id', { id: storedType });
      }

      // Cross-tab token rotation of the SAME already-verified session: another
      // tab just refreshed and wrote a fresh token. The server issued that
      // token, so the session is still valid — keep `verified: true`, pick up
      // the new token, and skip the redundant `/auth/session/resume`. Without
      // this, every sibling tab's rotation would flap `verified` true→false→true
      // and fire an extra resume round-trip.
      // Key on `clientSessionId` — the canonical per-session identity, always
      // present. Do NOT also require `userId`: a valid session can have
      // `userId: null` (isValidSession allows it), and gating on it would make
      // those sessions miss this fast path and keep flapping `verified` on every
      // cross-tab rotation. Two different users can't share a clientSessionId.
      const isSameVerifiedSession =
        prevState.step === 'authenticated' &&
        prevState.verified &&
        prevSession != null &&
        !!prevSession.clientSessionId &&
        prevSession.clientSessionId === this._session.clientSessionId;
      if (isSameVerifiedSession) {
        this._log.info('[PollarClient] Session token rotated (cross-tab); keeping verified');
        this._setAuthState({ step: 'authenticated', session: this._session, verified: true });
        this._scheduleNextRefresh();
        return;
      }

      // F5: if the stored access token is ALREADY expired, refresh inline BEFORE
      // surfacing the session — otherwise a consumer reading `session.token` in
      // the optimistic `verified:false` window forwards a token we already know is
      // dead. A successful refresh both rotates the token AND proves the session
      // is alive server-side, so emit `verified:true` and skip the resume.
      // `_doRefresh` already re-armed the proactive timer and, on failure, cleared
      // the session (so we just return).
      if (this._session.token.expiresAt * 1000 < Date.now()) {
        this._log.info('[PollarClient] Restored session has an expired access token; refreshing before surfacing it');
        try {
          await this.refresh();
        } catch {
          return; // refresh failed → session was cleared; stay logged out
        }
        if (this._session) {
          this._setAuthState({ step: 'authenticated', session: this._session, verified: true });
        }
        return;
      }

      this._log.info('[PollarClient] Session restored from storage');
      // Emit through the setter so listeners that subscribe after
      // _initialize() resolves still get notified. A direct assignment to
      // _authState would race past any onAuthStateChange subscription that
      // hasn't run yet (e.g. PollarProvider's useEffect).
      // Optimistic: storage is trusted enough to show `authenticated`, but the
      // server hasn't confirmed the session is still alive (it may have been
      // revoked elsewhere), so `verified: false`.
      this._setAuthState({ step: 'authenticated', session: this._session, verified: false });
      this._scheduleNextRefresh();
      // Fire-and-forget: revalidate + repopulate the profile in the background.
      // Deliberately NOT awaited so `_initialized` resolves immediately and the
      // UI never blocks on a network round-trip at startup.
      void this._resume();
    } else {
      this._log.info('[PollarClient] No session in storage');
      // Another tab (or this one) wiped the session key. If we were
      // authenticated, propagate the logout: tear down in-memory state, the
      // refresh timer and DPoP keys, and emit `idle`. Guarded so the cold-start
      // call (step already `idle`) is a no-op and we never recurse — the
      // `removeStorage` inside `_clearSession` targets an already-removed key.
      if (this._authState.step !== 'idle') {
        await this._clearSession();
      }
    }
  }

  /**
   * Validate the restored session against the server and repopulate the
   * in-memory profile (PII is never persisted, so it's null after a cold
   * reload). Goes through the normal authed client, so it coalesces with any
   * in-flight refresh (onRequest awaits `_refreshPromise`) and, being a GET,
   * is auto-retried after a 401-triggered refresh.
   *
   * - 200            → store profile, mark the session `verified`.
   * - 401            → the refresh-on-401 path already ran; if the family was
   *                    revoked, refresh failed and `_clearSession()` took us to
   *                    idle. We also clear here as a belt-and-suspenders.
   * - 403 / 410      → the session was revoked elsewhere while its access token
   *                    is still unexpired (so the 401→refresh path never fired).
   *                    Definitive: converge to logged-out.
   * - 404/429/5xx    → endpoint mismatch / rate limit / transient: do NOT log
   *                    out; keep the optimistic session for a later retry.
   * - network error  → stay optimistic; revalidated on `visibilitychange`/use.
   */
  private async _resume(): Promise<void> {
    if (!this._session) return;
    const gen = this._sessionGeneration;
    this._resumeController?.abort();
    const controller = new AbortController();
    this._resumeController = controller;
    try {
      const { data, error, response } = await this._api.GET('/auth/session/resume', { signal: controller.signal });
      // Bail if the session was cleared/replaced (logout / refresh / new login)
      // or the client destroyed while resume was in flight — don't emit over, or
      // clear, a session that's no longer the one we started with.
      if (this._destroyed || this._sessionGeneration !== gen || !this._session) return;

      if (error || !data) {
        // Only treat statuses that unambiguously mean "this session is gone" as a
        // logout. A 404 (deploy/endpoint mismatch), 429 (rate limit) or 5xx
        // (transient) must NOT strand the user logged-out.
        const status = response?.status ?? 0;
        if (status === 401 || status === 403 || status === 410) {
          await this._clearSession();
        }
        return;
      }

      const content = (data as { content?: PollarUserProfile }).content;
      if (!content) return;
      this._profile = { ...content };
      this._setAuthState({ step: 'authenticated', session: this._session, verified: true });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      // Network failure (no response) — keep the optimistic (unverified) session
      // and retry when the app next becomes visible or on the next authed request.
      this._log.warn('[PollarClient] resume failed (network); will retry', err);
    } finally {
      if (this._resumeController === controller) this._resumeController = null;
    }
  }

  private async _storeSession(session: PollarApplicationConfigContent): Promise<void> {
    this._log.info('[PollarClient] Session stored');

    // The wire response still carries the legacy `publicKey` alias (kept for
    // older SDKs); the persisted session standardizes on `address` only.
    // `type` needs no remap: the wire speaks the same vocabulary as the SDK
    // surface ('internal' | 'smart' | 'external').
    //
    // Applied identically to `wallet` and to every entry of `wallets[]` so the
    // back-compat field and the array can't end up describing the same wallet
    // differently.
    const toPersistedWallet = (w: PollarApplicationConfigContent['wallet']): PollarPersistedWallet => ({
      type: w.type,
      // `provider` (the login method) was added to the wire after the generated
      // OpenAPI types were last cut, so read it defensively until they're regen'd.
      ...((w as { provider?: string }).provider ? { provider: (w as { provider?: string }).provider as string } : {}),
      address: w.address ?? w.publicKey ?? null,
      ...(w.chain !== undefined ? { chain: w.chain } : {}),
      ...(w.existsOnStellar !== undefined ? { existsOnStellar: w.existsOnStellar } : {}),
      ...(w.fundingMode !== undefined ? { fundingMode: w.fundingMode } : {}),
      ...(w.createdAt !== undefined ? { createdAt: w.createdAt } : {}),
      ...(w.linkedAt !== undefined ? { linkedAt: w.linkedAt } : {}),
      ...(w.network !== undefined ? { network: w.network } : {}),
      ...(w.deployTxHash !== undefined ? { deployTxHash: w.deployTxHash } : {}),
    });

    const persisted: PollarPersistedSession = {
      clientSessionId: session.clientSessionId,
      userId: session.userId ?? null,
      status: session.status,
      token: session.token,
      user: session.user,
      wallet: toPersistedWallet(session.wallet),
      // Absent on logins against an sdk-api that predates `wallets[]` — persist
      // nothing rather than an empty array, so consumers can tell "not reported"
      // apart from "genuinely none".
      ...(session.wallets ? { wallets: session.wallets.map(toPersistedWallet) } : {}),
    };
    // A fresh login replaces the session: invalidate any refresh/resume still
    // in flight against the previous one.
    this._sessionGeneration++;
    const gen = this._sessionGeneration;
    this._session = persisted;

    if (session.data) {
      this._profile = {
        mail: session.data.mail,
        first_name: session.data.first_name,
        last_name: session.data.last_name,
        avatar: session.data.avatar,
        providers: session.data.providers,
      };
    }

    await writeStorage(this._storage, this.apiKeyHash, persisted);
    // A logout / destroy / newer login landed DURING the persist await — bail so
    // we don't emit `authenticated` (resurrecting a session that was just
    // cleared) or re-arm the refresh timer for a session this call no longer
    // owns. Mirrors the generation guard in `_doRefresh`.
    if (this._destroyed || this._sessionGeneration !== gen) return;
    // Drop a stale external adapter when switching to a non-external session
    // (e.g. external-wallet login → later email/passkey login). The wallet flow
    // sets `_walletAdapter` BEFORE calling us (storeWalletAdapter → authenticate
    // → storeSession), so only clear it when the NEW session isn't external —
    // that preserves the adapter an external login just stored for itself, while
    // fixing getWalletType()/signing reporting a stale wallet after a switch.
    if (persisted.wallet.type !== 'external') {
      this._walletAdapter = null;
    }
    // Account switch without a logout (login-over-login) bypasses _clearSession,
    // so reset the read/tx stores here too — otherwise the previous user's
    // balance/history/tx-state would linger and an in-flight fetch could land
    // their data in the new session's store. On a first login (from idle) the
    // stores are already idle, so this is a harmless no-op.
    this._resetReactiveStores();
    // Fresh login/refresh response came straight from the server, so the
    // session is already server-validated → `verified: true`.
    this._setAuthState({ step: 'authenticated', session: persisted, verified: true });
    this._scheduleNextRefresh();
  }

  private async _clearSession(): Promise<void> {
    this._log.info('[PollarClient] Session cleared');
    // Invalidate any in-flight refresh/resume so a result that lands after this
    // clear (e.g. a refresh racing a logout) is discarded instead of
    // resurrecting the session, and abort the resume so it can't re-emit
    // `authenticated` after we go `idle`.
    this._sessionGeneration++;
    this._resumeController?.abort();
    this._resumeController = null;
    this._clearRefreshTimer();
    this._session = null;
    this._profile = null;
    this._walletAdapter = null;
    this._dpopNonce = null;
    try {
      await this._keyManager.reset();
    } catch (err) {
      this._log.warn('[PollarClient] KeyManager reset failed during clearSession', err);
    }
    await removeStorage(this._storage, this.apiKeyHash);
    this._resetReactiveStores();
    this._setAuthState({ step: 'idle' });
  }

  private _networkPassphrase(): string {
    return this.getNetwork() === 'mainnet'
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015';
  }

  private _setNetworkState(next: NetworkState): void {
    this._networkState = next;
    const label = next.step === 'connected' ? next.network : next.step;
    this._log.debug(`[PollarClient] network:${label}`);
    for (const cb of this._networkStateListeners) cb(next);
  }

  private _setAuthState(next: AuthState): void {
    this._authState = next;
    this._log.debug(`[PollarClient] auth:${next.step}`);
    // Dispatch a clone: `next.session` is the live `_session` the middleware
    // signs with, so a subscriber that mutates `state.session.token` would
    // otherwise corrupt it. `getAuthState()` already clones; this makes the
    // push path symmetric. (`@pollar/react` dedupes by value, so a fresh object
    // per emission is safe — verified no useSyncExternalStore / ref-dedupe.)
    const snapshot = this._cloneAuthState(next);
    for (const cb of this._authStateListeners) cb(snapshot);
  }

  private _setTransactionState(next: TransactionState): void {
    // Drop a write from a tx whose session was torn down (logout) or replaced
    // (new login) after it started — see `_txStartGen`.
    if (this._sessionGeneration !== this._txStartGen) return;
    this._transactionState = next;
    this._log.debug(`[PollarClient] transaction:${next.step}`);
    for (const cb of this._transactionStateListeners) cb(next);
  }

  /**
   * Reset the tx store + the 4 reactive read stores (txHistory / balance /
   * assets / sessions) to idle and bump their generations. Called on ANY session
   * change — logout (`_clearSession`) AND login-over-login (`_storeSession`, a
   * no-logout account switch) — so the previous user's balance/history/sessions
   * and the last tx's terminal state can't linger or be repopulated by an
   * in-flight fetch that resolves into the new session's store.
   *
   * The tx store is dispatched DIRECTLY (not via `_setTransactionState`) on
   * purpose: re-arming `_txStartGen` to satisfy that method's F2 generation guard
   * would also let an in-flight tx's late write through. Leaving `_txStartGen`
   * untouched keeps a late tx write dropped by the guard. Callers must bump
   * `_sessionGeneration` BEFORE calling this (both already do).
   */
  private _resetReactiveStores(): void {
    this._transactionState = { step: 'idle' };
    for (const cb of this._transactionStateListeners) cb(this._transactionState);
    this._txHistoryGen++;
    this._walletBalanceGen++;
    this._enabledAssetsGen++;
    this._sessionsGen++;
    this._setTxHistoryState({ step: 'idle' });
    this._setWalletBalanceState({ step: 'idle' });
    this._setEnabledAssetsState({ step: 'idle' });
    this._setSessionsState({ step: 'idle' });
  }

  /**
   * Threads `buildData` through state transitions. When the user has already
   * called `buildTx`, every subsequent state (signing, signed, submitting,
   * submitted, success, error) should carry the build summary so modal UIs
   * can keep showing "Send 5 USDC to G..." through the whole flow.
   */
  private _currentBuildData(): TxBuildContent | undefined {
    const s = this._transactionState;
    if (!s) return undefined;
    // A terminal step belongs to a FINISHED tx. `_transactionState` is only
    // reset on `_clearSession`, so without this a standalone signTx/submitTx
    // (no preceding buildTx) would thread the previous tx's buildData into the
    // new one — mislabeling its UI summary. Only carry buildData forward from
    // live, in-progress steps; the composed paths (buildTx→signTx→submitTx) read
    // it while non-terminal (`built`/`signed`), so they're unaffected.
    if (s.step === 'success' || s.step === 'submitted' || s.step === 'error') return undefined;
    if ('buildData' in s && s.buildData) return s.buildData;
    return undefined;
  }
}
