import { createApiClient, PollarApiClient } from '../api/client';
import type { paths } from '../api/schema';
import { claimDistributionRule, listDistributionRules } from '../api/endpoints/distribution';
import { getKycProviders, getKycStatus, pollKycStatus, resolveKyc, startKyc } from '../api/endpoints/kyc';
import { createOffRamp, createOnRamp, getRampsQuote, getRampTransaction, pollRampTransaction } from '../api/endpoints/ramps';
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
  PollarUserProfile,
  RampsOfframpBody,
  RampsOfframpResponse,
  RampsOnrampBody,
  RampsOnrampResponse,
  RampsQuoteQuery,
  RampsQuoteResponse,
  RampsTransactionResponse,
  RampTxStatus,
  SessionInfo,
  SessionsState,
  SignAuthEntryOutcome,
  SignOutcome,
  SubmitOutcome,
  TransactionState,
  TrustlineOutcome,
  TxBuildBody,
  TxBuildContent,
  TxHistoryParams,
  TxHistoryState,
  TxSignAndSendBody,
  WalletBalanceContent,
  WalletBalanceState,
  WalletInfo,
} from '../types';
import { POLLAR_CORE_VERSION } from '../version';
import { defaultVisibilityProvider } from '../visibility/autodetect';
import type { VisibilityProvider } from '../visibility/types';
import { AlbedoAdapter, FreighterAdapter, WalletAdapter, WalletAdapterResolver, WalletId, WalletType } from '../wallets';
import { authenticate } from './auth/authenticate';
import { createAuthSession } from './auth/deps';
import { resolveAuthError } from './auth/errorMessages';
import { initEmailSession, sendEmailCode, verifyAndAuthenticate } from './auth/emailFlow';
import { defaultWebOAuthOpener, loginOAuth } from './auth/oauthFlow';
import { smartWalletFlow } from './auth/passkeyFlow';
import { emailProvider, oauthProvider } from './auth/providers';
import { loginWallet, requestWalletChallenge } from './auth/walletFlow';
import { readStorage, readWalletType, removeStorage, sessionStorageKey, writeStorage, writeWalletType } from './session';

