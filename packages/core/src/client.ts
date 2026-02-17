import type { AuthSession, LoginOptions, PollarClientConfig } from './types';

const STORAGE_KEY = 'pollar:session';

export class PollarClient {
  readonly config: PollarClientConfig;
  readonly id: string;
  readonly basePath: string;
  
  private _session: AuthSession | null;
  private _listeners = new Set<(session: AuthSession | null) => void>();
  
  constructor(config: PollarClientConfig) {
    this.config = config;
    this.id = crypto.randomUUID();
    this.basePath = `${config.baseUrl}/v1`;
    
    this._session = this._readStorage();
    
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        this._session = this._readStorage();
      }
    });
  }
  
  getSession(): AuthSession | null {
    return this._session;
  }
  
  onSessionChange(cb: (session: AuthSession | null) => void): () => void {
    this._listeners.add(cb);
    this._notify();
    return () => this._listeners.delete(cb);
  }
  
  async logout(): Promise<void> {
    if (!this._session) return;
    
    await this._fetch('/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this._session.token.refreshToken }),
    });
    
    this._clearSession();
  }
  
  async login(options: LoginOptions): Promise<void> {
    const url = new URL(`${this.basePath}/auth/${options.provider}`);
    url.searchParams.set('api_key', this.config.apiKey);
    url.searchParams.set('client_token', this.id);
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
    
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval);
          resolve();
        }
      }, 500);
    });
    
    const res = await this._fetch(`/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientToken: this.id }),
    });
    
    if (!res.ok) throw new Error('Login failed');
    
    const session = (await res.json()) as { content: AuthSession };
    console.log({ session });
    if (this._isValidSession(session?.content)) {
      this._storeSession(session.content);
    } else {
      this._clearSession();
    }
  }
  
  private _readStorage(): AuthSession | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    console.log({ raw });
    if (!raw) return null;
    
    try {
      const session = JSON.parse(raw) as unknown;
      
      if (!this._isValidSession(session)) {
        localStorage.removeItem(STORAGE_KEY);
        console.warn('Token not valid');
        return null;
      }
      
      if (session.token.expiresAt * 1000 < Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        console.warn(`Token expired: ${session.token.expiresAt}`);
        return null;
      }
      
      return session;
    } catch (error) {
      console.error(error);
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
  
  private _isValidSession(value: unknown): value is AuthSession {
    if (typeof value !== 'object' || value === null) {
      console.warn('[_isValidSession] value is not an object:', value);
      return false;
    }
    
    const s = value as Record<string, unknown>;
    
    const user = s['user'];
    if (typeof user !== 'object' || user === null) {
      console.warn('[_isValidSession] user is missing or not an object:', user);
      return false;
    }
    const u = user as Record<string, unknown>;
    if (typeof u['id'] !== 'string' || u['id'] === '') {
      console.warn('[_isValidSession] user.id is missing or empty:', u['id']);
      return false;
    }
    
    const token = s['token'];
    if (typeof token !== 'object' || token === null) {
      console.warn('[_isValidSession] token is missing or not an object:', token);
      return false;
    }
    const t = token as Record<string, unknown>;
    if (typeof t['accessToken'] !== 'string' || t['accessToken'] === '') {
      console.warn('[_isValidSession] token.accessToken is missing or empty:', t['accessToken']);
      return false;
    }
    if (typeof t['refreshToken'] !== 'string' || t['refreshToken'] === '') {
      console.warn('[_isValidSession] token.refreshToken is missing or empty:', t['refreshToken']);
      return false;
    }
    if (typeof t['expiresAt'] !== 'number' || !Number.isFinite(t['expiresAt'])) {
      console.warn('[_isValidSession] token.expiresAt is missing or not a finite number:', t['expiresAt']);
      return false;
    }
    
    const wallet = s['wallet'];
    if (typeof wallet !== 'object' || wallet === null) {
      console.warn('[_isValidSession] wallet is missing or not an object:', wallet);
      return false;
    }
    const w = wallet as Record<string, unknown>;
    if (w['publicKey'] !== null && typeof w['publicKey'] !== 'string') {
      console.warn('[_isValidSession] wallet.publicKey is neither null nor a string:', w['publicKey']);
      return false;
    }
    
    return true;
  }
  
  private _storeSession(session: AuthSession): void {
    this._session = session;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this._notify();
  }
  
  private _clearSession(): void {
    this._session = null;
    localStorage.removeItem(STORAGE_KEY);
    this._notify();
  }
  
  private _notify(): void {
    for (const cb of this._listeners) cb(this._session);
  }
  
  private _fetch(path: string, init: RequestInit = {}): Promise<Response> {
    return globalThis.fetch(`${this.basePath}${path}`, {
      ...init,
      headers: {
        'x-polo-api-key': this.config.apiKey,
        ...init.headers,
      },
    });
  }
}
