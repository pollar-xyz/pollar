export { PollarProvider, usePollar } from './context';
export type { PollarProviderProps, PollarContextValue, NativePlatformAdapters } from './context';
export { FeaturePanel, ChainSelect, AssetSelect } from './components/FeaturePanel';
export type { FeatureName } from './components/FeaturePanel';
export {
  FeatureModal,
  SendModal,
  ReceiveModal,
  EnabledAssetsModal,
  SessionsModal,
  SwapModal,
  EarnModal,
  DistributionRulesModal,
} from './components/FeatureModal';
export type { FeatureModalProps } from './components/FeatureModal';
export {
  AuthPanel,
  WalletPanel,
  ReceivePanel,
  SendPanel,
  TransactionPanel,
  TransactionStatus,
  AssetsPanel,
  HistoryPanel,
  SessionsPanel,
  KycPreview,
  SwapPanel,
  EarnPanel,
  DistributionPanel,
  RampPanel,
  LogoutPanel,
  ChainsPanel,
} from './components/FeaturePanel';
export {
  FeatureExample,
  PaymentForm,
  BalanceLookup,
  SignTransactionForm,
  PaymentRequestForm,
} from './components/FeatureExample';
export type { PaymentRequest, PaymentRequestParser } from './components/FeatureExample';
export { AppShell } from './components/AppShell';
export type { AppShellProps, AppShellGroup } from './components/AppShell';
export { FeatureCatalog } from './components/FeatureCatalog';
export type { CatalogSection } from './components/FeatureCatalog';
export { AccountOnboarding } from './components/AccountOnboarding';
export type { AccountOnboardingProps, ApplicationSummary } from './components/AccountOnboarding';
export {
  PollarUIProvider,
  PollarSafeAreaProvider,
  PollarStack,
  PollarText,
  ScreenLayout,
  NoticeBanner,
  LoadingScreen,
  ErrorNotice,
  useSurfaceColors,
} from './components/layout';
export {
  Card,
  Label,
  ActionButton,
  Field,
  ResultView,
  useAction,
  ActionState,
  Choice,
  useNativeColors,
} from './components/native-ui';
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

// Modals
export { KycModal } from './components/kyc-modal/KycModal';
export { KycStatus } from './components/kyc-modal/KycStatus';
export { RampWidget } from './components/ramp-widget/RampWidget';
export { RouteDisplay } from './components/ramp-widget/RouteDisplay';
export { WalletBalanceModal } from './components/wallet-balance-modal/WalletBalanceModal';

// Templates
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
export type { WalletButtonTemplateProps } from './components/wallet-button/WalletButtonUI';
