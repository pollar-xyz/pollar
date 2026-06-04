'use client';

import {
  BuildOutcome,
  NetworkState,
  OnStorageDegrade,
  PollarAdapters,
  PollarClient,
  PollarClientConfig,
  PollarLoginOptions,
  PollarPersistedSession,
  SignOutcome,
  StellarNetwork,
  SubmitOutcome,
  TransactionState,
  TxBuildBody,
  TxHistoryState,
  WalletBalanceState,
  WalletId,
} from '@pollar/core';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ModalErrorBoundary } from './components/commons';
import { DistributionRulesModal } from './components/distribution-rules-modal/DistributionRulesModal';
import { KycModal } from './components/kyc-modal/KycModal';
import { LoginModal } from './components/login-modal/LoginModal';
import { RampWidget } from './components/ramp-widget/RampWidget';
import { ReceiveModal } from './components/receive-modal/ReceiveModal';
import { SendModal } from './components/send-modal/SendModal';
import { SessionsModal } from './components/sessions-modal/SessionsModal';
import { TransactionModal } from './components/transaction-modal/TransactionModal';
import { TxHistoryModal } from './components/tx-history-modal/TxHistoryModal';
import { WalletBalanceModal } from './components/wallet-balance-modal/WalletBalanceModal';
import type { PollarConfig, PollarStyles, RenderWalletsSlot } from './types';

const DEFAULT_APP_CONFIG: PollarConfig = {
  application: { name: '' },
  styles: {},
};

/**
 * Compares the fields of a persisted session that actually drive UI re-renders.
 * Replaces a per-listener `JSON.stringify(...) !== JSON.stringify(...)` call —
 * cheaper, allocation-free, and explicit about what counts as "changed".
 *
 * If a field is added to `PollarPersistedSession` that consumers read through
 * context, list it here too.
 */
function sessionsEqual(a: PollarPersistedSession | null, b: PollarPersistedSession | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.clientSessionId === b.clientSessionId &&
    a.userId === b.userId &&
    a.status === b.status &&
    a.token?.accessToken === b.token?.accessToken &&
    a.token?.refreshToken === b.token?.refreshToken &&
    a.token?.expiresAt === b.token?.expiresAt &&
    a.wallet?.publicKey === b.wallet?.publicKey
  );
}

interface PollarContextValue {
  walletAddress: string;
  getClient: () => PollarClient;
  openLoginModal: () => void;

  isAuthenticated: boolean;
  login: (options: PollarLoginOptions) => void;
  logout: () => void;
  /** Open the active-sessions modal. */
  openSessionsModal: () => void;
  appConfig: PollarConfig;
  styles: PollarStyles;
  /** UI slot for wallet picker (forwarded from provider props). */
  renderWallets?: RenderWalletsSlot;
  // transactions
  openTxModal: () => void;
  tx: TransactionState;
  buildTx: (
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ) => Promise<BuildOutcome>;
  signAndSubmitTx: (unsignedXdr: string) => Promise<SubmitOutcome>;
  /** External-wallet only. Custodial flows should use `signAndSubmitTx`. */
  signTx: (unsignedXdr: string) => Promise<SignOutcome>;
  submitTx: (signedXdr: string) => Promise<SubmitOutcome>;
  /** One-shot: build → sign → submit. Drives the same TransactionState flow as the split calls. */
  buildAndSignAndSubmitTx: (
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ) => Promise<SubmitOutcome>;
  /** Alias of `buildAndSignAndSubmitTx`. */
  runTx: (
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ) => Promise<SubmitOutcome>;
  walletType: WalletId | null;
  // network
  network: StellarNetwork;
  setNetwork: (network: StellarNetwork) => void;
  // wallet balance
  walletBalance: WalletBalanceState;
  refreshWalletBalance: () => Promise<void>;
  // kyc
  openKycModal: (options?: {
    country?: string;
    level?: 'basic' | 'intermediate' | 'enhanced';
    onApproved?: () => void;
  }) => void;
  // ramps
  openRampModal: () => void;
  // tx history
  txHistory: TxHistoryState;
  openTxHistoryModal: () => void;
  // wallet balance
  openWalletBalanceModal: () => void;
  // send / receive
  openSendModal: () => void;
  openReceiveModal: () => void;
  // distribution
  openDistributionRulesModal: () => void;
  // adapters
  adapters?: PollarAdapters;
}

const PollarContext = createContext<PollarContextValue | null>(null);

