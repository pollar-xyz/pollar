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

export type TxBuildContent = TxBuildResponse['content'];

export type TransactionState =
  | { step: 'idle' }
  | { step: 'building' }
  | { step: 'built'; buildData: TxBuildContent }
  | { step: 'signing'; buildData?: TxBuildContent; external?: true }
  | { step: 'success'; buildData?: TxBuildContent; hash: string; external?: true }
  | { step: 'error'; details?: string; buildData?: TxBuildContent; external?: true };

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
  | {
      step: 'error';
      previousStep: string;
      message: string;
      errorCode: AuthErrorCode;
      clientSessionId?: string;
      email?: string;
    };

export type NetworkState = { step: 'idle' } | { step: 'connected'; network: StellarNetwork };

export class PollarFlowError extends Error {
  readonly code = 'INVALID_FLOW' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PollarFlowError';
  }
}

// ─── Wallet balance types ─────────────────────────────────────────────────────

export type WalletBalanceContent =
  pollarPaths['/wallet/balance']['get']['responses'][200]['content']['application/json']['content'];
export type WalletBalanceRecord = WalletBalanceContent['balances'][number];

export type WalletBalanceState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; data: WalletBalanceContent }
  | { step: 'error'; message: string };

// ─── Tx history types ─────────────────────────────────────────────────────────

export type TxHistoryRecord =
  pollarPaths['/tx/history']['get']['responses'][200]['content']['application/json']['content']['records'][number];

export type TxHistoryParams = NonNullable<pollarPaths['/tx/history']['get']['parameters']['query']>;

export type TxHistoryContent =
  pollarPaths['/tx/history']['get']['responses'][200]['content']['application/json']['content'];

export type TxHistoryState =
  | { step: 'idle' }
  | { step: 'loading'; params: TxHistoryParams }
  | { step: 'loaded'; params: TxHistoryParams; data: TxHistoryContent }
  | { step: 'error'; params: TxHistoryParams; message: string };

// ─── KYC types ────────────────────────────────────────────────────────────────

export type KycLevel = 'basic' | 'intermediate' | 'enhanced';
export type KycStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type KycFlow = 'iframe' | 'form' | 'redirect';

export type KycProvider =
  pollarPaths['/kyc/providers']['get']['responses'][200]['content']['application/json']['content']['providers'][number];
export type KycStartBody = NonNullable<pollarPaths['/kyc/start']['post']['requestBody']>['content']['application/json'];
export type KycStartResponse = pollarPaths['/kyc/start']['post']['responses'][200]['content']['application/json']['content'];

// ─── Ramps types ──────────────────────────────────────────────────────────────

export type RampsQuoteQuery = NonNullable<pollarPaths['/ramps/quote']['get']['parameters']['query']>;
export type RampQuote =
  pollarPaths['/ramps/quote']['get']['responses'][200]['content']['application/json']['content']['quotes'][number];
export type RampsQuoteResponse = pollarPaths['/ramps/quote']['get']['responses'][200]['content']['application/json']['content'];

export type RampsOnrampBody = NonNullable<pollarPaths['/ramps/onramp']['post']['requestBody']>['content']['application/json'];
export type RampsOnrampResponse =
  pollarPaths['/ramps/onramp']['post']['responses'][200]['content']['application/json']['content'];

export type RampsOfframpBody = NonNullable<pollarPaths['/ramps/offramp']['post']['requestBody']>['content']['application/json'];
export type RampsOfframpResponse =
  pollarPaths['/ramps/offramp']['post']['responses'][200]['content']['application/json']['content'];

export type RampsTransactionResponse =
  pollarPaths['/ramps/transaction/{txId}']['get']['responses'][200]['content']['application/json']['content'];
export type RampTxStatus = RampsTransactionResponse['status'];
export type RampDirection = RampsTransactionResponse['direction'];
export type PaymentInstructions = RampsOnrampResponse['paymentInstructions'];
