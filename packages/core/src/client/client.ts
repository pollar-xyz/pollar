import { createApiClient, PollarApiClient } from '../api/client';
import { getKycProviders, getKycStatus, pollKycStatus, resolveKyc, startKyc } from '../api/endpoints/kyc';
import {
  createOffRamp,
  createOnRamp,
  getRampsQuote,
  getRampTransaction,
  pollRampTransaction
} from '../api/endpoints/ramps';
import { StellarClient, StellarNetwork } from '../stellar/StellarClient';
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
  TxHistoryParams,
  TxHistoryState,
  TxBuildContent,
  TxSignAndSendBody,
  WalletBalanceContent,
} from '../types';
import { AlbedoAdapter, FreighterAdapter, WalletAdapter, WalletType } from '../wallets';
import { initEmailSession, sendEmailCode, verifyAndAuthenticate } from './auth/emailFlow';
import { loginOAuth } from './auth/oauthFlow';
import { loginWallet } from './auth/walletFlow';
import { readStorage, readWalletType, removeStorage, STORAGE_KEY, writeStorage, writeWalletType } from './session';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

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

  private _session: PollarApplicationConfigContent | null = null;

  private _transactionState: TransactionState | null = null;
  private _transactionStateListeners = new Set<(state: TransactionState) => void>();
  private _txHistoryState: TxHistoryState = { step: 'idle' };
  private _txHistoryStateListeners = new Set<(state: TxHistoryState) => void>();
  private _authState: AuthState = { step: 'idle' };
  private _authStateListeners = new Set<(state: AuthState) => void>();
  private _networkState: NetworkState = { step: 'idle' };
  private _networkStateListeners = new Set<(state: NetworkState) => void>();

  private _walletAdapter: WalletAdapter | null = null;
  private _loginController: AbortController | null = null;

  constructor(config: PollarClientConfig) {
    this.apiKey = config.apiKey;
    this.id = crypto.randomUUID();
    this.basePath = `${config.baseUrl || 'https://sdk.api.pollar.xyz'}/v1`;
    this._api = createApiClient(this.basePath);
    const self = this;
    this._api.use({
      onRequest({ request }: { request: Request }) {
        request.headers.set('x-pollar-api-key', config.apiKey);
        const accessToken = self._session?.token?.accessToken;
        if (accessToken) {
          request.headers.set('Authorization', `Bearer ${accessToken}`);
        }
        return request;
      },
    });

    this._networkState = { step: 'connected', network: config.stellarNetwork ?? 'testnet' };

    if (!isBrowser) {
      warnServerSide('constructor');
      this._session = null;
      return;
    }

    console.info(`[PollarClient] Initialized — endpoint: ${this.basePath}, network: ${this._networkState.network}`);

    this._restoreSession();

    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const prev = this._session;
        console.info(`[PollarClient] Storage event — session ${this._session ? 'updated' : prev ? 'cleared' : 'unchanged'}`);
        this._restoreSession();
      }
    });
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
    this._clearSession();
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

  private _setTxHistoryState(next: TxHistoryState): void {
    this._txHistoryState = next;
    for (const cb of this._txHistoryStateListeners) cb(next);
  }

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

  async getWalletBalance(publicKey?: string): Promise<WalletBalanceContent | null> {
    const pk = publicKey ?? this._session?.wallet?.publicKey;
    if (!pk) return null;
    const network = this.getNetwork();
    const { data, error } = await this._api.GET('/wallet/balance', { params: { query: { publicKey: pk, network } } });
    if (!error && data?.success && data.content) return data.content;
    return null;
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
    const buildData =
      state?.step === 'built' ? state.buildData :
      state?.step === 'error' ? state.buildData :
      undefined;
    const isBuiltFlow = !!buildData;
    const stateExtra: { buildData?: TxBuildContent; external?: true } = buildData ? { buildData } : { external: true };

    this._setTransactionState({ step: 'signing', ...stateExtra });

    const accountToSign = isBuiltFlow
      ? this._session?.wallet?.publicKey
      : (this._session?.data?.providers?.wallet?.address ?? this._session?.wallet?.publicKey);

    if (this._walletAdapter) {
      // External wallet (Freighter/Albedo): sign client-side, submit directly to Horizon
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

    // Custodial wallet (social/email login): Pollar signs and submits server-side
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

  // ─── Private ──────────────────────────────────────────────────────────────

  /** Creates a new AbortController, cancelling any existing flow first. */
  private _newController(): AbortController {
    this._loginController?.abort();
    this._loginController = new AbortController();
    return this._loginController;
  }

  /** Builds the deps object passed to flow functions via bind pattern. */
  private _flowDeps(signal: AbortSignal) {
    return {
      api: this._api,
      signal,
      setAuthState: this._setAuthState.bind(this),
      storeSession: this._storeSession.bind(this),
      clearSession: this._clearSession.bind(this),
      storeWalletAdapter: (adapter: WalletAdapter, type: WalletType) => {
        this._walletAdapter = adapter;
        writeWalletType(type);
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

  private _restoreSession(): void {
    this._session = readStorage();
    if (this._session) {
      this._authState = { step: 'authenticated', session: this._session };
      // Re-instantiate external wallet adapter if user logged in with one
      if (this._session.data?.providers?.wallet?.address) {
        const storedType = readWalletType();
        if (storedType === WalletType.FREIGHTER) {
          this._walletAdapter = new FreighterAdapter();
        } else if (storedType === WalletType.ALBEDO) {
          this._walletAdapter = new AlbedoAdapter();
        }
      }
      console.info('[PollarClient] Session restored from storage');
    } else {
      console.info('[PollarClient] No session in storage');
    }
  }

  private _storeSession(session: PollarApplicationConfigContent): void {
    console.info(`[PollarClient] Session stored — user: ${session.userId ?? 'anonymous'}`);
    this._session = session;
    writeStorage(session);
    this._setAuthState({ step: 'authenticated', session });
  }

  private _clearSession(): void {
    console.info('[PollarClient] Session cleared');
    this._session = null;
    this._walletAdapter = null;
    removeStorage();
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
