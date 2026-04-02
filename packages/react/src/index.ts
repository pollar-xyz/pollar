export { PollarProvider, usePollar } from './context';
export { createPollarAdapterHook } from './usePollarAdapter';
export type {
  AuthProviderProps,
  AuthContextValue,
  LoginButtonProps,
  AuthModalProps,
  PollarStyles,
  PollarConfig,
} from './types';
export { WalletButton } from './components/wallet-button/WalletButton';

// ─── Modals ───────────────────────────────────────────────────────────────────
export { KycModal } from './components/kyc-modal/KycModal';
export { KycStatus } from './components/kyc-modal/KycStatus';
export { RampWidget } from './components/ramp-widget/RampWidget';
export { RouteDisplay } from './components/ramp-widget/RouteDisplay';
export { WalletBalanceModal } from './components/wallet-balance-modal/WalletBalanceModal';

// ─── Templates ────────────────────────────────────────────────────────────────
export { LoginModalTemplate } from './components/login-modal/LoginModalTemplate';
export { KycModalTemplate } from './components/kyc-modal/KycModalTemplate';
export type { KycStep } from './components/kyc-modal/KycModalTemplate';
export { RampWidgetTemplate } from './components/ramp-widget/RampWidgetTemplate';
export type { RampStep } from './components/ramp-widget/RampWidgetTemplate';
export { TransactionModalTemplate } from './components/transaction-modal/TransactionModalTemplate';
export type { TransactionModalTemplateProps } from './components/transaction-modal/TransactionModalTemplate';
export { TxHistoryModalTemplate } from './components/tx-history-modal/TxHistoryModalTemplate';
export { WalletBalanceModalTemplate } from './components/wallet-balance-modal/WalletBalanceModalTemplate';
export type { WalletBalanceModalTemplateProps } from './components/wallet-balance-modal/WalletBalanceModalTemplate';
