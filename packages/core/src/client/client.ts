import { createApiClient, PollarApiClient } from '../api/client';
import { getKycProviders, getKycStatus, pollKycStatus, resolveKyc, startKyc } from '../api/endpoints/kyc';
import {
  createOffRamp,
  createOnRamp,
  getRampsQuote,
  getRampTransaction,
  pollRampTransaction
} from '../api/endpoints/ramps';
import { buildProof } from '../dpop';
import { defaultKeyManager } from '../keys/autodetect';
import type { KeyManager } from '../keys/types';
import { hashApiKey } from '../lib/api-key-hash';
import { StellarClient, StellarNetwork } from '../stellar/StellarClient';
import { defaultStorage } from '../storage/autodetect';
import type { Storage } from '../storage/types';
import {
  AUTH_ERROR_CODES,
  AuthState,
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
  TransactionState,
  TxBuildBody,
  TxBuildContent,
  TxHistoryParams,
  TxHistoryState,
  TxSignAndSendBody,
  WalletBalanceState,
} from '../types';
import { AlbedoAdapter, FreighterAdapter, WalletAdapter, WalletType } from '../wallets';
import { initEmailSession, sendEmailCode, verifyAndAuthenticate } from './auth/emailFlow';
import { loginOAuth } from './auth/oauthFlow';
import { loginWallet } from './auth/walletFlow';
import {
  readStorage,
  readWalletType,
  removeStorage,
  sessionStorageKey,
  writeStorage,
  writeWalletType
} from './session';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

/** Header marker so retried requests don't loop on persistent 401s. */
const RETRIED_HEADER = 'X-Pollar-Retried';

function warnServerSide(method: string): void {
  console.warn(
    `[PollarClient] ${method}() called server-side — browser APIs unavailable. Use PollarClient only in Client Components.`,
  );
}

export class PollarClient {
  readonly apiKey: string;
  readonly apiKeyHash: string;
  readonly id: string;
  readonly basePath: string;

  private readonly _api: PollarApiClient;
  private readonly _storage: Storage;
  private readonly _keyManager: KeyManager;
  /** Resolves once `keyManager.init()` and the initial session restore complete. */
  private readonly _initialized: Promise<void>;

  private _session: PollarPersistedSession | null = null;
  private _profile: PollarUserProfile | null = null;
  /** Last `DPoP-Nonce` we saw from a server response. Carried into the next proof. */
  private _dpopNonce: string | null = null;
  /** Singleton in-flight refresh — concurrent 401s coalesce into one /auth/refresh call. */
  private _refreshPromise: Promise<void> | null = null;
  private _storageEventHandler: ((e: StorageEvent) => void) | null = null;

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

  private _walletAdapter: WalletAdapter | null = null;
  private _loginController: AbortController | null = null;

