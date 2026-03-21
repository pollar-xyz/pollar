export const StateStatus = {
  NONE: 'NONE',
  LOADING: 'LOADING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
} as const;
export type StateStatus = (typeof StateStatus)[keyof typeof StateStatus];

export const PollarStateVar = {
  NETWORK: 'network',
  TRANSACTION: 'transaction',
} as const;

export type PollarStateVar = (typeof PollarStateVar)[keyof typeof PollarStateVar];

export const STATE_VAR_CODES = {
  transaction: {
    NONE: 'NONE',
    BUILD_TRANSACTION_ERROR_NO_WALLET: 'BUILD_TRANSACTION_ERROR_NO_WALLET',
    BUILD_TRANSACTION_START: 'BUILD_TRANSACTION_START',
    BUILD_TRANSACTION_SUCCESS: 'BUILD_TRANSACTION_SUCCESS',
    BUILD_TRANSACTION_ERROR: 'BUILD_TRANSACTION_ERROR',
    SIGN_SEND_TRANSACTION_START: 'SIGN_SEND_TRANSACTION_START',
    SIGN_SEND_TRANSACTION_SUCCESS: 'SIGN_SEND_TRANSACTION_SUCCESS',
    SIGN_SEND_TRANSACTION_ERROR: 'SIGN_SEND_TRANSACTION_ERROR',
  },
  network: {
    NONE: 'NONE',
    NETWORK_UPDATED: 'NETWORK_UPDATED',
  },
} as const;