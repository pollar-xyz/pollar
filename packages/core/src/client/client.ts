import { createApiClient, PollarApiClient } from '../api/client';
import { PollarStateVar, STATE_VAR_CODES, StateStatus } from '../constants';
import {
  AUTH_ERROR_CODES,
  AuthState,
  PollarApplicationConfigContent,
  PollarClientConfig,
  PollarFlowError,
  PollarLoginOptions,
  PollarState,
  PollarStateEntry,
  StateVarCodes,
  TxBuildBody,
  TxSignAndSendBody,
} from '../types';
import { WalletType } from '../wallets';
import { initEmailSession, sendEmailCode, verifyAndAuthenticate } from './auth/emailFlow';
import { loginOAuth } from './auth/oauthFlow';
import { loginWallet } from './auth/walletFlow';
import { emitResponse } from './helpers';
import { readStorage, removeStorage, STORAGE_KEY, writeStorage } from './session';

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
  private _stateListeners = new Set<(log: PollarStateEntry) => void>();
  private _state: PollarState = {
    network: [],
    transaction: [],
  };

  private _authState: AuthState = { step: 'idle' };
  private _authStateListeners = new Set<(state: AuthState) => void>();
  private _loginController: AbortController | null = null;

  constructor(config: PollarClientConfig) {
    this.apiKey = config.apiKey;
    this.id = crypto.randomUUID();
    this.basePath = `${config.baseUrl || 'https://sdk.api.pollar.xyz'}/v1`;
    this._api = createApiClient(this.basePath);
    this._api.use({
      onRequest({ request }: { request: Request }) {
        request.headers.set('x-pollar-api-key', config.apiKey);
        return request;
      },
    });

    if (!isBrowser) {
      warnServerSide('constructor');
      this._session = null;
      return;
    }

    console.info(`[PollarClient] Initialized — endpoint: ${this.basePath}`);

    this._readStore();

    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const prev = this._session;
        console.info(`[PollarClient] Storage event — session ${this._session ? 'updated' : prev ? 'cleared' : 'unchanged'}`);
        this._readStore();
      }
    });

    this._emitState('network', STATE_VAR_CODES.network.NETWORK_UPDATED, 'info', StateStatus.SUCCESS, {
      network: 'testnet',
    });
  }

  // ─── Auth state ──────────────────────────────────────────────────────────────

  isAuthenticated(): boolean {
    return !!this._session?.wallet?.publicKey;
  }

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

    if (options.provider === 'google' || options.provider === 'github') {
      this.loginOAuth(options.provider);
    } else if (options.provider === 'email') {
      const { email } = options;
      const controller = this._newController();
      const deps = this._flowDeps(controller.signal);
      initEmailSession(deps)
        .then(() => {
          if (this._authState.step === 'entering_email') {
            return sendEmailCode(email, this._authState.clientSessionId, deps);
          }
        })
        .catch((err) => this._handleFlowError(err));
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

  // ─── OAuth flow (single call) ─────────────────────────────────────────────

  loginOAuth(provider: 'google' | 'github'): void {
    if (!isBrowser) {
      warnServerSide('loginOAuth');
      return;
    }

    const controller = this._newController();

    loginOAuth(provider, {
      ...this._flowDeps(controller.signal),
      basePath: this.basePath,
      apiKey: this.apiKey,
    }).catch((err) => this._handleFlowError(err));
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

  // ─── General state (network / transaction) ────────────────────────────────

  getApi(): PollarApiClient {
    return this._api;
  }

  getNetwork() {
    return (this._state.network.at(-1)?.data as { network: string })?.network === 'public' ? 'public' : 'testnet';
  }

  onStateChange(cb: (state: PollarStateEntry) => void): () => void {
    this._stateListeners.add(cb);
    for (const [, stateEntry] of Object.entries(this._state)) {
      if (stateEntry.length >= 1) cb(stateEntry.at(-1)!);
    }
    return () => this._stateListeners.delete(cb);
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  async buildTx(
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ): Promise<void> {
    if (!this._session?.wallet?.publicKey) {
      this._emitState('transaction', STATE_VAR_CODES.transaction.BUILD_TRANSACTION_ERROR_NO_WALLET, 'error', StateStatus.ERROR);
      return;
    }

    const body: TxBuildBody = {
      network: this.getNetwork(),
      publicKey: this._session.wallet.publicKey,
      operation,
      params,
      options: options || {},
    };

    try {
      this._emitState('transaction', STATE_VAR_CODES.transaction.BUILD_TRANSACTION_START, 'info', StateStatus.LOADING);
      const response = await this._api.POST('/tx/build', { body });
      emitResponse(
        PollarStateVar.TRANSACTION,
        response,
        { code: STATE_VAR_CODES.transaction.BUILD_TRANSACTION_SUCCESS, status: StateStatus.SUCCESS },
        STATE_VAR_CODES.transaction.BUILD_TRANSACTION_ERROR,
        this._emitState.bind(this),
      );
    } catch (error) {
      this._emitState('transaction', STATE_VAR_CODES.transaction.BUILD_TRANSACTION_ERROR, 'error', StateStatus.ERROR, {
        error,
      });
    }
  }

  async submitTx(signedXdr: string): Promise<void> {
    const body: TxSignAndSendBody = { network: this.getNetwork(), signedXdr };

    try {
      this._emitState('transaction', STATE_VAR_CODES.transaction.SIGN_SEND_TRANSACTION_START, 'info', StateStatus.LOADING);
      const response = await this._api.POST('/tx/sign-and-send', { body });
      emitResponse(
        PollarStateVar.TRANSACTION,
        response,
        { code: STATE_VAR_CODES.transaction.SIGN_SEND_TRANSACTION_SUCCESS, status: StateStatus.SUCCESS },
        STATE_VAR_CODES.transaction.SIGN_SEND_TRANSACTION_ERROR,
        this._emitState.bind(this),
      );
    } catch (error) {
      this._emitState('transaction', STATE_VAR_CODES.transaction.SIGN_SEND_TRANSACTION_ERROR, 'error', StateStatus.ERROR, {
        error,
      });
    }
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

  private _readStore(): void {
    this._session = readStorage();
    if (this._session) {
      this._authState = { step: 'authenticated', session: this._session };
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
    removeStorage();
    this._state = { network: [], transaction: [] };
    this._setAuthState({ step: 'idle' });
  }

  private _setAuthState(next: AuthState): void {
    this._authState = next;
    console.info(`[PollarClient] auth:${next.step}`);
    for (const cb of this._authStateListeners) cb(next);
  }

  private _emitState(
    fn: PollarStateVar,
    code: StateVarCodes,
    level: PollarStateEntry['level'],
    status: PollarStateEntry['status'],
    data?: unknown,
  ): void {
    const stateEntry: PollarStateEntry = { var: fn, code, level, data, status, ts: Date.now() };
    this._state[fn].push(stateEntry);
    console[level](`[PollarClient] ${fn}:${code} — ${status}`);
    for (const cb of this._stateListeners) cb(stateEntry);
  }
}
