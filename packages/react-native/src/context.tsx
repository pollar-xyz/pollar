import {
  BuildOutcome,
  NetworkState,
  PollarAdapters,
  PollarClient,
  PollarClientConfig,
  PollarLoginOptions,
  PollarPersistedSession,
  StellarNetwork,
  SubmitOutcome,
  TransactionState,
  TxBuildBody,
  TxHistoryState,
  WalletBalanceState,
  WalletId,
} from '@pollar/core';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ModalErrorBoundary } from './components/commons';
import { KycModal } from './components/kyc-modal/KycModal';
import { LoginModal } from './components/login-modal/LoginModal';
import { RampWidget } from './components/ramp-widget/RampWidget';
import { TransactionModal } from './components/transaction-modal/TransactionModal';
import { TxHistoryModal } from './components/tx-history-modal/TxHistoryModal';
import { WalletBalanceModal } from './components/wallet-balance-modal/WalletBalanceModal';
import type { PollarConfig, PollarStyles } from './types';

const DEFAULT_APP_CONFIG: PollarConfig = {
  application: { name: '', network: 'testnet', chains: [] },
  styles: {},
};

async function fetchRemoteConfig(client: PollarClient): Promise<PollarConfig> {
  const content = await client.getAppConfig();
  return (content as PollarConfig | null) ?? DEFAULT_APP_CONFIG;
}

/** Compares the session fields that drive re-renders. Extend it when context starts reading another one. */
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
    a.wallet?.address === b.wallet?.address
  );
}

interface PollarContextValue {
  walletAddress: string;
  getClient: () => PollarClient;
  openLoginModal: () => void;

  isAuthenticated: boolean;
  login: (options: PollarLoginOptions) => void;
  logout: () => void;
  config: PollarConfig;
  styles: PollarStyles;
  // transactions
  openTransactionModal: () => void;
  transaction: TransactionState;
  buildTx: (
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ) => Promise<BuildOutcome>;
  signAndSubmitTx: (unsignedXdr?: string) => Promise<SubmitOutcome>;
  walletType: WalletId | null;
  // network
  network: StellarNetwork;
  setNetwork: (network: StellarNetwork) => void;
  // wallet balance
  walletBalance: WalletBalanceState;
  refreshBalance: () => Promise<void>;
  // kyc
  openKycModal: (options?: {
    country?: string;
    level?: 'basic' | 'intermediate' | 'enhanced';
    onApproved?: () => void;
  }) => void;
  // ramps
  openRampWidget: () => void;
  // tx history
  txHistory: TxHistoryState;
  openTxHistoryModal: () => void;
  // wallet balance
  openWalletBalanceModal: () => void;
  // adapters
  adapters?: PollarAdapters;
}

const PollarContext = createContext<PollarContextValue | null>(null);

interface PollarProviderProps {
  /** Read once on mount: changing it afterwards is ignored. Remount the provider to swap clients. */
  config: PollarClientConfig;
  styles?: PollarStyles;
  adapters?: PollarAdapters;
  children: ReactNode;
}

/**
 * StrictMode runs the `useState` initializer twice and keeps only the second
 * pass, so without this the provider builds two clients and tears down one. The
 * orphan keeps refreshing tokens against the same session row and DPoP key as
 * the live one. Both passes get the same `config` object, so the second reuses
 * the first pass's client; the mount effect drops the entry once it is claimed.
 */
const clientByConfig = new WeakMap<PollarClientConfig, PollarClient>();

