import { pollarPaths, StellarNetwork } from './index';
import { WalletType } from './wallets';

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

type ConfigResponse = pollarPaths['/auth/login']['post']['responses'][200]['content']['application/json'];
export type PollarLoginState = ConfigResponse['content'];

export interface PollarClientConfig {
  stellarNetwork?: StellarNetwork;
  baseUrl?: string;
  apiKey: string;
}

export interface AuthError {
  code: string;
  message: string;
}

export class PollarError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'PollarError';
    this.code = code;
  }
}

export type Status = 'unauthenticated' | 'restored' | 'authenticated' | 'awaiting_auth' | 'logging_in';

export interface PollarState {
  session: PollarLoginState | null;
}

export type PollarLoginOptions =
  | { provider: 'google' }
  | { provider: 'github' }
  | { provider: 'email'; email: string }
  | { provider: 'wallet'; type: WalletType };

export const PollarStateVar = {
  WALLET_ADDRESS: 'WALLET_ADDRESS',
  LOGIN: 'LOGIN',
} as const;
export type PollarStateVar = (typeof PollarStateVar)[keyof typeof PollarStateVar];

export const STATE_VAR_CODES = {
  [PollarStateVar.LOGIN]: {
    NONE: 'NONE',
    LOGOUT: 'LOGOUT',
    CREATE_SESSION_START: 'CREATE_SESSION_START',
    CREATE_SESSION_ERROR: 'CREATE_SESSION_ERROR',
    CREATE_SESSION_SUCCESS: 'CREATE_SESSION_SUCCESS',
    EMAIL_AUTH_START: 'EMAIL_AUTH_START',
    EMAIL_AUTH_START_ERROR: 'EMAIL_AUTH_START_ERROR',
    EMAIL_AUTH_START_SUCCESS: 'EMAIL_AUTH_START_SUCCESS',
    EMAIL_AUTH_CODE_ERROR: 'EMAIL_AUTH_CODE_ERROR',
    EMAIL_AUTH_CODE_SUCCESS: 'EMAIL_AUTH_CODE_SUCCESS',
    WALLET_AUTH_START: 'WALLET_AUTH_START',
    WALLET_AUTH_FREIGHTER_NOT_INSTALLED: 'WALLET_AUTH_FREIGHTER_NOT_INSTALLED',
    WALLET_AUTH_ALBEDO_NOT_INSTALLED: 'WALLET_AUTH_ALBEDO_NOT_INSTALLED',
    WALLET_AUTH_CONNECTED: 'WALLET_AUTH_CONNECTED',
    WALLET_AUTH_LOGIN_START: 'WALLET_AUTH_LOGIN_START',
    WALLET_AUTH_LOGIN_START_SUCCESS: 'WALLET_AUTH_LOGIN_START_SUCCESS',
    WALLET_AUTH_LOGIN_START_ERROR: 'WALLET_AUTH_LOGIN_START_ERROR',
    WALLET_AUTH_ERROR: 'WALLET_AUTH_ERROR',
    STREAM_POLL_START: 'STREAM_POLL_START',
    STREAM_POLL_EVENT: 'STREAM_POLL_EVENT',
    STREAM_POLL_READY: 'STREAM_POLL_READY',
    FETCH_SESSION_START: 'FETCH_SESSION_START',
    FETCH_SESSION_SUCCESS: 'FETCH_SESSION_SUCCESS',
    FETCH_SESSION_ERROR: 'FETCH_SESSION_ERROR',
    ERROR_ABORTED: 'ABORTED',
    ERROR_UNKNOWN: 'ERROR_UNKNOWN',
  },
  [PollarStateVar.WALLET_ADDRESS]: {
    NONE: 'NONE',
    REMOVED_ADDRESS: 'REMOVED_ADDRESS',
    UPDATED_ADDRESS: 'UPDATED_ADDRESS',
  },
} as const;

type LoginCodes = (typeof STATE_VAR_CODES)[typeof PollarStateVar.LOGIN];
export type StateLoginCodes = LoginCodes[keyof (typeof STATE_VAR_CODES)[typeof PollarStateVar.LOGIN]];

type WalletAddressCodes = (typeof STATE_VAR_CODES)[typeof PollarStateVar.WALLET_ADDRESS];
export type StateWalletAddressCodes = WalletAddressCodes[keyof (typeof STATE_VAR_CODES)[typeof PollarStateVar.WALLET_ADDRESS]];

export type StateVarCodes = StateLoginCodes | StateWalletAddressCodes;

export const StateStatus = {
  NONE: 'NONE',
  LOADING: 'LOADING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
} as const;
export type StateStatus = (typeof StateStatus)[keyof typeof StateStatus];

export interface PollarStateEntry {
  var: PollarStateVar;
  code: StateVarCodes;
  status: StateStatus;
  level: 'info' | 'warn' | 'error';
  data?: unknown;
  ts: number;
}
