import { createApiClient, PollarApiClient } from '../api/client';
import { claimDistributionRule, listDistributionRules } from '../api/endpoints/distribution';
import { getKycProviders, getKycStatus, pollKycStatus, resolveKyc, startKyc } from '../api/endpoints/kyc';
import { createOffRamp, createOnRamp, getRampsQuote, getRampTransaction, pollRampTransaction } from '../api/endpoints/ramps';
import { buildProof } from '../dpop';
import { defaultKeyManager } from '../keys/factory';
import type { KeyManager } from '../keys/types';
import { hashApiKey } from '../lib/api-key-hash';
import { randomUUID } from '../lib/random-uuid';
import { StellarNetwork } from '../stellar/StellarClient';
import { defaultStorage } from '../storage/autodetect';
import type { OnStorageDegrade, Storage, StorageDegradeReason } from '../storage/types';
import { POLLAR_CORE_VERSION } from '../version';
import { defaultVisibilityProvider } from '../visibility/autodetect';
import type { VisibilityProvider } from '../visibility/types';
import {
  AUTH_ERROR_CODES,
  AuthState,
  AuthUrlOpener,
  BuildOutcome,
  DistributionClaimBody,
  DistributionClaimContent,
  DistributionRule,
  KycLevel,
  KycStartBody,
  KycStartResponse,
  KycStatus,
  NetworkState,
  PollarApplicationConfigContent,
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
  SignOutcome,
  SubmitOutcome,
  TransactionState,
  TxBuildBody,
  TxBuildContent,
  TxHistoryParams,
  TxHistoryState,
  TxSignAndSendBody,
  WalletBalanceState,
} from '../types';
import { AlbedoAdapter, FreighterAdapter, WalletAdapter, WalletAdapterResolver, WalletId, WalletType } from '../wallets';
import { initEmailSession, sendEmailCode, verifyAndAuthenticate } from './auth/emailFlow';
import { defaultWebOAuthOpener, loginOAuth } from './auth/oauthFlow';
import { loginWallet } from './auth/walletFlow';
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

/** Renew the access token this many seconds before its `exp` to absorb clock skew + signing latency. */
const REFRESH_SKEW_SECONDS = 60;

function warnServerSide(method: string): void {
  console.warn(
    `[PollarClient] ${method}() called server-side — browser APIs unavailable. Use PollarClient only in Client Components.`,
  );
}

export class PollarClient {
  readonly apiKey: string;
  readonly id: string;
  readonly basePath: string;

  private readonly _api: PollarApiClient;
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
   * Snapshot of each in-flight request's body, taken in `onRequest` before
   * `fetch()` consumes the stream. Needed because `Request.clone()` throws
   * once the body is disturbed, so the auto-retry path (DPoP nonce challenge
   * / 401 refresh) must rebuild the request from scratch instead of cloning.
   */
  private _requestBodyCache = new WeakMap<Request, ArrayBuffer>();
  /** Singleton in-flight refresh — concurrent 401s coalesce into one /auth/refresh call. */
  private _refreshPromise: Promise<void> | null = null;
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
  private _walletBalanceState: WalletBalanceState = { step: 'idle' };
  private _walletBalanceStateListeners = new Set<(state: WalletBalanceState) => void>();
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
  private _loginController: AbortController | null = null;
  /** Aborts an in-flight `/auth/session/resume` on destroy() or re-trigger. */
  private _resumeController: AbortController | null = null;
  /** Platform strategy for opening the hosted-OAuth URL (popup on web; injected on RN). */
  private readonly _openAuthUrl: AuthUrlOpener;
  /** `redirect_uri` sent to the backend for hosted OAuth. */
  private readonly _oauthRedirectUri: string;

