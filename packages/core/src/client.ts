import type { AuthSession, LoginOptions, PollarClientConfig, PollarState, Status } from './types';
import { PollarError } from './types';
import { AlbedoAdapter, FreighterAdapter, WalletType } from './wallets';

const STORAGE_KEY = 'pollar:session';

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

  private _session: AuthSession | null;
  private _status: Status = 'unauthenticated';
  private _stateListeners = new Set<(state: PollarState) => void>();

  constructor(config: PollarClientConfig) {
    this.config = config;
    this.id = crypto.randomUUID();
    this.basePath = `${config.baseUrl}/v1`;

    if (!isBrowser) {
      warnServerSide('constructor');
      this._session = null;
      return;
    }

    this._session = this._readStorage();
    if (this._session) {
      this._emit('restored');
    }

    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        this._session = this._readStorage();
        this._emit(this._session ? 'restored' : 'unauthenticated');
      }
    });
  }

  getState(): PollarState {
    return { session: this._session, status: this._status };
  }

  onStateChange(cb: (state: PollarState) => void): () => void {
    this._stateListeners.add(cb);
    cb(this.getState());
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
      throw new PollarError(
        type === WalletType.FREIGHTER ? 'FREIGHTER_NOT_INSTALLED' : 'WALLET_NOT_AVAILABLE',
      );
    }

    const { publicKey } = await adapter.connect();

    this._emit('logging_in');
    const res = await this._fetch(`/auth/login-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: publicKey, clientId: this.id }),
    });

    const session = (await res.json()) as { content: AuthSession };
    if (this._isValidSession(session?.content)) {
      this._storeSession(session.content);
      this._emit('authenticated');
    } else {
      this._clearSession();
    }
  }

  async logout(): Promise<void> {
    if (!isBrowser) {
      warnServerSide('logout');
      return;
    }
    if (!this._session) {
      return;
    }

    // await this._fetch('/auth/logout', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ refreshToken: this._session.token.refreshToken }),
    // });

    this._clearSession();
  }

  async login(options: LoginOptions): Promise<void> {
    if (!isBrowser) {
      warnServerSide('login');
      return;
    }
    const url = new URL(`${this.basePath}/auth/${options.provider}`);
    url.searchParams.set('api_key', this.config.apiKey);
    url.searchParams.set('client_id', this.id);
    url.searchParams.set('redirect_uri', window.location.origin);

    switch (options.provider) {
      case 'email': {
        url.searchParams.set('email', options.email);
        break;
      }
      case 'google': {
        break;
      }
      case 'github': {
        // TODO: implement
        throw new Error('GitHub login not implemented yet');
      }
    }

    const popup = window.open(url.toString(), '_blank');

    this._emit('awaiting_auth');
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval);
          resolve();
        }
      }, 500);
    });

    this._emit('logging_in');
    const res = await this._fetch(`/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: this.id }),
    });

    const session = (await res.json()) as { content: AuthSession };
    console.log('[PollarClient]', { session });
    if (this._isValidSession(session?.content)) {
      this._storeSession(session.content);
      this._emit('authenticated');
    } else {
      this._clearSession();
    }
  }

  private _readStorage(): AuthSession | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const session = JSON.parse(raw) as unknown;

      if (!this._isValidSession(session)) {
        localStorage.removeItem(STORAGE_KEY);
        console.warn('[PollarClient] Token not valid');
        return null;
      }

      if (session.token.expiresAt * 1000 < Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        console.warn(`[PollarClient] Token expired: ${session.token.expiresAt}`);
        return null;
      }

      return session;
    } catch (error) {
      console.error('[PollarClient]', error);
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  private _isValidSession(value: unknown): value is AuthSession {
    if (typeof value !== 'object' || value === null) {
      console.warn('[PollarClient][_isValidSession] value is not an object:', value);
      return false;
    }

    const s = value as Record<string, unknown>;

    const user = s['user'];
    if (typeof user !== 'object' || user === null) {
      console.warn('[PollarClient][_isValidSession] user is missing or not an object:', user);
      return false;
    }
    const u = user as Record<string, unknown>;
    if (typeof u['id'] !== 'string' || u['id'] === '') {
      console.warn('[PollarClient][_isValidSession] user.id is missing or empty:', u['id']);
      return false;
    }

    const token = s['token'];
    if (typeof token !== 'object' || token === null) {
      console.warn('[PollarClient][_isValidSession] token is missing or not an object:', token);
      return false;
    }
    const t = token as Record<string, unknown>;
    if (typeof t['accessToken'] !== 'string' || t['accessToken'] === '') {
      console.warn(
        '[PollarClient][_isValidSession] token.accessToken is missing or empty:',
        t['accessToken'],
      );
      return false;
    }
    if (typeof t['refreshToken'] !== 'string' || t['refreshToken'] === '') {
      console.warn(
        '[PollarClient][_isValidSession] token.refreshToken is missing or empty:',
        t['refreshToken'],
      );
      return false;
    }
    if (typeof t['expiresAt'] !== 'number' || !Number.isFinite(t['expiresAt'])) {
      console.warn(
        '[PollarClient][_isValidSession] token.expiresAt is missing or not a finite number:',
        t['expiresAt'],
      );
      return false;
    }

    const wallet = s['wallet'];
    if (typeof wallet !== 'object' || wallet === null) {
      console.warn('[PollarClient][_isValidSession] wallet is missing or not an object:', wallet);
      return false;
    }
    const w = wallet as Record<string, unknown>;
    if (w['publicKey'] !== null && typeof w['publicKey'] !== 'string') {
      console.warn(
        '[PollarClient][_isValidSession] wallet.publicKey is neither null nor a string:',
        w['publicKey'],
      );
      return false;
    }

    return true;
  }

  private _storeSession(session: AuthSession): void {
    this._session = session;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  private _clearSession(): void {
    this._session = null;
    localStorage.removeItem(STORAGE_KEY);
    this._emit('unauthenticated');
  }

  private _emit(status: Status): void {
    this._status = status;
    const state = this.getState();
    for (const cb of this._stateListeners) cb(state);
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
