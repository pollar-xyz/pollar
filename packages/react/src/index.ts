export { PollarProvider, usePollar } from './context';
export { createPollarAdapterHook } from './usePollarAdapter';
export type { LoginButtonProps, AuthModalProps, PollarStyles, PollarConfig } from './types';
// Re-export the custom-provider contracts so consumers can author providers
// (e.g. a Privy login provider) without importing from `@pollar/core` directly.
export type { PollarAuthProvider, AuthProviderContext } from '@pollar/core';
export { WalletButton } from './components/wallet-button/WalletButton';
export { WalletButtonTemplate, type WalletButtonTemplateProps } from './components/wallet-button/WalletButtonTemplate';

// ─── Modals ───────────────────────────────────────────────────────────────────
export { KycModal } from './components/kyc-modal/KycModal';
export { KycStatus } from './components/kyc-modal/KycStatus';
export { RampWidget } from './components/ramp-widget/RampWidget';
export { RouteDisplay } from './components/ramp-widget/RouteDisplay';
export { WalletBalanceModal } from './components/wallet-balance-modal/WalletBalanceModal';
export { EnabledAssetsModal } from './components/enabled-assets-modal/EnabledAssetsModal';
export { SendModal } from './components/send-modal/SendModal';
export { ReceiveModal } from './components/receive-modal/ReceiveModal';
export { SessionsModal } from './components/sessions-modal/SessionsModal';
export { DistributionRulesModal } from './components/distribution-rules-modal/DistributionRulesModal';

// ─── Templates ────────────────────────────────────────────────────────────────
export { LoginModalTemplate } from './components/login-modal/LoginModalTemplate';
export { KycModalTemplate } from './components/kyc-modal/KycModalTemplate';
export type { KycStep } from './components/kyc-modal/KycModalTemplate';
export { RampWidgetTemplate } from './components/ramp-widget/RampWidgetTemplate';
export type { RampStep } from './components/ramp-widget/RampWidgetTemplate';
export { TransactionModalTemplate } from './components/transaction-modal/TransactionModalTemplate';
export type { TransactionModalTemplateProps } from './components/transaction-modal/TransactionModalTemplate';
export { TxStatusView } from './components/transaction-modal/TxStatusView';
export type { TxStatusViewProps } from './components/transaction-modal/TxStatusView';
export { TxHistoryModalTemplate } from './components/tx-history-modal/TxHistoryModalTemplate';
export { WalletBalanceModalTemplate } from './components/wallet-balance-modal/WalletBalanceModalTemplate';
export type { WalletBalanceModalTemplateProps } from './components/wallet-balance-modal/WalletBalanceModalTemplate';
export { EnabledAssetsModalTemplate } from './components/enabled-assets-modal/EnabledAssetsModalTemplate';
export type { EnabledAssetsModalTemplateProps } from './components/enabled-assets-modal/EnabledAssetsModalTemplate';
export { SendModalTemplate } from './components/send-modal/SendModalTemplate';
export type { SendModalTemplateProps } from './components/send-modal/SendModalTemplate';
export { ReceiveModalTemplate } from './components/receive-modal/ReceiveModalTemplate';
export type { ReceiveModalTemplateProps } from './components/receive-modal/ReceiveModalTemplate';
export { SessionsModalTemplate } from './components/sessions-modal/SessionsModalTemplate';
export type { SessionsModalTemplateProps, SessionsState } from './components/sessions-modal/SessionsModalTemplate';
export { DistributionRulesModalTemplate } from './components/distribution-rules-modal/DistributionRulesModalTemplate';
