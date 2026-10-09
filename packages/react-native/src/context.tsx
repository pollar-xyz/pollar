import { PollarClient } from '@pollar/core';
import type {
  AuthState,
  PollarAdapters,
  PollarClientConfig,
  InteractiveAuthAdapter,
  RampsOnrampResponse,
  RampsTransactionResponse,
} from '@pollar/core';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import type { PollarConfig, PollarStyles } from './types';
import type { FeatureName } from './components/FeaturePanel';
import { FeatureModal } from './components/FeatureModal';
import { ModalErrorBoundary } from './components/commons';
import { AppKycFlow } from './components/kyc-modal/AppKycFlow';
import { LoginModal } from './components/login-modal/LoginModal';
import { RampWidget } from './components/ramp-widget/RampWidget';
import { TransactionModal } from './components/transaction-modal/TransactionModal';
import { TxHistoryModal } from './components/tx-history-modal/TxHistoryModal';
import { WalletBalanceModal } from './components/wallet-balance-modal/WalletBalanceModal';
import { PollarUIProvider } from './components/layout';

export interface NativePlatformAdapters {
  copyText?: (text: string) => Promise<void>;
  storage?: PollarClientConfig['storage'];
  visibilityProvider?: PollarClientConfig['visibilityProvider'];
  openAuthUrl?: PollarClientConfig['openAuthUrl'];
}
export interface PollarProviderProps {
  /** Configuration changes replace and clean up the owned client. Memoize object-valued adapters. */
  config: PollarClientConfig;
  appConfig?: PollarConfig;
  styles?: PollarStyles;
  adapters?: PollarAdapters;
  platform?: NativePlatformAdapters;
  /** Mount the adapter's native provider above PollarProvider. */
  privyAdapter?: InteractiveAuthAdapter;
  children: React.ReactNode;
}
const methods = [
  'login',
  'buildTx',
  'signAndSubmitTx',
  'signTx',
  'submitTx',
  'buildAndSignAndSubmitTx',
  'runTx',
  'sendPayment',
  'refreshAssets',
  'setTrustline',
  'getSwapConfig',
  'getSwapTokens',
  'getSwapQuote',
  'swap',
  'getEarnProviders',
  'getEarnOpportunities',
  'getEarnPosition',
  'earnDeposit',
  'earnWithdraw',
  'getRampsQuote',
  'getRampCountries',
  'createOnRamp',
  'createOffRamp',
  'getRampTransaction',
  'getRampKycStatus',
  'getRampLiquidity',
  'submitRampSignature',
  'completeWithdraw',
  'listDistributionRules',
  'claimDistributionRule',
  'fetchSessions',
  'revokeSession',
  'fetchTxHistory',
] as const;
type Methods = Pick<PollarClient, (typeof methods)[number]>;
export type NativeRampState = { direction: 'onramp' | 'offramp'; transaction: RampsOnrampResponse | RampsTransactionResponse };
type ModalMethods =
  | 'openLoginModal'
  | 'openTxModal'
  | 'openTransactionModal'
  | 'openKycModal'
  | 'openRampModal'
  | 'openRampWidget'
  | 'openTxHistoryModal'
  | 'openWalletBalanceModal'
  | 'openEnabledAssetsModal'
  | 'openSendModal'
  | 'openReceiveModal'
  | 'openSwapModal'
  | 'openEarnModal'
  | 'openSessionsModal'
  | 'openDistributionRulesModal';
export type PollarContextValue = Methods &
  Record<
    ModalMethods,
    (options?: { country?: string; level?: 'basic' | 'intermediate' | 'enhanced'; onApproved?: () => void }) => void
  > & {
    getClient: () => PollarClient;
    wallet: ReturnType<PollarClient['getWallet']>;
    wallets: ReturnType<PollarClient['getWallets']>;
    walletAddress: string;
    walletType: ReturnType<PollarClient['getWalletType']>;
    authState: AuthState;
    verified: boolean;
    isAuthenticated: boolean;
    logout: () => Promise<void>;
    network: ReturnType<PollarClient['getNetwork']>;
    setNetwork: PollarClient['setNetwork'];
    tx: NonNullable<ReturnType<PollarClient['getTransactionState']>>;
    transaction: NonNullable<ReturnType<PollarClient['getTransactionState']>>;
    walletBalance: ReturnType<PollarClient['getWalletBalanceState']>;
    enabledAssets: ReturnType<PollarClient['getEnabledAssetsState']>;
    sessions: ReturnType<PollarClient['getSessionsState']>;
    txHistory: ReturnType<PollarClient['getTxHistoryState']>;
    refreshBalance: (publicKey?: string) => Promise<void>;
    refreshWalletBalance: PollarClient['refreshBalance'];
    appConfig: PollarConfig;
    config: PollarConfig;
    styles: PollarStyles;
    configStatus: 'loading' | 'ready' | 'error';
    configError: string | null;
    retryConfig: () => void;
    copyText: (text: string) => Promise<void>;
    adapters?: PollarAdapters;
    privyAdapter?: InteractiveAuthAdapter;
    ramp: NativeRampState | null;
    setRamp: (value: NativeRampState | null) => void;
  };