interface PollarProviderProps {
  /**
   * Either a pre-built `PollarClient` instance (useful for testing or for
   * reusing the same client outside React) or a `PollarClientConfig` that the
   * provider will use to construct one on mount.
   *
   * The client is locked at first render: changing this prop afterwards is
   * ignored. To swap clients, unmount and remount the provider.
   */
  client: PollarClient | PollarClientConfig;
  /**
   * Local override of the `/applications/config` response. If provided (even
   * `{}`), the remote fetch is skipped and missing fields fall back to the
   * defaults in `LoginModalTemplate`. If `undefined`, the SDK fetches
   * `/applications/config` on mount.
   */
  appConfig?: PollarConfig;
  /** UI customization slots. */
  ui?: {
    /** Replaces the default Freighter/Albedo wallet picker. */
    renderWallets?: RenderWalletsSlot;
  };
  adapters?: PollarAdapters;
  /**
   * Notified when persistent storage silently degrades to in-memory mode
   * (Safari private browsing quota errors, sandboxed iframes, etc.). Use this
   * to surface a UI hint that the session won't survive a reload, log to
   * telemetry, or fall back to a different storage strategy.
   *
   * Fires at most once per provider lifetime; late mounts get the latched
   * state replayed on subscribe.
   */
  onStorageDegrade?: OnStorageDegrade;
  children: ReactNode;
}