/** Request body for the external-provider auth leg (`POST /auth/external`). */
type ExternalAuthBody = NonNullable<paths['/auth/external']['post']['requestBody']>['content']['application/json'];

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
  /** Updated by the request middleware. Read by the silent-refresh scheduler
   *  to skip proactive refreshes after `maxIdleMs` of no HTTP activity. */
  private _lastRequestAt: number = Date.now();
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _visibilityUnsubscribe: (() => void) | null = null;

  private _transactionState: TransactionState | null = null;
  private _transactionStateListeners = new Set<(state: TransactionState) => void>();
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
  private readonly _walletAdapterResolver: WalletAdapterResolver | null;
  private readonly _walletResolverTimeoutMs: number;
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
   * Registry of pluggable login strategies, keyed by provider id. Seeded with
   * the built-ins (`google`, `github`, `email`) and then any `config.providers`
   * (which can override a built-in by reusing its id). `wallet` is deliberately
   * absent — it keeps its own dedicated flow. See {@link PollarAuthProvider}.
   */
  private readonly _providers = new Map<string, PollarAuthProvider>();

  constructor(config: PollarClientConfig) {
    this.apiKey = config.apiKey;
    this.id = randomUUID();
    this.basePath = `${config.baseUrl || 'https://sdk.api.pollar.xyz'}/v1`;
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
    this._walletAdapterResolver = config.walletAdapter ?? null;
    this._walletResolverTimeoutMs = config.walletResolverTimeoutMs ?? 5000;
    this._passkey = config.passkey ?? null;
    this._passkeySign = config.passkeySign ?? null;
    this._deviceLabel = config.deviceLabel;
    this._visibilityProvider = config.visibilityProvider ?? defaultVisibilityProvider();
    this._maxIdleMs = config.maxIdleMs;
    this._openAuthUrl = config.openAuthUrl ?? defaultWebOAuthOpener;
    // `window.location` can be absent even when `isBrowser` is true (some
    // webview/SSR shims expose a partial `window`); read it defensively so the
    // constructor never throws on a missing `.origin`.
    this._oauthRedirectUri = config.oauthRedirectUri ?? (isBrowser ? (window.location?.origin ?? '') : '');

    // Seed built-in providers first, then let custom ones override by id.
    for (const provider of [oauthProvider('google'), oauthProvider('github'), emailProvider()]) {
      this._providers.set(provider.id, provider);
    }
    for (const provider of config.providers ?? []) {
      this._providers.set(provider.id, provider);
    }

    this._api = createApiClient(this.basePath);
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

        // The refresh endpoint has special handling: don't recursively trigger
        // refresh from inside itself. But DO honor a nonce challenge — the
        // fresh `DPoP-Nonce` was already captured above, so a single retry
        // with the new nonce succeeds. Any other 401 (RT expired, reused,
        // invalid) propagates to `_doRefresh` which clears the session.
        if (request.url.includes('/auth/refresh')) {
          if (isNonceChallenge) return self._logHttp(request, await self._retryRequest(request));
          return self._logHttp(request, response);
        }

        if (!isNonceChallenge) {
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
          // so a manual retry by the caller will succeed. Nonce-challenge
          // 401s don't go through this branch (server didn't process the
          // request), so any method retries safely above.
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

  /** Strips origin + `/v1` version prefix from a request URL for compact logs. */
  private _httpPath(url: string): string {
    try {
      const { pathname } = new URL(url);
      return pathname.startsWith('/v1/') ? pathname.slice(3) : pathname;
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
    return fetch(retried);
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
   * so we never collide with a reactive 401-triggered refresh. On failure,
   * `_doRefresh` already calls `_clearSession`, so auth-state listeners see
   * `step:'idle'` — no extra event dispatch needed here.
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
      this._log.warn('[PollarClient] Proactive refresh failed; session cleared', err);
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
    // Wallet stays a dedicated flow: it yields a persistent `WalletAdapter`
    // (reused for signing long after login) and needs the wallet-adapter
    // resolver — both orthogonal to the generic auth-provider abstraction.
    if (options.provider === 'wallet') {
      // 'wallet' is a reserved built-in id, so the shape is the wallet member —
      // assert it (the custom-provider catch-all in PollarLoginOptions otherwise
      // widens `type` away from WalletId).
      this.loginWallet((options as { provider: 'wallet'; type: WalletId }).type);
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

  // ─── Wallet flow (single call) ────────────────────────────────────────────

  loginWallet(type: WalletId): void {
    if (!isClientRuntime) {
      warnServerSide('loginWallet');
      return;
    }
    const controller = this._newController();
    loginWallet(type, this._flowDeps(controller.signal)).catch((err) => this._handleFlowError(err, controller.signal));
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
    smartWalletFlow(this._flowDeps(controller.signal), 'register').catch((err) => this._handleFlowError(err, controller.signal));
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────

  cancelLogin(): void {
    this._loginController?.abort();
    this._loginController = null;
    this._setAuthState({ step: 'idle' });
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
        this._setWalletBalanceState({ step: 'loaded', data: data.content });
      } else {
        this._setWalletBalanceState({ step: 'error', message: 'Failed to load balance' });
      }
    } catch {
      if (gen !== this._walletBalanceGen) return;
      this._setWalletBalanceState({ step: 'error', message: 'Failed to load balance' });
    }
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
        this._setEnabledAssetsState({ step: 'loaded', data: data.content });
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
   * Routing mirrors how the platform pays for the reserve:
   *  - **Sponsored custodial** (`opts.sponsored` true, internal wallet) → the
   *    server orchestrates a sponsored `changeTrust`: the app's wallets cover the
   *    0.5 XLM reserve and the fee, so the user pays nothing. Pass the asset's
   *    `sponsored` flag (from {@link refreshAssets}) straight through.
   *  - **Self-paid** (external/adapter wallet, sponsorship disabled, or a custom
   *    asset not configured in the app) → a plain `change_trust` transaction the
   *    user's own wallet signs and pays for, via {@link runTx}.
   *
   * Does not refresh on its own — callers should `refreshAssets()` afterwards.
   */
  async setTrustline(
    asset: { code: string; issuer: string },
    opts?: { limit?: string; sponsored?: boolean },
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

    // Sponsored custodial path: the platform co-signs and the app pays. Only an
    // app-configured asset on an internal (custodial) wallet qualifies — the
    // backend re-checks and 400s otherwise.
    if (opts?.sponsored && !this._walletAdapter && walletType === 'internal') {
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
          (error as { details?: string; code?: string } | undefined)?.details ?? (error as { code?: string } | undefined)?.code;
        return { status: 'error', ...(details && { details }) };
      } catch (err) {
        const details = err instanceof Error ? err.message : undefined;
        return { status: 'error', ...(details && { details }) };
      }
    }

    // Self-paid path: the user's own wallet signs and covers the reserve + fee.
    // The backend's change_trust schema is a discriminated union on `type`, so
    // derive it from the code length (1–4 → alphanum4, 5–12 → alphanum12).
    return this.runTx('change_trust', {
      asset: {
        type: asset.code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12',
        code: asset.code,
        issuer: asset.issuer,
      },
      ...(limit !== undefined && { limit }),
    } as TxBuildBody['params']);
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
    if (!this._session?.wallet?.address) {
      const details = 'No wallet connected';
      this._setTransactionState({ step: 'error', phase: 'building', details });
      return { status: 'error', details };
    }

    const body = {
      network: this.getNetwork(),
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
   * The authenticated user's wallet as a {@link WalletInfo} discriminated union,
   * or `null` when there's no session (or the session carries no address yet).
   *
   * `custody` strictly determines `provider` (the mapping is 1:1 and fixed at
   * account creation server-side): `external` reports the connected adapter id
   * (`getWalletType()`), `smart` is always `'passkey'`, and `internal` reports
   * the login method the backend recorded (`null` for pre-provider sessions).
   */
  getWallet(): WalletInfo | null {
    const w = this._session?.wallet;
    if (!w || !w.address) return null;
    switch (w.type) {
      case 'external':
        return { custody: 'external', address: w.address, provider: this._walletAdapter?.type ?? null };
      case 'smart':
        return { custody: 'smart', address: w.address, provider: 'passkey' };
      case 'internal':
        return { custody: 'internal', address: w.address, provider: (w.provider as string | undefined) ?? null };
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
  async signTx(unsignedXdr: string): Promise<SignOutcome> {
    const buildData = this._currentBuildData();
    this._setTransactionState({ step: 'signing', ...(buildData && { buildData }) });

    // A smart-wallet session signs via the passkey path (signAndSubmitTx →
    // _signSubmitSmart), never an external adapter. Guard on the session type so
    // a stale/foreign `_walletAdapter` can't hijack signing — consistent with
    // the type-first ordering in signAndSubmitTx/buildAndSignAndSubmitTx.
    if (this._walletAdapter && this._session?.wallet?.type !== 'smart') {
      const accountToSign = this._session?.wallet?.address;
      const signOpts = accountToSign
        ? { networkPassphrase: this._networkPassphrase(), accountToSign }
        : { networkPassphrase: this._networkPassphrase() };
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

    // Smart-wallet (C-address/passkey) sessions sign via signAndSubmitTx
    // (_signSubmitSmart's passkey ceremony), NOT the custodial endpoint. A
    // standalone signTx can't run that ceremony, so return an explicit error
    // instead of POSTing to /tx/sign with the wrong key. Mirrors signAuthEntry.
    if (this._session?.wallet?.type === 'smart') {
      return {
        status: 'error',
        details: 'signTx is not supported for smart (passkey) wallets; use signAndSubmitTx.',
      };
    }

    // Custodial path: backend signs and returns the XDR + idempotencyKey.
    const address = this._session?.wallet?.address ?? '';
    try {
      const { data, error } = await this._api.POST('/tx/sign', {
        body: { network: this.getNetwork(), address, unsignedXdr },
      });
      if (!error && data?.success && data.content?.signedXdr) {
        const { signedXdr, idempotencyKey } = data.content;
        this._setTransactionState({
          step: 'signed',
          signedXdr,
          submissionToken: idempotencyKey,
          ...(buildData && { buildData }),
        });
        return { status: 'signed', signedXdr, submissionToken: idempotencyKey };
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
    // External adapter: the provider signs the entry directly. Skip it for a
    // smart-wallet session (passkey-signed) so a stale/foreign adapter can't
    // hijack signing — consistent with the type-first signing paths.
    if (this._walletAdapter && this._session?.wallet?.type !== 'smart') {
      const accountToSign = this._session?.wallet?.address;
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
        body: { network: this.getNetwork(), address, entryXdr, validUntilLedger: options.validUntilLedger },
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

  async submitTx(signedXdr: string, opts?: { submissionToken?: string }): Promise<SubmitOutcome> {
    const buildData = this._currentBuildData();
    const outcomeExtra: { buildData?: TxBuildContent } = buildData ? { buildData } : {};
    this._setTransactionState({ step: 'submitting', signedXdr, ...(buildData && { buildData }) });

    const address = this._session?.wallet?.address ?? '';
    try {
      const { data, error } = await this._api.POST('/tx/submit', {
        body: {
          network: this.getNetwork(),
          address,
          signedXdr,
          ...(opts?.submissionToken && { idempotencyKey: opts.submissionToken }),
        },
      });
      if (!error && data?.success && data.content) {
        const { hash, status: backendStatus, resultCode } = data.content;
        if (backendStatus === 'SUCCESS') {
          this._setTransactionState({ step: 'success', hash, ...(buildData && { buildData }) });
          return { status: 'success', hash, ...outcomeExtra };
        }
        if (backendStatus === 'PENDING') {
          this._setTransactionState({ step: 'submitted', hash, ...(buildData && { buildData }) });
          return { status: 'pending', hash, ...outcomeExtra };
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
      network: this.getNetwork(),
      address: this._session?.wallet?.address ?? '',
      unsignedXdr,
    };
    try {
      const { data, error } = await this._api.POST('/tx/sign-and-send', { body });
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
          return { status: 'pending', hash, ...outcomeExtra };
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
          network: this.getNetwork(),
          address: this._session.wallet.address,
          operation,
          params,
          options: options ?? {},
        } as TxBuildBody & { idempotencyKey?: string },
      });
      if (!error && data?.success && data.content) {
        const { hash, status: backendStatus, resultCode } = data.content;
        if (backendStatus === 'SUCCESS') {
          this._setTransactionState({ step: 'success', hash });
          return { status: 'success', hash };
        }
        if (backendStatus === 'PENDING') {
          this._setTransactionState({ step: 'submitted', hash });
          return { status: 'pending', hash };
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
        network: this.getNetwork(),
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
          network: this.getNetwork(),
          address,
          smart: { entryXdr: smart.entryXdr, funcXdr: smart.funcXdr, assertion },
        },
      });
      if (!error && data?.success && data.content) {
        const { hash, status: backendStatus, resultCode } = data.content;
        if (backendStatus === 'SUCCESS') {
          this._setTransactionState({ step: 'success', hash, buildData });
          return { status: 'success', hash, ...outcomeExtra };
        }
        if (backendStatus === 'PENDING') {
          this._setTransactionState({ step: 'submitted', hash, buildData });
          return { status: 'pending', hash, ...outcomeExtra };
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

  createOnRamp(body: RampsOnrampBody): Promise<RampsOnrampResponse> {
    return createOnRamp(this._api, body);
  }

  createOffRamp(body: RampsOfframpBody): Promise<RampsOfframpResponse> {
    return createOffRamp(this._api, body);
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
   * `createSession`, `authenticate`, `exchangeExternalToken`, `startHostedOAuth`
   * — while storage / wallet-adapter / key-manager internals stay private. All
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
      exchangeExternalToken: (clientSessionId, body) => this._exchangeExternalToken(clientSessionId, body, signal),
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

  /**
   * Generic external-provider exchange leg (`POST /auth/external`). Custom
   * providers call this (via the context) after their own SDK has authenticated
   * the user and the wallet has counter-signed the SEP-10 challenge
   * (`{ provider, walletAddress, signedChallengeXdr }`). On success the session
   * is marked READY server-side and the provider should then call
   * `ctx.authenticate(clientSessionId)`. Returns `false` (and sets an error
   * state) on failure.
   */
  private async _exchangeExternalToken(
    clientSessionId: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<boolean> {
    const { data, error } = await this._api.POST('/auth/external', {
      // clientSessionId LAST so a provider's body can't override the real one.
      body: { ...body, clientSessionId } as ExternalAuthBody,
      signal,
    });

    if (error || !data?.success) {
      this._log.error('[PollarClient] External provider authentication failed', { error: redactDeep(error) });
      // Don't clobber the active flow if this one was cancelled/superseded.
      if (!signal.aborted) {
        this._setAuthState({
          step: 'error',
          previousStep: this._authState.step,
          message: 'External provider authentication failed',
          errorCode: AUTH_ERROR_CODES.EXTERNAL_AUTH_FAILED,
        });
      }
      return false;
    }
    return true;
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
      resolveWalletAdapter: (id: WalletId) => this._resolveWalletAdapter(id),
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

  /**
   * Resolves a wallet adapter for the requested id. Uses the consumer's
   * injected `walletAdapter` resolver when present; otherwise falls back to
   * the built-in `FreighterAdapter` / `AlbedoAdapter`. Throws if the id is
   * unknown and no resolver is configured.
   */
  private async _resolveWalletAdapter(id: WalletId): Promise<WalletAdapter> {
    if (this._walletAdapterResolver) {
      // Race the resolver against a timeout. A broken extension bridge can
      // leave `walletAdapterResolver()` pending forever; without this the
      // entire login flow would hang with no signal to the consumer. The
      // resolver only constructs the adapter object (not the user-facing
      // approval), so 5s is generous.
      const timeoutMs = this._walletResolverTimeoutMs;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            Object.assign(new Error(`[PollarClient] Wallet adapter resolver for "${id}" timed out after ${timeoutMs}ms`), {
              code: AUTH_ERROR_CODES.WALLET_RESOLVER_TIMEOUT,
            }),
          );
        }, timeoutMs);
      });
      try {
        return await Promise.race([Promise.resolve(this._walletAdapterResolver(id)), timeoutPromise]);
      } finally {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      }
    }
    if (id === WalletType.FREIGHTER) return new FreighterAdapter();
    if (id === WalletType.ALBEDO) return new AlbedoAdapter(this.getNetwork() === 'mainnet' ? 'public' : 'testnet');
    throw new Error(
      `[PollarClient] No wallet adapter configured for "${id}". Pass a walletAdapter resolver in PollarClientConfig.`,
    );
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
      // Only restore an external adapter for a session that actually signs via
      // one. A `smart` session is passkey-signed; restoring an adapter for it
      // (from a stale walletType row) would leave `_walletAdapter` set on a
      // smart session and could mis-route signing.
      const storedType = this._session.wallet?.type === 'smart' ? null : await readWalletType(this._storage, this.apiKeyHash);
      if (storedType) {
        try {
          this._walletAdapter = await this._resolveWalletAdapter(storedType);
        } catch (err) {
          // No resolver knows this id (e.g. user removed the kit-adapter
          // package). Session stays valid; signing will fall back to the
          // server-side custodial path until the user reconnects a wallet.
          this._log.warn('[PollarClient] Could not restore wallet adapter for stored id', { id: storedType, err });
        }
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

    const w = session.wallet;
    // `provider` (the login method) was added to the wire after the generated
    // OpenAPI types were last cut, so read it defensively until they're regen'd.
    const wireProvider = (w as { provider?: string }).provider;
    const persisted: PollarPersistedSession = {
      clientSessionId: session.clientSessionId,
      userId: session.userId ?? null,
      status: session.status,
      token: session.token,
      user: session.user,
      // The wire response still carries the legacy `publicKey` alias (kept for
      // older SDKs); the persisted session standardizes on `address` only.
      // The wire also still emits the legacy type `'custodial'` (unchanged for
      // SDKs ≤0.8.x); we remap it to `'internal'` here so the SDK surface and
      // persisted session speak one vocabulary while the wire stays compatible.
      wallet: {
        type: w.type === 'custodial' ? 'internal' : w.type,
        ...(wireProvider ? { provider: wireProvider } : {}),
        address: w.address ?? w.publicKey ?? null,
        ...(w.existsOnStellar !== undefined ? { existsOnStellar: w.existsOnStellar } : {}),
        ...(w.createdAt !== undefined ? { createdAt: w.createdAt } : {}),
        ...(w.linkedAt !== undefined ? { linkedAt: w.linkedAt } : {}),
        ...(w.network !== undefined ? { network: w.network } : {}),
        ...(w.deployTxHash !== undefined ? { deployTxHash: w.deployTxHash } : {}),
      },
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
    this._transactionState = null;
    // Reset the reactive read stores so a UI still subscribed after logout shows
    // no data (not the previous user's balance/assets/history/sessions), and bump
    // their generations so an in-flight fetch that resolves after this can't
    // repopulate them.
    this._txHistoryGen++;
    this._walletBalanceGen++;
    this._enabledAssetsGen++;
    this._sessionsGen++;
    this._setTxHistoryState({ step: 'idle' });
    this._setWalletBalanceState({ step: 'idle' });
    this._setEnabledAssetsState({ step: 'idle' });
    this._setSessionsState({ step: 'idle' });
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
    this._transactionState = next;
    this._log.debug(`[PollarClient] transaction:${next.step}`);
    for (const cb of this._transactionStateListeners) cb(next);
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