const Context = createContext<PollarContextValue | null>(null);
const emptyConfig: PollarConfig = { application: { name: '', network: 'testnet', chains: [] }, styles: {} };

// Preserve equivalent inline scalar configuration without restarting the owned client.
function useStableConfig(value: PollarClientConfig): PollarClientConfig {
  const stable = useRef(value);
  const keys = Object.keys(value) as Array<keyof PollarClientConfig>;
  if (keys.length !== Object.keys(stable.current).length || keys.some((key) => value[key] !== stable.current[key]))
    stable.current = value;
  return stable.current;
}

// Creation occurs after commit. An abandoned Strict Mode render never starts a client.
export function PollarProvider(props: PollarProviderProps) {
  const config = useStableConfig(props.config);
  const adapter = props.privyAdapter;
  const storage = props.platform?.storage;
  const visibilityProvider = props.platform?.visibilityProvider;
  const openAuthUrl = props.platform?.openAuthUrl;
  const clientConfig = useMemo(
    () => ({
      ...config,
      ...(storage ? { storage } : {}),
      ...(visibilityProvider ? { visibilityProvider } : {}),
      ...(openAuthUrl ? { openAuthUrl } : {}),
      walletAdapters: [...(config.walletAdapters ?? []), ...(adapter ? [adapter] : [])],
    }),
    [config, storage, visibilityProvider, openAuthUrl, adapter],
  );
  const generation = useRef(0);
  const [runtime, setRuntime] = useState<{
    client: PollarClient;
    config: PollarClientConfig;
    generation: number;
    adapter?: InteractiveAuthAdapter;
    Host?: React.ComponentType<{ children: React.ReactNode }>;
  }>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    let owned: PollarClient | undefined;
    void (async () => {
      // Let Strict Mode's setup/cleanup finish before allocating resources.
      await Promise.resolve();
      if (!active) return;
      owned = new PollarClient(clientConfig);
      setRuntime({ client: owned, config: clientConfig, generation: ++generation.current, ...(adapter ? { adapter } : {}) });
    })().catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      active = false;
      owned?.cancelLogin();
      owned?.destroy();
    };
  }, [clientConfig, adapter]);
  if (error) return <Text accessibilityRole="alert">{error}</Text>;
  if (!runtime || runtime.config !== clientConfig) return <ActivityIndicator accessibilityLabel="Initializing Pollar" />;
  const content = <ClientProvider key={runtime.generation} {...props} runtime={runtime} />;
  return runtime.Host ? <runtime.Host>{content}</runtime.Host> : content;
}

