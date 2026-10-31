import { PollarClient } from '@pollar/core';
import type {
  AuthState,
  CosignState,
  CustodyMigrationState,
  PendingConfirmation,
  PollarAdapters,
  PollarClientConfig,
  InteractiveAuthAdapter,
  RampDirection,
  RampOrder,
  RecoveryState,
} from '@pollar/core';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import type { PollarConfig, PollarStyles } from './types';
import type { FeatureName } from './components/FeaturePanel';
import { FeatureModal } from './components/FeatureModal';
import type { EarnModalOptions, ReceiveModalOptions, SendModalOptions, SwapModalOptions } from './components/FeaturePanel';
import { ModalErrorBoundary } from './components/commons';
import { AppKycFlow } from './components/kyc-modal/AppKycFlow';
import { CardModal, type CardModalOptions } from './components/card-modal/CardModal';
import { BridgeModal } from './components/bridge-modal/BridgeModal';
import { ConfirmModal } from './components/confirm-modal/ConfirmModal';
import { CosignModal } from './components/cosign-modal/CosignModal';
import { CustodyMigrationModal } from './components/custody-migration-modal/CustodyMigrationModal';
import { LoginModal } from './components/login-modal/LoginModal';
import { RecoveryModal } from './components/recovery-modal/RecoveryModal';
import { RampWidget, type RampModalOptions } from './components/ramp-widget/RampWidget';
import { TransactionModal } from './components/transaction-modal/TransactionModal';
import { TxHistoryModal } from './components/tx-history-modal/TxHistoryModal';
import { WalletBalanceModal } from './components/wallet-balance-modal/WalletBalanceModal';
import { PollarUIProvider } from './components/layout';
import { ModalLanguageContext, useProviderLanguage } from './language-context';

export interface NativePlatformAdapters {
  copyText?: (text: string) => Promise<void>;
  storage?: PollarClientConfig['storage'];
  visibilityProvider?: PollarClientConfig['visibilityProvider'];
  openAuthUrl?: PollarClientConfig['openAuthUrl'];
}
export interface PollarProviderProps {
  /** Configuration changes replace and clean up the owned client. Memoize object-valued adapters. */
  config: PollarClientConfig;
  /**
   * Language of the modals, a BCP 47 tag such as `'es'` or `'pt-BR'`: typically
   * the app's current language. Followed on every render without replacing the
   * client, so open modals switch when it changes. It wins over `config.locale`;
   * a language pinned in the dashboard wins over it, and a tag the modals have
   * no translation for is skipped.
   */
  language?: string | undefined;
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
  'createWallet',
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
  'getSolanaSwapConfig',
  'getSolanaSwapQuote',
  'swapSolana',
  'getEarnProviders',
  'getEarnOpportunities',
  'getEarnPosition',
  'earnDeposit',
  'earnWithdraw',
  'getRampRoutes',
  'quoteRamp',
  'createRampOrder',
  'getRampOrder',
  'listRampOrders',
  'signRampLeg',
  'listDistributionRules',
  'claimDistributionRule',
  'fetchSessions',
  'revokeSession',
  'fetchTxHistory',
] as const;
type Methods = Pick<PollarClient, (typeof methods)[number]>;
/** The ramp order the widget is following, kept while it is closed. */
export type NativeRampState = { direction: RampDirection; order: RampOrder };
type ModalMethods =
  | 'openLoginModal'
  | 'openTxModal'
  | 'openTransactionModal'
  | 'openKycModal'
  | 'openRampModal'
  | 'openRampWidget'
  | 'openCardModal'
  | 'openBridgeModal'
  | 'openTxHistoryModal'
  | 'openWalletBalanceModal'
  | 'openEnabledAssetsModal'
  | 'openSendModal'
  | 'openReceiveModal'
  | 'openSwapModal'
  | 'openEarnModal'
  | 'openSessionsModal'
  | 'openDistributionRulesModal';