export function PollarProvider({
  client,
  appConfig: appConfigProp,
  ui,
  adapters,
  onStorageDegrade,
  children,
}: PollarProviderProps) {
  const [pollarClient] = useState<PollarClient>(() => (client instanceof PollarClient ? client : new PollarClient(client)));
  const [networkState, setNetworkState] = useState<NetworkState>(() => pollarClient.getNetworkState());
  const [sessionState, setSessionState] = useState<PollarPersistedSession | null>(null);
  const [transaction, setTransaction] = useState<TransactionState>({ step: 'idle' });
  const [txHistory, setTxHistory] = useState<TxHistoryState>({ step: 'idle' });
  const [walletBalance, setWalletBalance] = useState<WalletBalanceState>({ step: 'idle' });
  const [resolvedConfig, setResolvedConfig] = useState<PollarConfig>(() => appConfigProp ?? DEFAULT_APP_CONFIG);

  useEffect(() => {
    return pollarClient.onTransactionStateChange(setTransaction);
  }, [pollarClient]);

  useEffect(() => {
    return pollarClient.onTxHistoryStateChange(setTxHistory);
  }, [pollarClient]);

  useEffect(() => {
    return pollarClient.onWalletBalanceStateChange(setWalletBalance);
  }, [pollarClient]);

  useEffect(() => {
    return pollarClient.onNetworkStateChange((state) => {
      setNetworkState(state);
    });
  }, [pollarClient]);

  useEffect(() => {
    if (!onStorageDegrade) return;
    return pollarClient.onStorageDegrade(onStorageDegrade);
  }, [pollarClient, onStorageDegrade]);

  useEffect(() => {
    return pollarClient.onAuthStateChange((authState) => {
      if (authState.step === 'authenticated') {
        setSessionState((prev) => (sessionsEqual(prev, authState.session) ? prev : authState.session));
      } else if (authState.step === 'idle') {
        setSessionState(null);
      }
    });
  }, [pollarClient]);

  // Presence of `appConfig` is the opt-out: if the consumer passes it (even
  // `{}`), we trust them and skip the remote fetch.
  useEffect(() => {
    if (appConfigProp !== undefined) return;
    let cancelled = false;
    pollarClient
      .getAppConfig()
      .then((fetched) => {
        if (cancelled || !fetched) return;
        setResolvedConfig(fetched as PollarConfig);
      })
      .catch((err) => {
        console.error('[PollarProvider] getAppConfig failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [pollarClient, appConfigProp]);

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [kycModalOptions, setKycModalOptions] = useState<{
    country?: string;
    level?: 'basic' | 'intermediate' | 'enhanced';
    onApproved?: () => void;
  }>({});
  const [rampModalOpen, setRampModalOpen] = useState(false);
  const [txHistoryModalOpen, setTxHistoryModalOpen] = useState(false);
  const [walletBalanceModalOpen, setWalletBalanceModalOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);
  const [distributionRulesModalOpen, setDistributionRulesModalOpen] = useState(false);

  // PII (incl. providers.wallet.address) lives on `client.getUserProfile()`, not on the
  // persisted session. For both external and custodial wallets, `wallet.publicKey`
  // already holds the on-chain address we care about.
  const walletAddress = sessionState?.wallet?.publicKey || '';
  const getClient = useCallback(() => pollarClient, [pollarClient]);
  const refreshWalletBalance = useCallback(() => pollarClient.refreshBalance(walletAddress), [pollarClient, walletAddress]);

  const renderWallets = ui?.renderWallets;

  const contextValue: PollarContextValue = useMemo(() => {
    const styles: PollarStyles = resolvedConfig.styles ?? {};
    return {
      // session
      walletAddress,
      isAuthenticated: !!walletAddress,
      walletType: pollarClient.getWalletType(),
      // client
      getClient,
      // auth
      login: (options: PollarLoginOptions) => pollarClient.login(options),
      logout: () => pollarClient.logout(),
      openLoginModal: () => setLoginModalOpen(true),
      // transactions
      tx: transaction,
      buildTx: (operation, params, options) => pollarClient.buildTx(operation, params, options),
      signAndSubmitTx: (unsignedXdr: string) => pollarClient.signAndSubmitTx(unsignedXdr),
      signTx: (unsignedXdr: string) => pollarClient.signTx(unsignedXdr),
      submitTx: (signedXdr: string) => pollarClient.submitTx(signedXdr),
      buildAndSignAndSubmitTx: (operation, params, options) => pollarClient.buildAndSignAndSubmitTx(operation, params, options),
      runTx: (operation, params, options) => pollarClient.runTx(operation, params, options),
      openTxModal: () => setTransactionModalOpen(true),
      // tx history
      txHistory,
      openTxHistoryModal: () => setTxHistoryModalOpen(true),
      // wallet balance
      walletBalance,
      refreshWalletBalance,
      openWalletBalanceModal: () => setWalletBalanceModalOpen(true),
      // send / receive
      openSendModal: () => setSendModalOpen(true),
      openReceiveModal: () => setReceiveModalOpen(true),
      // sessions
      openSessionsModal: () => setSessionsModalOpen(true),
      // distribution
      openDistributionRulesModal: () => setDistributionRulesModalOpen(true),
      // network
      network: networkState.step === 'connected' ? networkState.network : 'testnet',
      setNetwork: (network: StellarNetwork) => pollarClient.setNetwork(network),
      // kyc
      openKycModal: (options = {}) => {
        setKycModalOptions(options);
        setKycModalOpen(true);
      },
      // ramp
      openRampModal: () => setRampModalOpen(true),
      // config
      appConfig: resolvedConfig,
      styles,
      renderWallets,
      adapters,
    } as PollarContextValue;
  }, [
    walletAddress,
    pollarClient,
    getClient,
    transaction,
    txHistory,
    walletBalance,
    refreshWalletBalance,
    networkState,
    resolvedConfig,
    adapters,
    renderWallets,
  ]);

  return (
    <PollarContext.Provider value={contextValue}>
      {children}
      {loginModalOpen && (
        <ModalErrorBoundary onClose={() => setLoginModalOpen(false)}>
          <LoginModal onClose={() => setLoginModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {transactionModalOpen && (
        <ModalErrorBoundary onClose={() => setTransactionModalOpen(false)}>
          <TransactionModal onClose={() => setTransactionModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {kycModalOpen && (
        <ModalErrorBoundary onClose={() => setKycModalOpen(false)}>
          <KycModal
            onClose={() => setKycModalOpen(false)}
            {...(kycModalOptions.country !== undefined && { country: kycModalOptions.country })}
            {...(kycModalOptions.level !== undefined && { level: kycModalOptions.level })}
            {...(kycModalOptions.onApproved !== undefined && { onApproved: kycModalOptions.onApproved })}
          />
        </ModalErrorBoundary>
      )}
      {rampModalOpen && (
        <ModalErrorBoundary onClose={() => setRampModalOpen(false)}>
          <RampWidget onClose={() => setRampModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {txHistoryModalOpen && (
        <ModalErrorBoundary onClose={() => setTxHistoryModalOpen(false)}>
          <TxHistoryModal onClose={() => setTxHistoryModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {walletBalanceModalOpen && (
        <ModalErrorBoundary onClose={() => setWalletBalanceModalOpen(false)}>
          <WalletBalanceModal onClose={() => setWalletBalanceModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {sendModalOpen && (
        <ModalErrorBoundary onClose={() => setSendModalOpen(false)}>
          <SendModal onClose={() => setSendModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {receiveModalOpen && (
        <ModalErrorBoundary onClose={() => setReceiveModalOpen(false)}>
          <ReceiveModal onClose={() => setReceiveModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {sessionsModalOpen && (
        <ModalErrorBoundary onClose={() => setSessionsModalOpen(false)}>
          <SessionsModal onClose={() => setSessionsModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {distributionRulesModalOpen && (
        <ModalErrorBoundary onClose={() => setDistributionRulesModalOpen(false)}>
          <DistributionRulesModal onClose={() => setDistributionRulesModalOpen(false)} />
        </ModalErrorBoundary>
      )}
    </PollarContext.Provider>
  );
}

export function usePollar() {
  const ctx = useContext(PollarContext);
  if (!ctx) {
    throw new Error('usePollar must be used inside <PollarProvider>');
  }
  return ctx;
}