export function PollarProvider({ config, styles: propStyles, adapters, children }: PollarProviderProps) {
  const [pollarClient] = useState<PollarClient>(() => {
    const alreadyBuilt = clientByConfig.get(config);
    if (alreadyBuilt) return alreadyBuilt;
    const built = new PollarClient(config);
    clientByConfig.set(config, built);
    return built;
  });
  const builtFromConfigRef = useRef<PollarClientConfig | null>(config);
  const destroyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (builtFromConfigRef.current) {
      clientByConfig.delete(builtFromConfigRef.current);
      builtFromConfigRef.current = null;
    }
    if (destroyTimerRef.current) {
      clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;
    }
    return () => {
      // Deferred so a StrictMode unmount/remount cancels it above; a real unmount has nothing to cancel it.
      destroyTimerRef.current = setTimeout(() => pollarClient.destroy(), 0);
    };
  }, [pollarClient]);

  const [networkState, setNetworkState] = useState<NetworkState>(() => pollarClient.getNetworkState());
  const [sessionState, setSessionState] = useState<PollarPersistedSession | null>(null);
  const [transaction, setTransaction] = useState<TransactionState>({ step: 'idle' });
  const [txHistory, setTxHistory] = useState<TxHistoryState>({ step: 'idle' });
  const [walletBalance, setWalletBalance] = useState<WalletBalanceState>({ step: 'idle' });
  const [remoteConfig, setRemoteConfig] = useState<PollarConfig>(DEFAULT_APP_CONFIG);
  const [styles, setStyles] = useState<PollarStyles>(propStyles ?? {});

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
    return pollarClient.onAuthStateChange((authState) => {
      if (authState.step === 'authenticated') {
        setSessionState((prev) => (sessionsEqual(prev, authState.session) ? prev : authState.session));
      } else if (authState.step === 'idle') {
        setSessionState(null);
      }
    });
  }, [pollarClient]);

  useEffect(() => {
    fetchRemoteConfig(pollarClient)
      .then((fetched) => {
        setRemoteConfig(fetched);
        setStyles({
          ...fetched.styles,
          ...propStyles,
          providers: { ...fetched.styles?.providers, ...propStyles?.providers },
        });
      })
      .catch(() => {
        setStyles(propStyles ?? {});
      });
  }, [pollarClient]);

  useEffect(() => {
    if (transaction.step !== 'idle') {
      setTransactionModalOpen(true);
    }
  }, [transaction.step]);

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [kycModalOptions, setKycModalOptions] = useState<{
    country?: string;
    level?: 'basic' | 'intermediate' | 'enhanced';
    onApproved?: () => void;
  }>({});
  const [rampWidgetOpen, setRampWidgetOpen] = useState(false);
  const [txHistoryModalOpen, setTxHistoryModalOpen] = useState(false);
  const [walletBalanceModalOpen, setWalletBalanceModalOpen] = useState(false);

  const walletAddress = sessionState?.wallet?.address || '';

  const contextValue = useMemo<PollarContextValue>(
    () => ({
      walletAddress,
      getClient: () => pollarClient,
      transaction,
      login: (options: PollarLoginOptions) => pollarClient.login(options),
      logout: () => pollarClient.logout(),
      isAuthenticated: !!walletAddress,
      buildTx: (operation, params, options) => pollarClient.buildTx(operation, params, options),
      signAndSubmitTx: (unsignedXdr?: string) => pollarClient.signAndSubmitTx(unsignedXdr),
      walletType: pollarClient.getWalletType(),
      openTransactionModal: () => setTransactionModalOpen(true),
      openLoginModal: () => setLoginModalOpen(true),
      openKycModal: (options = {}) => {
        setKycModalOptions(options);
        setKycModalOpen(true);
      },
      openRampWidget: () => setRampWidgetOpen(true),
      txHistory,
      openTxHistoryModal: () => setTxHistoryModalOpen(true),
      openWalletBalanceModal: () => setWalletBalanceModalOpen(true),
      walletBalance,
      refreshBalance: () => pollarClient.refreshBalance(),
      network: networkState.step === 'connected' ? networkState.network : 'testnet',
      setNetwork: (network: StellarNetwork) => pollarClient.setNetwork(network),
      config: remoteConfig,
      styles,
      ...(adapters !== undefined && { adapters }),
    }),
    [
      walletAddress,
      sessionState,
      remoteConfig,
      styles,
      pollarClient,
      transaction,
      txHistory,
      networkState,
      walletBalance,
      adapters,
    ],
  );

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
      {rampWidgetOpen && (
        <ModalErrorBoundary onClose={() => setRampWidgetOpen(false)}>
          <RampWidget onClose={() => setRampWidgetOpen(false)} />
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