/** The openers that take where their modal opens. */
type SeededModalMethods = {
  openRampModal: (options?: RampModalOptions) => void;
  openRampWidget: (options?: RampModalOptions) => void;
  openSendModal: (options?: SendModalOptions) => void;
  openReceiveModal: (options?: ReceiveModalOptions) => void;
  openSwapModal: (options?: SwapModalOptions) => void;
  openEarnModal: (options?: EarnModalOptions) => void;
  openCardModal: (options?: CardModalOptions) => void;
};
export type PollarContextValue = Methods &
  Record<
    Exclude<ModalMethods, keyof SeededModalMethods>,
    (options?: { country?: string; level?: 'basic' | 'intermediate' | 'enhanced'; onApproved?: () => void }) => void
  > &
  SeededModalMethods & {
    getClient: () => PollarClient;
    wallet: ReturnType<PollarClient['getWallet']>;
    wallets: ReturnType<PollarClient['getWallets']>;
    walletAddress: string;
    walletType: ReturnType<PollarClient['getWalletType']>;
    authState: AuthState;
    verified: boolean;
    isAuthenticated: boolean;
    /** Whether the signed-in user has a wallet on any chain. */
    hasWallet: boolean;
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
    /** Requests of a co-signed (Turnkey) wallet waiting for this device's vote. */
    cosign: CosignState;
    /** Open the approval prompt of a co-signed wallet. Opens by itself when a request arrives. */
    openCosignModal: () => void;
    /**
     * The approval a flow will ask for next (a ramp's swap after its approve),
     * or null. While one is coming, the approval prompt stays open after a sent
     * transaction and shows the next request when it arrives, instead of closing.
     */
    setCosignNextStep: (next: string | null) => void;
    /**
     * The recovery state of the user's Turnkey wallet: null until read, or for a
     * session without one. `recoveryLocked` is true while the wallet has no way
     * to be recovered without this device: it signs nothing but its own setup.
     */
    recovery: RecoveryState | null;
    recoveryLocked: boolean;
    /** Read the recovery state again (after a method changed elsewhere). */
    refreshRecovery: () => void;
    /** Open the recovery methods modal: passkeys, email, devices, export. */
    openRecoveryModal: () => void;
    /**
     * Whether the user's wallet, one Pollar custodies, has to move to this
     * device because the app keeps its wallets in Turnkey. While `required`, the
     * provider shows the move and nothing else; null until read.
     */
    custodyMigration: CustodyMigrationState | null;
    refreshCustodyMigration: () => void;
    /** Signing calls waiting for the user under `confirmation: 'prompt'`; the provider shows the first one. */
    confirmations: PendingConfirmation[];
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
  language,
  appConfig,
  styles: overrides,
  platform,
  adapters,
}: PollarProviderProps & {
  runtime: { client: PollarClient; adapter?: InteractiveAuthAdapter };
}) {
  const client = runtime.client;
  const [, update] = useState(0);
  const [modal, setModal] = useState<FeatureName | 'cards' | 'bridge' | null>(null);
  // The options the open modal was opened on; the key remounts it when it opens on other options, or on none after some.
  const [modalInitial, setModalInitial] = useState<object | undefined>(undefined);
  const [modalKey, setModalKey] = useState(0);
  const modalSeeded = useRef(false);
  const [kycOptions, setKycOptions] = useState<{
    country?: string;
    level?: 'basic' | 'intermediate' | 'enhanced';
    onApproved?: () => void;
  }>({});
  const [ramp, setRamp] = useState<NativeRampState | null>(null);
  const [cosignModalOpen, setCosignModalOpen] = useState(false);
  const [cosignNextStep, setCosignNextStep] = useState<string | null>(null);
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);
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
      client.onCosignStateChange(notify),
      client.onConfirmationRequest(notify),
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
      setCosignModalOpen(false);
      setRecoveryModalOpen(false);
    }
    previousAuthStep.current = auth.step;
  }, [auth.step]);
  const cosign = client.getCosignState();
  // A signing call that came back pending needs the user's vote now; open the
  // prompt when a new request appears, never when one merely resolves.
  const cosignPendingCount = useRef(0);
  useEffect(() => {
    if (cosign.pending.length > cosignPendingCount.current) setCosignModalOpen(true);
    cosignPendingCount.current = cosign.pending.length;
  }, [cosign.pending.length]);
  // The recovery state of a Turnkey wallet, read once signed in and again when
  // the wallet changes, so a locked wallet says so before the user tries to
  // send. A user without a Turnkey wallet reads `required: false`.
  const [recovery, setRecovery] = useState<RecoveryState | null>(null);
  const [recoveryTick, setRecoveryTick] = useState(0);
  const refreshRecovery = useCallback(() => setRecoveryTick((t) => t + 1), []);
  const signedIn = auth.step === 'authenticated';
  const recoveryWallet = client.getWallet()?.address ?? '';
  useEffect(() => {
    if (!signedIn) {
      setRecovery(null);
      return;
    }
    let cancelled = false;
    client.cosign.recovery
      .status()
      .then((next) => {
        if (!cancelled) setRecovery(next);
      })
      .catch(() => {
        if (!cancelled) setRecovery(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, signedIn, recoveryWallet, recoveryTick]);
  const recoveryLocked = !!recovery && recovery.required && !recovery.configured;
  const [custodyMigration, setCustodyMigration] = useState<CustodyMigrationState | null>(null);
  const [custodyMigrationTick, setCustodyMigrationTick] = useState(0);
  const refreshCustodyMigration = useCallback(() => setCustodyMigrationTick((t) => t + 1), []);
  // A wallet blocked by something pending lets the user carry on; the move is asked again next session.
  const [custodyMigrationLater, setCustodyMigrationLater] = useState(false);
  useEffect(() => {
    if (!signedIn) {
      setCustodyMigration(null);
      setCustodyMigrationLater(false);
      return;
    }
    let cancelled = false;
    client.cosign
      .custodyMigration()
      .then((next) => {
        if (!cancelled) setCustodyMigration(next);
      })
      .catch(() => {
        if (!cancelled) setCustodyMigration(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, signedIn, recoveryWallet, custodyMigrationTick]);
  const confirmations = client.getPendingConfirmations();
  const firstConfirmation = confirmations[0] ?? null;
  const wallet = client.getWallet();
  const tx = client.getTransactionState() ?? { step: 'idle' as const };
  const open = (next: FeatureName | 'cards' | 'bridge', options?: object) => {
    if (modal === 'authentication' && next !== modal) client.cancelLogin();
    const seeded = options !== undefined && Object.keys(options).length > 0;
    if (seeded || modalSeeded.current) setModalKey((k) => k + 1);
    modalSeeded.current = seeded;
    setModalInitial(seeded ? options : undefined);
    setModal(next);
  };
  const close = () => {
    if (modal === 'authentication') client.cancelLogin();
    setModal(null);
  };
  // Stable per client: modals key their effects on it, and a new function each
  // render would re-run their requests on every client event.
  const getClient = useCallback(() => client, [client]);
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
    getClient,
    wallet,
    wallets: client.getWallets(),
    walletAddress: wallet?.address ?? '',
    walletType: client.getWalletType(),
    authState: auth,
    isAuthenticated: auth.step === 'authenticated',
    hasWallet: client.hasWallet(),
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
    openSendModal: (options) => open('send', options),
    openReceiveModal: (options) => open('receive', options),
    openWalletBalanceModal: () => open('wallet'),
    openEnabledAssetsModal: () => open('assets'),
    openTxHistoryModal: () => open('history'),
    openSessionsModal: () => open('sessions'),
    openKycModal: (options = {}) => {
      setKycOptions(options);
      open('kyc');
    },
    openRampModal: (options) => open('ramp', options),
    openRampWidget: (options) => open('ramp', options),
    openCardModal: (options) => open('cards', options),
    openBridgeModal: () => open('bridge'),
    openSwapModal: (options) => open('swap', options),
    openEarnModal: (options) => open('earn', options),
    openDistributionRulesModal: () => open('distribution'),
    cosign,
    openCosignModal: () => setCosignModalOpen(true),
    setCosignNextStep,
    recovery,
    recoveryLocked,
    refreshRecovery,
    openRecoveryModal: () => setRecoveryModalOpen(true),
    custodyMigration,
    refreshCustodyMigration,
    confirmations,
  };
  const modalLanguage = useProviderLanguage(client, value.styles?.language, language);
  return (
    <Context.Provider value={value}>
      <ModalLanguageContext.Provider value={modalLanguage}>
        <PollarUIProvider theme={value.styles.theme === 'dark' ? 'dark' : 'light'}>
          {children}
          {modal && (
            <ModalErrorBoundary key={modalKey} onClose={close}>
              {modal === 'authentication' ? (
                <LoginModal onClose={close} />
              ) : modal === 'kyc' ? (
                <AppKycFlow onClose={close} {...kycOptions} />
              ) : modal === 'ramp' ? (
                <RampWidget onClose={close} initial={modalInitial as RampModalOptions | undefined} />
              ) : modal === 'bridge' ? (
                <BridgeModal onClose={close} />
              ) : modal === 'cards' ? (
                <CardModal key={wallet?.address ?? ''} onClose={close} initial={modalInitial as CardModalOptions | undefined} />
              ) : modal === 'transactions' ? (
                <TransactionModal onClose={close} />
              ) : modal === 'history' ? (
                <TxHistoryModal onClose={close} />
              ) : modal === 'wallet' ? (
                <WalletBalanceModal onClose={close} />
              ) : (
                <FeatureModal feature={modal} onClose={close} initial={modalInitial ? { [modal]: modalInitial } : undefined} />
              )}
            </ModalErrorBoundary>
          )}
          {cosignModalOpen && (
            <ModalErrorBoundary onClose={() => setCosignModalOpen(false)}>
              <CosignModal nextStep={cosignNextStep} onClose={() => setCosignModalOpen(false)} />
            </ModalErrorBoundary>
          )}
          {custodyMigration?.required && !custodyMigrationLater && (
            <ModalErrorBoundary onClose={refreshCustodyMigration}>
              <CustodyMigrationModal
                state={custodyMigration}
                onMoved={() => {
                  refreshCustodyMigration();
                  refreshRecovery();
                  setRecoveryModalOpen(true);
                }}
                onLater={() => {
                  setCustodyMigrationLater(true);
                  refreshCustodyMigration();
                  refreshRecovery();
                }}
              />
            </ModalErrorBoundary>
          )}
          {recoveryModalOpen && (
            <ModalErrorBoundary onClose={() => setRecoveryModalOpen(false)}>
              <RecoveryModal
                onClose={() => {
                  setRecoveryModalOpen(false);
                  // A method added in the modal unlocks what waited on it (a held ramp order).
                  refreshRecovery();
                }}
              />
            </ModalErrorBoundary>
          )}
          {firstConfirmation && (
            <ModalErrorBoundary onClose={firstConfirmation.reject}>
              <ConfirmModal key={firstConfirmation.id} confirmation={firstConfirmation} />
            </ModalErrorBoundary>
          )}
        </PollarUIProvider>
      </ModalLanguageContext.Provider>
    </Context.Provider>
  );
}
export function usePollar(): PollarContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('usePollar must be used inside <PollarProvider>');
  return value;
}