  constructor(config: PollarClientConfig) {
    this.apiKey = config.apiKey;
    this.id = randomUUID();
    this.basePath = `${config.baseUrl || 'https://sdk.api.pollar.xyz'}/v1`;

    this._storage =
      config.storage ??
      defaultStorage({
        onDegrade: (reason, error) => {
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
    this._deviceLabel = config.deviceLabel;
    this._visibilityProvider = config.visibilityProvider ?? defaultVisibilityProvider();
    this._maxIdleMs = config.maxIdleMs;
    this._openAuthUrl = config.openAuthUrl ?? defaultWebOAuthOpener;
    this._oauthRedirectUri = config.oauthRedirectUri ?? (isBrowser ? window.location.origin : '');

    this._api = createApiClient(this.basePath);
    this._wireMiddlewares();

    this._networkState = { step: 'connected', network: config.stellarNetwork ?? 'testnet' };

    if (!isClientRuntime) {
      warnServerSide('constructor');
      this._initialized = Promise.resolve();
      return;
    }

    console.info(
      `[PollarClient] Initialized v${POLLAR_CORE_VERSION} — endpoint: ${this.basePath}, network: ${this._networkState.network}`,
    );

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
        if (e.key === sessionKey) {
          this._restoreSession().catch((err) => console.error('[PollarClient] Cross-tab restore failed', err));
        }
      };
      window.addEventListener('storage', handler);
      this._storageEventHandler = handler;
    }

    try {
      await this._keyManager.init();
    } catch (err) {
      console.warn('[PollarClient] KeyManager init failed; DPoP unavailable for this session', err);
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
        await self._initialized;
        // Cache the body before fetch() disturbs the stream — retries can't
        // call request.clone() once the body is consumed.
        if (request.body !== null) {
          try {
            self._requestBodyCache.set(request, await request.clone().arrayBuffer());
          } catch (err) {
            console.warn('[PollarClient] Could not snapshot request body for retry', err);
          }
        }
        // The refresh endpoint must not wait on its own in-flight refresh —
        // that would deadlock the singleton. Other requests wait so they
        // pick up the freshly-rotated token.
        const isRefresh = request.url.includes('/auth/refresh');
        if (!isRefresh && self._refreshPromise) await self._refreshPromise;

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

        if (response.status !== 401) return response;

        const wwwAuth = response.headers.get('WWW-Authenticate') ?? '';
        const isNonceChallenge = wwwAuth.includes('use_dpop_nonce');

        // The refresh endpoint has special handling: don't recursively trigger
        // refresh from inside itself. But DO honor a nonce challenge — the
        // fresh `DPoP-Nonce` was already captured above, so a single retry
        // with the new nonce succeeds. Any other 401 (RT expired, reused,
        // invalid) propagates to `_doRefresh` which clears the session.
        if (request.url.includes('/auth/refresh')) {
          if (isNonceChallenge) return self._retryRequest(request);
          return response;
        }

        if (!isNonceChallenge) {
          try {
            await self.refresh();
          } catch {
            return response;
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
            return response;
          }
        }
        return self._retryRequest(request);
      },
    });
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
        },
        this._keyManager,
      );
    } catch (err) {
      console.warn('[PollarClient] DPoP proof build failed', err);
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

    const cachedBody = this._requestBodyCache.get(originalRequest);
    const retried = new Request(originalRequest.url, {
      method: originalRequest.method,
      headers,
      body: cachedBody ?? null,
      credentials: originalRequest.credentials,
      mode: originalRequest.mode,
      redirect: originalRequest.redirect,
      referrer: originalRequest.referrer,
      integrity: originalRequest.integrity,
    });
    return fetch(retried);
  }

  // ─── Refresh (race-safe singleton) ───────────────────────────────────────

  /**
   * Coalesce concurrent refresh attempts. The first caller does the work;
   * everyone else awaits the same promise and sees the new tokens.
   */
  refresh(): Promise<void> {
    if (this._refreshPromise) return this._refreshPromise;
    this._refreshPromise = this._doRefresh().finally(() => {
      this._refreshPromise = null;
    });
    return this._refreshPromise;
  }

  private async _doRefresh(): Promise<void> {
    const refreshToken = this._session?.token?.refreshToken;
    if (!refreshToken) {
      console.warn('[PollarClient] Refresh skipped: no refresh token in session');
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
      console.error('[PollarClient] /auth/refresh request threw', err);
      await this._clearSession();
      throw err;
    }

    if (error || !data) {
      console.warn('[PollarClient] /auth/refresh returned error', { error });
      await this._clearSession();
      throw new Error('Refresh failed');
    }
    const successData = data as { success?: boolean; content?: { token?: PollarPersistedSession['token'] } };
    if (!successData.success || !successData.content?.token) {
      console.warn('[PollarClient] /auth/refresh response malformed', successData);
      await this._clearSession();
      throw new Error('Refresh response malformed');
    }

    const newToken = successData.content.token;
    if (
      typeof newToken.accessToken !== 'string' ||
      typeof newToken.refreshToken !== 'string' ||
      typeof newToken.expiresAt !== 'number'
    ) {
      console.warn('[PollarClient] /auth/refresh token shape invalid', newToken);
      await this._clearSession();
      throw new Error('Refresh response token shape invalid');
    }

    if (this._session) {
      try {
        this._session = { ...this._session, token: newToken };
        await writeStorage(this._storage, this.apiKeyHash, this._session);
        console.info('[PollarClient] Tokens refreshed');
      } catch (err) {
        console.error('[PollarClient] Failed to persist refreshed session', err);
        // In-memory state is still updated; the session works for this
        // process but won't survive reload. Don't clear — that'd surprise
        // the user with a logout for what's essentially a storage hiccup.
      }
      this._scheduleNextRefresh();
    }
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
    const expiresAt = this._session?.token?.expiresAt;
    if (typeof expiresAt !== 'number') return;
    const dueInMs = Math.max(0, (expiresAt - Math.floor(Date.now() / 1000) - REFRESH_SKEW_SECONDS) * 1000);
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
      console.warn('[PollarClient] Proactive refresh failed; session cleared', err);
    }
  }

  private _clearRefreshTimer(): void {
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  // ─── Auth state ──────────────────────────────────────────────────────────────

  getAuthState(): AuthState {
    return this._authState;
  }

  onAuthStateChange(cb: (state: AuthState) => void): () => void {
    this._authStateListeners.add(cb);
    cb(this._authState);
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
        console.error('[PollarClient] onStorageDegrade listener threw', err);
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
    if (options.provider === 'google' || options.provider === 'github' || options.provider === 'email') {
      const controller = this._newController();
      const deps = this._flowDeps(controller.signal);
      if (options.provider === 'google' || options.provider === 'github') {
        loginOAuth(options.provider, {
          ...deps,
          basePath: this.basePath,
          apiKey: this.apiKey,
          openAuthUrl: this._openAuthUrl,
          redirectUri: this._oauthRedirectUri,
        }).catch((err) => this._handleFlowError(err));
      } else if (options.provider === 'email') {
        const { email } = options;
        initEmailSession(deps)
          .then(() => {
            if (this._authState.step === 'entering_email') {
              return sendEmailCode(email, this._authState.clientSessionId, deps);
            }
          })
          .catch((err) => this._handleFlowError(err));
      }
    } else if (options.provider === 'wallet') {
      this.loginWallet(options.type);
    }
  }

  // ─── Email OTP flow (3 steps) ─────────────────────────────────────────────

  beginEmailLogin(): void {
    if (!isClientRuntime) {
      warnServerSide('beginEmailLogin');
      return;
    }
    const controller = this._newController();
    initEmailSession(this._flowDeps(controller.signal)).catch((err) => this._handleFlowError(err));
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
    const signal = this._loginController!.signal;
    sendEmailCode(email, clientSessionId, this._flowDeps(signal)).catch((err) => this._handleFlowError(err));
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
        this._authState.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_EXPIRED);

    if (this._authState.step !== 'entering_code' && !isRetryableError) {
      throw new PollarFlowError(`verifyEmailCode() requires step 'entering_code', current step is '${this._authState.step}'`);
    }
    const state = this._authState;
    const clientSessionId =
      state.step === 'entering_code' ? state.clientSessionId : (state as { clientSessionId?: string }).clientSessionId!;
    const email = state.step === 'entering_code' ? state.email : ((state as { email?: string }).email ?? '');

    const controller = this._newController();
    verifyAndAuthenticate(code, clientSessionId, email, this._flowDeps(controller.signal)).catch((err) =>
      this._handleFlowError(err),
    );
  }

  // ─── Wallet flow (single call) ────────────────────────────────────────────

  loginWallet(type: WalletId): void {
    if (!isClientRuntime) {
      warnServerSide('loginWallet');
      return;
    }
    const controller = this._newController();
    loginWallet(type, this._flowDeps(controller.signal)).catch((err) => this._handleFlowError(err));
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
    console.info('[PollarClient] Logout requested', { everywhere: !!options.everywhere });

    if (this._session?.token?.accessToken) {
      try {
        await this._api.POST('/auth/logout', {
          body: options.everywhere ? { everywhere: true } : {},
        });
      } catch (err) {
        console.warn('[PollarClient] Server logout failed (continuing with local clear)', err);
      }
    }

    try {
      await this._clearSession();
    } catch (err) {
      console.warn('[PollarClient] Local logout cleanup failed', err);
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
    this._setTxHistoryState({ step: 'loading', params });
    try {
      const { data, error } = await this._api.GET('/tx/history', { params: { query: params } });
      if (!error && data?.success && data.content) {
        this._setTxHistoryState({ step: 'loaded', params, data: data.content });
      } else {
        const message = (error as { message?: string } | undefined)?.message ?? 'Failed to load history';
        this._setTxHistoryState({ step: 'error', params, message });
      }
    } catch {
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

  async refreshBalance(publicKey?: string): Promise<void> {
    const pk = publicKey ?? this._session?.wallet?.publicKey;
    if (!pk) {
      this._setWalletBalanceState({ step: 'error', message: 'No wallet connected' });
      return;
    }
    this._setWalletBalanceState({ step: 'loading' });
    try {
      const network = this.getNetwork();
      const { data, error } = await this._api.GET('/wallet/balance', { params: { query: { publicKey: pk, network } } });
      if (!error && data?.success && data.content) {
        this._setWalletBalanceState({ step: 'loaded', data: data.content });
      } else {
        this._setWalletBalanceState({ step: 'error', message: 'Failed to load balance' });
      }
    } catch {
      this._setWalletBalanceState({ step: 'error', message: 'Failed to load balance' });
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
    if (!this._session?.wallet?.publicKey) {
      const details = 'No wallet connected';
      this._setTransactionState({ step: 'error', phase: 'building', details });
      return { status: 'error', details };
    }

    const body = {
      network: this.getNetwork(),
      publicKey: this._session.wallet.publicKey,
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
      console.error('[PollarClient] buildTx failed', err);
      this._setTransactionState({ step: 'error', phase: 'building' });
      return { status: 'error' };
    }
  }

  getWalletType(): WalletId | null {
    return this._walletAdapter?.type ?? null;
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

    if (this._walletAdapter) {
      const accountToSign = this._session?.wallet?.publicKey;
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

    // Custodial path: backend signs and returns the XDR + idempotencyKey.
    const publicKey = this._session?.wallet?.publicKey ?? '';
    try {
      const { data, error } = await this._api.POST('/tx/sign', {
        body: { network: this.getNetwork(), publicKey, unsignedXdr },
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
      const details = (error as { details?: string } | undefined)?.details;
      this._setTransactionState({
        step: 'error',
        phase: 'signing',
        ...(buildData && { buildData }),
        ...(details && { details }),
      });
      return { status: 'error', ...(details && { details }) };
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
  async submitTx(signedXdr: string, opts?: { submissionToken?: string }): Promise<SubmitOutcome> {
    const buildData = this._currentBuildData();
    const outcomeExtra: { buildData?: TxBuildContent } = buildData ? { buildData } : {};
    this._setTransactionState({ step: 'submitting', signedXdr, ...(buildData && { buildData }) });

    const publicKey = this._session?.wallet?.publicKey ?? '';
    try {
      const { data, error } = await this._api.POST('/tx/submit', {
        body: {
          network: this.getNetwork(),
          publicKey,
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
      const details = (error as { details?: string } | undefined)?.details;
      this._setTransactionState({
        step: 'error',
        phase: 'submitting',
        ...(buildData && { buildData }),
        ...(details && { details }),
      });
      return { status: 'error', ...outcomeExtra, ...(details && { details }) };
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
  async signAndSubmitTx(unsignedXdr: string): Promise<SubmitOutcome> {
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
      publicKey: this._session?.wallet?.publicKey ?? '',
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
      const details = (error as { details?: string } | undefined)?.details;
      this._setTransactionState({
        step: 'error',
        phase: 'signing-submitting',
        ...(buildData && { buildData }),
        ...(details && { details }),
      });
      return { status: 'error', ...outcomeExtra, ...(details && { details }) };
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
    if (this._walletAdapter) {
      const built = await this.buildTx(operation, params, options);
      if (built.status === 'error') {
        return { status: 'error', ...(built.details && { details: built.details }) };
      }
      return this.signAndSubmitTx(built.buildData.unsignedXdr);
    }

    // Custodial path — single backend call, compound state-machine step.
    if (!this._session?.wallet?.publicKey) {
      this._setTransactionState({ step: 'error', phase: 'building-signing-submitting', details: 'No wallet connected' });
      return { status: 'error', details: 'No wallet connected' };
    }
    this._setTransactionState({ step: 'building-signing-submitting' });
    try {
      const { data, error } = await this._api.POST('/tx/build-sign-submit', {
        body: {
          network: this.getNetwork(),
          publicKey: this._session.wallet.publicKey,
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
      const details = (error as { details?: string } | undefined)?.details;
      this._setTransactionState({
        step: 'error',
        phase: 'building-signing-submitting',
        ...(details && { details }),
      });
      return { status: 'error', ...(details && { details }) };
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

  private _setWalletBalanceState(next: WalletBalanceState): void {
    this._walletBalanceState = next;
    for (const cb of this._walletBalanceStateListeners) cb(next);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _newController(): AbortController {
    this._loginController?.abort();
    this._loginController = new AbortController();
    return this._loginController;
  }

  private _flowDeps(signal: AbortSignal) {
    return {
      api: this._api,
      basePath: this.basePath,
      // SSE status streaming works on web; React Native's `fetch` has no
      // readable `response.body`, so those clients poll the non-streaming
      // status endpoint instead. `isBrowser` is false in RN and SSR alike.
      useStreaming: isBrowser,
      signal,
      setAuthState: this._setAuthState.bind(this),
      storeSession: this._storeSession.bind(this),
      clearSession: this._clearSession.bind(this),
      getPublicJwk: () => this._keyManager.getPublicJwk(),
      resolveWalletAdapter: (id: WalletId) => this._resolveWalletAdapter(id),
      storeWalletAdapter: async (adapter: WalletAdapter, id: WalletId) => {
        this._walletAdapter = adapter;
        await writeWalletType(this._storage, this.apiKeyHash, id);
      },
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
    if (id === WalletType.ALBEDO) return new AlbedoAdapter();
    throw new Error(
      `[PollarClient] No wallet adapter configured for "${id}". Pass a walletAdapter resolver in PollarClientConfig.`,
    );
  }

  private _handleFlowError(error: unknown): void {
    if (error instanceof Error && error.name === 'AbortError') {
      console.info('[PollarClient] Login cancelled');
      this._setAuthState({ step: 'idle' });
      return;
    }
    if (error instanceof Error && (error as { code?: string }).code === AUTH_ERROR_CODES.WALLET_RESOLVER_TIMEOUT) {
      console.error('[PollarClient]', error.message);
      this._setAuthState({
        step: 'error',
        previousStep: this._authState.step,
        message: error.message,
        errorCode: AUTH_ERROR_CODES.WALLET_RESOLVER_TIMEOUT,
      });
      return;
    }
    console.error('[PollarClient] Unexpected error in auth flow', error);
    this._setAuthState({
      step: 'error',
      previousStep: this._authState.step,
      message: 'An unexpected error occurred',
      errorCode: AUTH_ERROR_CODES.UNEXPECTED_ERROR,
    });
  }

  private async _restoreSession(): Promise<void> {
    this._session = await readStorage(this._storage, this.apiKeyHash);
    if (this._session) {
      const storedType = await readWalletType(this._storage, this.apiKeyHash);
      if (storedType) {
        try {
          this._walletAdapter = await this._resolveWalletAdapter(storedType);
        } catch (err) {
          // No resolver knows this id (e.g. user removed the kit-adapter
          // package). Session stays valid; signing will fall back to the
          // server-side custodial path until the user reconnects a wallet.
          console.warn('[PollarClient] Could not restore wallet adapter for stored id', { id: storedType, err });
        }
      }
      console.info('[PollarClient] Session restored from storage');
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
      console.info('[PollarClient] No session in storage');
    }
  }

  /**
   * Validate the restored session against the server and repopulate the
   * in-memory profile (PII is never persisted, so it's null after a cold
   * reload). Goes through the normal authed client, so it coalesces with any
   * in-flight refresh (onRequest awaits `_refreshPromise`) and, being a GET,
   * is auto-retried after a 401-triggered refresh.
   *
   * - 200          → store profile, mark the session `verified`.
   * - 401          → the refresh-on-401 path already ran; if the family was
   *                  revoked, refresh failed and `_clearSession()` took us to
   *                  idle. Nothing to do here — don't double-handle.
   * - network error → stay optimistic (do NOT log out); revalidated later on
   *                  `visibilitychange` or first use.
   */
  private async _resume(): Promise<void> {
    if (!this._session) return;
    this._resumeController?.abort();
    const controller = new AbortController();
    this._resumeController = controller;
    try {
      const { data, error } = await this._api.GET('/auth/session/resume', { signal: controller.signal });
      if (error || !data) return;
      const content = (data as { content?: PollarUserProfile }).content;
      if (!content || !this._session) return;
      this._profile = { ...content };
      this._setAuthState({ step: 'authenticated', session: this._session, verified: true });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      // Network failure — keep the optimistic (unverified) session and retry
      // when the app next becomes visible or on the next authed request.
      console.warn('[PollarClient] resume failed (network); will retry', err);
    } finally {
      if (this._resumeController === controller) this._resumeController = null;
    }
  }

  private async _storeSession(session: PollarApplicationConfigContent): Promise<void> {
    // Drop the userId log — leaks user identity to console.
    console.info('[PollarClient] Session stored');

    const persisted: PollarPersistedSession = {
      clientSessionId: session.clientSessionId,
      userId: session.userId ?? null,
      status: session.status,
      token: session.token,
      user: session.user,
      wallet: session.wallet,
    };
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
    // Fresh login/refresh response came straight from the server, so the
    // session is already server-validated → `verified: true`.
    this._setAuthState({ step: 'authenticated', session: persisted, verified: true });
    this._scheduleNextRefresh();
  }

  private async _clearSession(): Promise<void> {
    console.info('[PollarClient] Session cleared');
    this._clearRefreshTimer();
    this._session = null;
    this._profile = null;
    this._walletAdapter = null;
    this._dpopNonce = null;
    try {
      await this._keyManager.reset();
    } catch (err) {
      console.warn('[PollarClient] KeyManager reset failed during clearSession', err);
    }
    await removeStorage(this._storage, this.apiKeyHash);
    this._transactionState = null;
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
    console.info(`[PollarClient] network:${label}`);
    for (const cb of this._networkStateListeners) cb(next);
  }

  private _setAuthState(next: AuthState): void {
    this._authState = next;
    console.info(`[PollarClient] auth:${next.step}`);
    for (const cb of this._authStateListeners) cb(next);
  }

  private _setTransactionState(next: TransactionState): void {
    this._transactionState = next;
    console.info(`[PollarClient] transaction:${next.step}`);
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
    if ('buildData' in s && s.buildData) return s.buildData;
    return undefined;
  }
}
