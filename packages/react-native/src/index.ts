export { PollarProvider, usePollar } from './context';
export { createPollarAdapterHook } from './adapterHooks';
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
export { LoginModalTemplate } from './components/login-modal/LoginModalUI';
export { KycModalTemplate } from './components/kyc-modal/KycModal';
export type { KycStep } from './components/kyc-modal/KycModal';
export { RampWidgetTemplate } from './components/ramp-widget/RampWidget';
export type { RampStep } from './components/ramp-widget/RampWidget';
export { TransactionModalTemplate } from './components/transaction-modal/TransactionModalUI';
export type { TransactionModalTemplateProps } from './components/transaction-modal/TransactionModalUI';
export { TxHistoryModalTemplate } from './components/tx-history-modal/TxHistoryModalUI';
export { WalletBalanceModalTemplate } from './components/wallet-balance-modal/WalletBalanceModalUI';
export type { WalletBalanceModalTemplateProps } from './components/wallet-balance-modal/WalletBalanceModalUI';
export { WalletButtonTemplate } from './components/wallet-button/WalletButtonUI';