function ClientProvider({
  runtime,
  children,
  appConfig,
  styles: overrides,
  platform,
  adapters,
}: PollarProviderProps & {
  runtime: { client: PollarClient; adapter?: InteractiveAuthAdapter };
}) {
  const client = runtime.client;
  const [, update] = useState(0);
  const [modal, setModal] = useState<FeatureName | null>(null);
  const [kycOptions, setKycOptions] = useState<{
    country?: string;
    level?: 'basic' | 'intermediate' | 'enhanced';
    onApproved?: () => void;
  }>({});
  const [ramp, setRamp] = useState<NativeRampState | null>(null);
  const [remote, setRemote] = useState<PollarConfig>(appConfig ?? emptyConfig);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(appConfig ? 'ready' : 'loading');
  const [retry, setRetry] = useState(0);
  const [configError, setConfigError] = useState<string | null>(null);
  useEffect(() => {
    const notify = () => update((n) => n + 1);
    const unsub = [
      client.onAuthStateChange(notify),
      client.onNetworkStateChange(notify),
      client.onTransactionStateChange(notify),
      client.onWalletBalanceStateChange(notify),
      client.onEnabledAssetsStateChange(notify),
      client.onTxHistoryStateChange(notify),
      client.onSessionsStateChange(notify),
    ];
    return () => unsub.forEach((fn) => fn());
  }, [client]);
  useEffect(() => {
    let active = true;
    if (appConfig) {
      setRemote(appConfig);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    setConfigError(null);
    void client
      .getAppConfig()
      .then((value) => {
        if (!active) return;
        const cfg = value as PollarConfig | null;
        if (!cfg?.application) throw new Error('Invalid application configuration');
        setRemote(cfg);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus('error');
          setConfigError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      active = false;
    };
  }, [client, appConfig, retry]);
  const auth = client.getAuthState();
  const previousAuthStep = useRef(auth.step);
  useEffect(() => {
    if (previousAuthStep.current === 'authenticated' && auth.step === 'idle') {
      setRamp(null);
      setModal(null);
    }
    previousAuthStep.current = auth.step;
  }, [auth.step]);
  const wallet = client.getWallet();
  const tx = client.getTransactionState() ?? { step: 'idle' as const };
  const open = (next: FeatureName) => {
    if (modal === 'authentication' && next !== modal) client.cancelLogin();
    setModal(next);
  };
  const close = () => {
    if (modal === 'authentication') client.cancelLogin();
    setModal(null);
  };
  const bound = useMemo(
    () => Object.fromEntries(methods.map((name) => [name, client[name].bind(client)])) as Methods,
    [client],
  );
  const value: PollarContextValue = {
    ...bound,
    buildTx: async (...args) => {
      open('transactions');
      return client.buildTx(...args);
    },
    getClient: () => client,
    wallet,
    wallets: client.getWallets(),
    walletAddress: wallet?.address ?? '',
    walletType: client.getWalletType(),
    authState: auth,
    isAuthenticated: auth.step === 'authenticated',
    verified: auth.step === 'authenticated' && auth.verified,
    logout: async () => {
      client.cancelLogin();
      setModal(null);
      setRamp(null);
      await client.logout();
    },
    network: client.getNetwork(),
    setNetwork: (network) => {
      client.cancelLogin();
      setModal(null);
      setRamp(null);
      client.setNetwork(network);
    },
    tx,
    transaction: tx,
    walletBalance: client.getWalletBalanceState(),
    enabledAssets: client.getEnabledAssetsState(),
    sessions: client.getSessionsState(),
    txHistory: client.getTxHistoryState(),
    refreshBalance: async (publicKey) => {
      if (publicKey && publicKey !== client.getWallet()?.address)
        throw new Error('Balance refresh requires the connected wallet address.');
      await client.refreshBalance();
    },
    refreshWalletBalance: () => client.refreshBalance(),
    config: remote,
    appConfig: remote,
    configStatus: status,
    configError,
    retryConfig: () => setRetry((n) => n + 1),
    styles: { ...remote.styles, ...overrides, providers: { ...remote.styles?.providers, ...overrides?.providers } },
    copyText: async (text) => {
      if (!platform?.copyText) throw new Error('Provide platform.copyText to enable the clipboard.');
      await platform.copyText(text);
    },
    ...(adapters ? { adapters } : {}),
    ...(runtime.adapter ? { privyAdapter: runtime.adapter } : {}),
    ramp,
    setRamp: (next) => {
      const current = client.getAuthState();
      if (
        auth.step === 'authenticated' &&
        current.step === 'authenticated' &&
        auth.session.clientSessionId === current.session.clientSessionId
      )
        setRamp(next);
    },
    openLoginModal: () => open('authentication'),
    openTxModal: () => open('transactions'),
    openTransactionModal: () => open('transactions'),
    openSendModal: () => open('send'),
    openReceiveModal: () => open('receive'),
    openWalletBalanceModal: () => open('wallet'),
    openEnabledAssetsModal: () => open('assets'),
    openTxHistoryModal: () => open('history'),
    openSessionsModal: () => open('sessions'),
    openKycModal: (options = {}) => {
      setKycOptions(options);
      open('kyc');
    },
    openRampModal: () => open('ramp'),
    openRampWidget: () => open('ramp'),
    openSwapModal: () => open('swap'),
    openEarnModal: () => open('earn'),
    openDistributionRulesModal: () => open('distribution'),
  };
  return (
    <Context.Provider value={value}>
      <PollarUIProvider theme={value.styles.theme === 'dark' ? 'dark' : 'light'}>
        {children}
        {modal && (
          <ModalErrorBoundary onClose={close}>
            {modal === 'authentication' ? (
              <LoginModal onClose={close} />
            ) : modal === 'kyc' ? (
              <AppKycFlow onClose={close} {...kycOptions} />
            ) : modal === 'ramp' ? (
              <RampWidget onClose={close} />
            ) : modal === 'transactions' ? (
              <TransactionModal onClose={close} />
            ) : modal === 'history' ? (
              <TxHistoryModal onClose={close} />
            ) : modal === 'wallet' ? (
              <WalletBalanceModal onClose={close} />
            ) : (
              <FeatureModal feature={modal} onClose={close} />
            )}
          </ModalErrorBoundary>
        )}
      </PollarUIProvider>
    </Context.Provider>
  );
}
export function usePollar(): PollarContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('usePollar must be used inside <PollarProvider>');
  return value;
}
