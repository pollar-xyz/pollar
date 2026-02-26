import { createApiClient, PollarApiClient } from '../api/client';
import {
  LoginOptions,
  PollarClientConfig,
  PollarError,
  PollarLoginState,
  PollarState,
  PollarStateEntry,
  STATE_VAR_CODES,
  StateStatus,
  StateVar,
  StateVarCodes,
  Status,
} from '../types';
import { AlbedoAdapter, FreighterAdapter, WalletType } from '../wallets';
import { login as loginFn } from './login';
import { readStorage, removeStorage, STORAGE_KEY, writeStorage } from './session';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

function warnServerSide(method: string): void {
  console.warn(
    `[PollarClient] \`${method}\` was called on the server. ` +
      'PollarClient requires browser APIs (window, localStorage). ' +
      'Make sure to use PollarClient only inside a Client Component.',
  );
}

export class PollarClient {
  readonly apiKey: string;
  readonly id: string;
  readonly basePath: string;

  private readonly _api: PollarApiClient;
  private _session: PollarLoginState | null;
  private _status: Status = 'unauthenticated';
  private _stateListeners = new Set<(log: PollarStateEntry) => void>();
  private _state: { [key in StateVar]: PollarStateEntry[] } = {
    [StateVar.LOGIN]: [],
    [StateVar.WALLET_ADDRESS]: [],
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

    this._session = readStorage();
    if (this._session) {
      // this._emit('restored');
    }

    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        this._session = readStorage();
        // this._emitState(this._session ? 'restored' : 'unauthenticated');
      }
    });
  }

  isAuthenticated(): boolean {
    return !!this._session?.wallet?.publicKey;
  }

  getState(): PollarState {
    return { session: this._session, status: this._status };
  }

  getApi(): PollarApiClient {
    return this._api;
  }

  login(options: LoginOptions): { cancelLogin: () => void } {
    if (!isBrowser) {
      warnServerSide('login');
      return {
        cancelLogin: () => {},
      };
    }

    const controller = new AbortController();

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
        this._emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].ERROR_ABORTED, 'error', StateStatus.ERROR);
        return;
      }
      this._emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].ERROR_UNKNOWN, 'error', StateStatus.ERROR, { error });
    });

    return { cancelLogin: () => controller.abort() };
  }

  onStateChange(cb: (state: PollarStateEntry) => void): () => void {
    this._stateListeners.add(cb);
    // cb(this.getState());
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
      if (error || !data || data?.content?.code !== 'SDK_EMAIL_CODE_VERIFIED') {
        this._emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].EMAIL_AUTH_CODE_ERROR, 'error', StateStatus.ERROR, {
          data,
          error,
        });
        return;
      }

      this._emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].EMAIL_AUTH_CODE_SUCCESS, 'info', StateStatus.SUCCESS, {
        data,
        error,
      });
    } catch (error) {
      this._emitState(
        StateVar.LOGIN,
        STATE_VAR_CODES[StateVar.LOGIN].WALLET_AUTH_ALBEDO_NOT_INSTALLED,
        'error',
        StateStatus.ERROR,
      );
    }
  }

  async connectWallet(type: WalletType): Promise<void> {
    if (!isBrowser) {
      warnServerSide('connectWallet');
      throw new PollarError('SERVER_SIDE');
    }

    const adapter = type === WalletType.FREIGHTER ? new FreighterAdapter() : new AlbedoAdapter();

    const available = await adapter.isAvailable();
    if (!available) {
      throw new PollarError(type === WalletType.FREIGHTER ? 'FREIGHTER_NOT_INSTALLED' : 'WALLET_NOT_AVAILABLE');
    }

    const { publicKey } = await adapter.connect();

    // this._emit('logging_in');
    // const res = await this._fetch(`/auth/login-wallet`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ walletAddress: publicKey, clientId: this.id }),
    // });
    //
    // const session = (await res.json()) as { content: PollarLogin };
    // console.info('[PollarClient]', { session });
    // if (isValidSession(session?.content)) {
    //   this._storeSession(session.content);
    //   this._emit('authenticated');
    // } else {
    //   this._clearSession();
    // }
  }

  logout(): void {
    if (!isBrowser) {
      warnServerSide('logout');
      return;
    }

    this._clearSession();
  }

  private _storeSession(session: PollarLoginState): void {
    this._session = session;
    writeStorage(session);
    this._emitState(
      StateVar.WALLET_ADDRESS,
      STATE_VAR_CODES[StateVar.WALLET_ADDRESS].UPDATED_ADDRESS,
      'info',
      StateStatus.SUCCESS,
      session,
    );
  }

  private _clearSession(): void {
    this._session = null;
    removeStorage();
    this._state = {
      [StateVar.LOGIN]: [],
      [StateVar.WALLET_ADDRESS]: [],
    };
    this._emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].LOGOUT, 'info', StateStatus.NONE);
    this._emitState(
      StateVar.WALLET_ADDRESS,
      STATE_VAR_CODES[StateVar.WALLET_ADDRESS].REMOVED_ADDRESS,
      'info',
      StateStatus.NONE,
    );
  }

  private _emitState(
    fn: StateVar,
    code: StateVarCodes,
    level: PollarStateEntry['level'],
    status: PollarStateEntry['status'],
    data?: unknown,
  ): void {
    const stateEntry: PollarStateEntry = { var: fn, code, level, data, status, ts: Date.now() };
    this._state[fn].push(stateEntry);
    console[level]('[PollarClient]', stateEntry);
    for (const cb of this._stateListeners) {
      cb(stateEntry);
    }
  }
}
