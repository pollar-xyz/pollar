import { PollarStateVar, STATE_VAR_CODES, StateStatus } from './constants';
import { pollarPaths, StellarNetwork } from './index';
import { WalletType } from './wallets';

export type PollarApplicationConfigResponse =
  pollarPaths['/auth/login']['post']['responses'][200]['content']['application/json'];
export type PollarApplicationConfigContent = PollarApplicationConfigResponse['content'];

export interface PollarClientConfig {
  stellarNetwork?: StellarNetwork;
  baseUrl?: string;
  apiKey: string;
}

export type TxBuildBody = NonNullable<pollarPaths['/tx/build']['post']['requestBody']>['content']['application/json'];
export type TxBuildResponse = pollarPaths['/tx/build']['post']['responses'][200]['content']['application/json'];

export type TxSignAndSendBody = NonNullable<
  pollarPaths['/tx/sign-and-send']['post']['requestBody']
>['content']['application/json'];
export type TxSignSendResponse = pollarPaths['/tx/sign-and-send']['post']['responses'][200]['content']['application/json'];

export type PollarLoginOptions =
  | { provider: 'google' }
  | { provider: 'github' }
  | { provider: 'email'; email: string }
  | { provider: 'wallet'; type: WalletType };

type NetworkCodes = (typeof STATE_VAR_CODES)[typeof PollarStateVar.NETWORK];
export type StateNetworkCodes = NetworkCodes[keyof (typeof STATE_VAR_CODES)[typeof PollarStateVar.NETWORK]];

type TransactionCodes = (typeof STATE_VAR_CODES)[typeof PollarStateVar.TRANSACTION];
export type StateTransactionCodes = TransactionCodes[keyof (typeof STATE_VAR_CODES)[typeof PollarStateVar.TRANSACTION]];

export type StateVarCodes = StateNetworkCodes | StateTransactionCodes;

export interface PollarStateEntry {
  var: PollarStateVar;
  code: StateVarCodes;
  status: StateStatus;
  level: 'info' | 'warn' | 'error';
  data?: unknown;
  ts: number;
}

export type PollarState = { [key in PollarStateVar]: PollarStateEntry[] };

export const AUTH_ERROR_CODES = {
  SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  EMAIL_VERIFY_FAILED: 'EMAIL_VERIFY_FAILED',
  EMAIL_CODE_EXPIRED: 'EMAIL_CODE_EXPIRED',
  EMAIL_CODE_INVALID: 'EMAIL_CODE_INVALID',
  AUTH_FAILED: 'AUTH_FAILED',
  WALLET_CONNECT_FAILED: 'WALLET_CONNECT_FAILED',
  WALLET_AUTH_FAILED: 'WALLET_AUTH_FAILED',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export type AuthState =
  | { step: 'idle' }
  | { step: 'creating_session' }
  | { step: 'entering_email'; clientSessionId: string }
  | { step: 'sending_email'; email: string }
  | { step: 'entering_code'; clientSessionId: string; email: string }
  | { step: 'verifying_email_code'; clientSessionId: string; email: string }
  | { step: 'opening_oauth'; provider: 'google' | 'github' }
  | { step: 'connecting_wallet'; walletType: WalletType }
  | { step: 'wallet_not_installed'; walletType: WalletType }
  | { step: 'authenticating_wallet' }
  | { step: 'authenticating' }
  | { step: 'authenticated'; session: PollarApplicationConfigContent }
  | { step: 'error'; previousStep: string; message: string; errorCode: AuthErrorCode; clientSessionId?: string; email?: string };

export class PollarFlowError extends Error {
  readonly code = 'INVALID_FLOW' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PollarFlowError';
  }
}