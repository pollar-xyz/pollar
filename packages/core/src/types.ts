export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthUser {
  id: string;
}

export interface AuthWallet {
  publicKey: string | null;
}

export interface AuthSession {
  user: AuthUser;
  token: AuthToken;
  wallet: AuthWallet;
}

export interface PollarClientConfig {
  baseUrl: string;
  apiKey: string;
}

export interface AuthError {
  code: string;
  message: string;
}

export type LoginOptions =
  | { provider: 'google' }
  | { provider: 'github' }
  | { provider: 'email'; email: string; };
