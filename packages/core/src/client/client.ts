import { pollarApiClient } from '../api/client';
import {
  LoginOptions,
  PollarClientConfig,
  PollarError,
  PollarLogin,
  PollarState,
  PollarStateEntry,
  STATE_VAR_CODES,
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
  readonly config: PollarClientConfig;
  readonly id: string;
  readonly basePath: string;

  private _session: PollarLogin | null;
  private _status: Status = 'unauthenticated';
  private _stateListeners = new Set<(log: PollarStateEntry) => void>();
  private _state: { [key in StateVar]: PollarStateEntry[] } = {
    [StateVar.LOGIN]: [],
    [StateVar.WALLET_ADDRESS]: [],
  };

  constructor(config: PollarClientConfig) {
    this.config = config;
    this.id = crypto.randomUUID();
    this.basePath = `${config.baseUrl}/v1`;

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

    pollarApiClient.use({
      onRequest({ request }) {
        request.headers.set('x-pollar-api-key', config.apiKey);
        return request;
      },
    });
  }

  getState(): PollarState {
    return { session: this._session, status: this._status };
  }

  async login(options: LoginOptions): Promise<void> {
    if (!isBrowser) {
      warnServerSide('login');
      return;
    }
    return loginFn(options, {
      basePath: this.basePath,
      apiKey: this.config.apiKey,
      clientId: this.id,
      emitState: this._emitState.bind(this),
      storeSession: this._storeSession.bind(this),
      clearSession: this._clearSession.bind(this),
    });
  }

  onStateChange(cb: (state: PollarStateEntry) => void): () => void {
    this._stateListeners.add(cb);
    // cb(this.getState());
    return () => this._stateListeners.delete(cb);
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

  async logout(): Promise<void> {
    if (!isBrowser) {
      warnServerSide('logout');
      return;
    }

    this._clearSession();
  }

  private _storeSession(session: PollarLogin): void {
    this._session = session;
    writeStorage(session);
  }

  private _clearSession(): void {
    this._session = null;
    removeStorage();
    this._emitState(StateVar.WALLET_ADDRESS, STATE_VAR_CODES[StateVar.WALLET_ADDRESS].EMPTY_ADDRESS, 'info');
  }

  private _emitState(fn: StateVar, code: StateVarCodes, level: PollarStateEntry['level'], data?: unknown): void {
    const stateEntry: PollarStateEntry = { var: fn, code, level, data, ts: Date.now() };
    this._state[fn].push(stateEntry);
    console[level]('[PollarClient]', stateEntry);
    for (const cb of this._stateListeners) {
      cb(stateEntry);
    }
  }

  private async _fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await globalThis.fetch(`${this.basePath}${path}`, {
      ...init,
      headers: {
        'x-polo-api-key': this.config.apiKey,
        ...init.headers,
      },
    });

    if (!res.ok) {
      let code = 'UNKNOWN_ERROR';
      try {
        const body = (await res.json()) as { error?: { code?: string } | string; message?: string };
        if (typeof body.error === 'object' && body.error?.code) {
          code = body.error.code;
        } else if (typeof body.error === 'string') {
          code = body.error;
        } else if (typeof body.message === 'string') {
          code = body.message;
        }
      } catch {
        // ignore parse errors
      }
      throw new PollarError(code);
    }

    return res;
  }
}
