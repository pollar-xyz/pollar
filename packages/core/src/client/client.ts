import { createApiClient, PollarApiClient } from '../api/client';
import { PollarStateVar, STATE_VAR_CODES, StateStatus } from '../constants';
import {
  PollarApplicationConfigContent,
  PollarClientConfig,
  PollarLoginOptions,
  PollarState,
  PollarStateEntry,
  StateVarCodes,
  SubmitTxResult,
  TxBuildBody,
} from '../types';
import { emitResponse } from './helpers';
import { login as loginFn } from './login';
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
    authentication: [],
    transaction: [],
  };

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
  }

  isAuthenticated(): boolean {
    return !!this._session?.wallet?.publicKey;
  }

  getState() {
    return { session: this._session };
  }

  getApi(): PollarApiClient {
    return this._api;
  }

  login(options: PollarLoginOptions): { cancelLogin: () => void } {
    if (!isBrowser) {
      warnServerSide('login');
      return {
        cancelLogin: () => {},
      };
    }

    const controller = new AbortController();

    console.info(`[PollarClient] Login started — provider: ${options.provider}`);

    loginFn(options, {
      api: this._api,
      basePath: this.basePath,
      apiKey: this.apiKey,
      signal: controller.signal,
      emitState: this._emitState.bind(this),
      storeSession: this._storeSession.bind(this),
      clearSession: this._clearSession.bind(this),
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') {
        console.info('[PollarClient] Login aborted by user');
        this._emitState('authentication', STATE_VAR_CODES.authentication.ERROR_ABORTED, 'error', StateStatus.ERROR);
        return;
      }
      console.error('[PollarClient] Login failed with unexpected error', error);
      this._emitState('authentication', STATE_VAR_CODES.authentication.ERROR_UNKNOWN, 'error', StateStatus.ERROR, {
        error,
      });
    });

    return { cancelLogin: () => controller.abort() };
  }

  onStateChange(cb: (state: PollarStateEntry) => void): () => void {
    this._stateListeners.add(cb);
    for (const [, stateEntry] of Object.entries(this._state)) {
      if (stateEntry.length >= 1) {
        cb(stateEntry.at(-1)!);
      }
    }
    return () => this._stateListeners.delete(cb);
  }

  async verifyEmailCode(clientSessionId: string, code: string): Promise<void> {
    if (!isBrowser) {
      warnServerSide('verifyEmailCode');
      return;
    }
    try {
      const { error, data } = await this._api.POST('/auth/email/verify-code', {
        body: { clientSessionId, code },
      });
      if (error || !data || data?.code !== 'SDK_EMAIL_CODE_VERIFIED') {
        this._emitState('authentication', STATE_VAR_CODES.authentication.EMAIL_AUTH_CODE_ERROR, 'error', StateStatus.ERROR, {
          data,
          error,
        });
        return;
      }

      this._emitState('authentication', STATE_VAR_CODES.authentication.EMAIL_AUTH_CODE_SUCCESS, 'info', StateStatus.SUCCESS, {
        data,
        error,
      });
    } catch (error) {
      this._emitState(
        'authentication',
        STATE_VAR_CODES.authentication.WALLET_AUTH_ALBEDO_NOT_INSTALLED,
        'error',
        StateStatus.ERROR,
      );
    }
  }

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
      network: 'testnet',
      publicKey: this._session?.wallet?.publicKey,
      operation,
      params,
      options: options || {},
    };

    try {
      this._emitState('transaction', STATE_VAR_CODES.transaction.BUILD_TRANSACTION_START, 'info', StateStatus.LOADING);

      const response = await this._api.POST('/tx/build', { body });
      console.log({ response });
      if (
        !emitResponse(
          PollarStateVar.TRANSACTION,
          response,
          { code: STATE_VAR_CODES.transaction.BUILD_TRANSACTION_SUCCESS, status: StateStatus.SUCCESS },
          STATE_VAR_CODES.transaction.BUILD_TRANSACTION_ERROR,
          this._emitState.bind(this),
        )
      ) {
        return;
      }
    } catch (error) {
      this._emitState('transaction', STATE_VAR_CODES.transaction.BUILD_TRANSACTION_ERROR, 'error', StateStatus.ERROR, {
        body,
        error,
      });
      return;
    }
  }

  async submitTx(signedXdr: string): Promise<SubmitTxResult> {
    try {
      console.info('[PollarClient] Submitting signed transaction');
      const { data, error } = await (this._api.POST as Function)('/tx/submit', { body: { signedXdr } });
      if (error || !data?.success) {
        const msg = (error as any)?.message ?? data?.error ?? 'Failed to submit transaction';
        console.warn('[PollarClient] submitTx error —', msg);
        return { success: false, error: msg };
      }
      return { success: true, ...data.content };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      console.warn('[PollarClient] submitTx network error —', msg);
      return { success: false, error: msg };
    }
  }

  logout(): void {
    if (!isBrowser) {
      warnServerSide('logout');
      return;
    }

    console.info('[PollarClient] Logout requested');
    this._clearSession();
  }

  private _readStore() {
    this._session = readStorage();
    if (this._session) {
      this._emitState(
        'authentication',
        STATE_VAR_CODES.authentication.RESTORED_SESSION_SUCCESS,
        'info',
        StateStatus.SUCCESS,
        this._session,
      );
      console.info('[PollarClient] Session restored from storage');
    } else {
      this._emitState('authentication', STATE_VAR_CODES.authentication.RESTORED_SESSION_SUCCESS, 'warn', StateStatus.ERROR);
      console.info('[PollarClient] Session NO restored from storage');
    }
  }

  private _storeSession(session: PollarApplicationConfigContent): void {
    console.info(`[PollarClient] Session stored — user: ${session.userId ?? 'anonymous'}`);
    this._session = session;
    writeStorage(session);
    this._emitState(
      'authentication',
      STATE_VAR_CODES.authentication.SESSION_STORED,
      'info',
      StateStatus.SUCCESS,
      this._session,
    );
  }

  private _clearSession(): void {
    console.info('[PollarClient] Session cleared');
    this._session = null;
    removeStorage();
    this._state = {
      authentication: [],
      transaction: [],
    };
    this._emitState('authentication', STATE_VAR_CODES.authentication.LOGOUT, 'info', StateStatus.NONE);
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
    for (const cb of this._stateListeners) {
      cb(stateEntry);
    }
  }
}
