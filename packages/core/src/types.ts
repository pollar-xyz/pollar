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

export type SubmitTxResult =
  | { success: true; hash: string; status: 'PENDING' | 'SUCCESS' | 'FAILED'; resultCode?: string; message?: string }
  | { success: false; error: string };

export type TxBuildResponse = pollarPaths['/tx/build']['post']['responses'][200]['content']['application/json'];
export type TxBuildBody = NonNullable<pollarPaths['/tx/build']['post']['requestBody']>['content']['application/json'];
export type TxBuildResponseError = pollarPaths['/tx/build']['post']['responses'][
  | 400
  | 401
  | 502]['content']['application/json'];

export type PollarLoginOptions =
  | { provider: 'google' }
  | { provider: 'github' }
  | { provider: 'email'; email: string }
  | { provider: 'wallet'; type: WalletType };

type AuthenticationCodes = (typeof STATE_VAR_CODES)[typeof PollarStateVar.AUTHENTICATION];
export type StateAuthenticationCodes =
  AuthenticationCodes[keyof (typeof STATE_VAR_CODES)[typeof PollarStateVar.AUTHENTICATION]];

type TransactionCodes = (typeof STATE_VAR_CODES)[typeof PollarStateVar.TRANSACTION];
export type StateTransactionCodes = TransactionCodes[keyof (typeof STATE_VAR_CODES)[typeof PollarStateVar.TRANSACTION]];

export type StateVarCodes = StateAuthenticationCodes | StateTransactionCodes;

export interface PollarStateEntry {
  var: PollarStateVar;
  code: StateVarCodes;
  status: StateStatus;
  level: 'info' | 'warn' | 'error';
  data?: unknown;
  ts: number;
}

export type PollarState = { [key in PollarStateVar]: PollarStateEntry[] };