  constructor(config: PollarClientConfig) {
    this.apiKey = config.apiKey;
    this.apiKeyHash = hashApiKey(config.apiKey);
    this.id = crypto.randomUUID();
    this.basePath = `${config.baseUrl || 'https://sdk.api.pollar.xyz'}/v1`;

    this._storage =
      config.storage ?? defaultStorage(config.onStorageDegrade ? { onDegrade: config.onStorageDegrade } : undefined);
    this._keyManager = config.keyManager ?? defaultKeyManager(this._storage, this.apiKeyHash);

    this._api = createApiClient(this.basePath);
    this._wireMiddlewares();

    this._networkState = { step: 'connected', network: config.stellarNetwork ?? 'testnet' };

    if (!isBrowser) {
      warnServerSide('constructor');
      this._initialized = Promise.resolve();
      return;
    }

    console.info(`[PollarClient] Initialized — endpoint: ${this.basePath}, network: ${this._networkState.network}`);

    this._initialized = this._initialize();

    // Cross-tab session sync. Fires only for localStorage-backed storage; for
    // non-DOM adapters the listener is harmless (events never arrive).
    if (typeof window !== 'undefined') {
      const sessionKey = sessionStorageKey(this.apiKeyHash);
      const handler = (e: StorageEvent): void => {
        if (e.key === sessionKey) {
          this._restoreSession().catch((err) => console.error('[PollarClient] Cross-tab restore failed', err));
        }
      };
      window.addEventListener('storage', handler);
      this._storageEventHandler = handler;
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  private async _initialize(): Promise<void> {
    try {
      await this._keyManager.init();
    } catch (err) {
      console.warn('[PollarClient] KeyManager init failed; DPoP unavailable for this session', err);
    }
    await this._restoreSession();
  }

  /** Detach the cross-tab storage listener and abort any in-flight login. */
  destroy(): void {
    if (this._storageEventHandler && typeof window !== 'undefined') {
      window.removeEventListener('storage', this._storageEventHandler);
      this._storageEventHandler = null;
    }
    this._loginController?.abort();
    this._loginController = null;
  }

  // ─── Middlewares (DPoP + auto-refresh) ────────────────────────────────────

  private _wireMiddlewares(): void {
    const self = this;
    this._api.use({
      onRequest: async ({ request }: { request: Request }) => {
        request.headers.set('x-pollar-api-key', self.apiKey);
        await self._initialized;
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
        if (request.headers.get(RETRIED_HEADER)) return response;
        // Don't trigger refresh from inside the refresh endpoint itself.
        if (request.url.includes('/auth/refresh')) return response;

        const wwwAuth = response.headers.get('WWW-Authenticate') ?? '';
        const isNonceChallenge = wwwAuth.includes('use_dpop_nonce');

        if (!isNonceChallenge) {
          try {
            await self.refresh();
          } catch {
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
    const clone = originalRequest.clone();
    clone.headers.set(RETRIED_HEADER, '1');
    const accessToken = this._session?.token?.accessToken;
    if (accessToken) {
      const proof = await this._buildProofForRequest(clone, accessToken);
      if (proof) {
        clone.headers.set('Authorization', `DPoP ${accessToken}`);
        clone.headers.set('DPoP', proof);
      } else {
        clone.headers.set('Authorization', `Bearer ${accessToken}`);
      }
    }
    return fetch(clone);
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
      await this._clearSession();
      throw new Error('No refresh token available');
    }

    const { data, error } = await this._api.POST('/auth/refresh', { body: { refreshToken } });

    if (error || !data) {
      await this._clearSession();
      throw new Error('Refresh failed');
    }
    const successData = data as { success?: boolean; content?: { token?: PollarPersistedSession['token'] } };
    if (!successData.success || !successData.content?.token) {
      await this._clearSession();
      throw new Error('Refresh response malformed');
    }

    const newToken = successData.content.token;
    if (
      typeof newToken.accessToken !== 'string' ||
      typeof newToken.refreshToken !== 'string' ||
      typeof newToken.expiresAt !== 'number'
    ) {
      await this._clearSession();
      throw new Error('Refresh response token shape invalid');
    }

    if (this._session) {
      this._session = { ...this._session, token: newToken };
      await writeStorage(this._storage, this.apiKeyHash, this._session);
      console.info('[PollarClient] Tokens refreshed');
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

  /** PII (email, names, avatar, providers). Held in memory only — never persisted. */
  getUserProfile(): PollarUserProfile | null {
    return this._profile;
  }

  // ─── Login (unified entry point) ─────────────────────────────────────────

  login(options: PollarLoginOptions): void {
    if (!isBrowser) {
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
    if (!isBrowser) {
      warnServerSide('beginEmailLogin');
      return;
    }
    const controller = this._newController();
    initEmailSession(this._flowDeps(controller.signal)).catch((err) => this._handleFlowError(err));
  }

  sendEmailCode(email: string): void {
    if (!isBrowser) {
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
    if (!isBrowser) {
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

  loginWallet(type: WalletType): void {
    if (!isBrowser) {
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

  logout(): void {
    if (!isBrowser) {
      warnServerSide('logout');
      return;
    }
    console.info('[PollarClient] Logout requested');
    this._clearSession().catch((err) => console.warn('[PollarClient] Logout cleanup failed', err));
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

  async buildTx(
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ): Promise<void> {
    if (!this._session?.wallet?.publicKey) {
      this._setTransactionState({ step: 'error', details: 'No wallet connected' });
      return;
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
      } else {
        const details = (error as { details?: string } | undefined)?.details;
        this._setTransactionState({ step: 'error', ...(details && { details }) });
      }
    } catch {
      this._setTransactionState({ step: 'error' });
    }
  }

  getWalletType(): WalletType | null {
    return this._walletAdapter?.type ?? null;
  }

  async signAndSubmitTx(unsignedXdr: string): Promise<void> {
    const state = this._transactionState;
    const buildData = state?.step === 'built' ? state.buildData : state?.step === 'error' ? state.buildData : undefined;
    const isBuiltFlow = !!buildData;
    const stateExtra: { buildData?: TxBuildContent; external?: true } = buildData ? { buildData } : { external: true };

    this._setTransactionState({ step: 'signing', ...stateExtra });

    // For both external + custodial wallets, the public key in `_session.wallet`
    // IS the address we want to sign for. The previous code branched on
    // `data.providers.wallet.address` but that's the same value (the wallet
    // address from login becomes wallet.publicKey).
    const accountToSign = this._session?.wallet?.publicKey;

    if (this._walletAdapter) {
      try {
        const signOpts = accountToSign
          ? { networkPassphrase: this._networkPassphrase(), accountToSign }
          : { networkPassphrase: this._networkPassphrase() };
        const { signedTxXdr } = await this._walletAdapter.signTransaction(unsignedXdr, signOpts);
        const stellarClient = new StellarClient(this.getNetwork());
        const result = await stellarClient.submitTransaction(signedTxXdr);
        if (result.success) {
          this._setTransactionState({ step: 'success', ...stateExtra, hash: result.hash });
        } else {
          this._setTransactionState({ step: 'error', ...stateExtra, details: result.errorCode });
        }
      } catch {
        this._setTransactionState({ step: 'error', ...stateExtra });
      }
      return;
    }

    const body: TxSignAndSendBody = {
      network: this.getNetwork(),
      publicKey: this._session?.wallet?.publicKey ?? '',
      unsignedXdr,
    };
    try {
      const { data, error } = await this._api.POST('/tx/sign-and-send', { body });
      if (!error && data?.success && data.content?.hash) {
        this._setTransactionState({ step: 'success', ...stateExtra, hash: data.content.hash });
      } else {
        const details = (error as { details?: string } | undefined)?.details;
        this._setTransactionState({ step: 'error', ...stateExtra, ...(details && { details }) });
      }
    } catch {
      this._setTransactionState({ step: 'error', ...stateExtra });
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
      signal,
      setAuthState: this._setAuthState.bind(this),
      storeSession: this._storeSession.bind(this),
      clearSession: this._clearSession.bind(this),
      getPublicJwk: () => this._keyManager.getPublicJwk(),
      storeWalletAdapter: async (adapter: WalletAdapter, type: WalletType) => {
        this._walletAdapter = adapter;
        await writeWalletType(this._storage, this.apiKeyHash, type);
      },
    };
  }

  private _handleFlowError(error: unknown): void {
    if (error instanceof Error && error.name === 'AbortError') {
      console.info('[PollarClient] Login cancelled');
      this._setAuthState({ step: 'idle' });
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
      this._authState = { step: 'authenticated', session: this._session };
      const storedType = await readWalletType(this._storage, this.apiKeyHash);
      if (storedType === WalletType.FREIGHTER) this._walletAdapter = new FreighterAdapter();
      else if (storedType === WalletType.ALBEDO) this._walletAdapter = new AlbedoAdapter();
      console.info('[PollarClient] Session restored from storage');
    } else {
      console.info('[PollarClient] No session in storage');
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
    this._setAuthState({ step: 'authenticated', session: persisted });
  }

  private async _clearSession(): Promise<void> {
    console.info('[PollarClient] Session cleared');
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
}
