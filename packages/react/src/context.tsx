'use client';

import {
  NetworkState,
  PollarAdapters,
  PollarApplicationConfigContent,
  PollarClient,
  PollarClientConfig,
  PollarLoginOptions,
  StellarNetwork,
  TransactionState,
  TxBuildBody,
  TxHistoryState,
  WalletBalanceState,
  WalletType,
} from '@pollar/core';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ModalErrorBoundary } from './components/commons';
import { KycModal } from './components/kyc-modal/KycModal';
import { LoginModal } from './components/login-modal/LoginModal';
import { ReceiveModal } from './components/receive-modal/ReceiveModal';
import { RampWidget } from './components/ramp-widget/RampWidget';
import { SendModal } from './components/send-modal/SendModal';
import { TransactionModal } from './components/transaction-modal/TransactionModal';
import { TxHistoryModal } from './components/tx-history-modal/TxHistoryModal';
import { WalletBalanceModal } from './components/wallet-balance-modal/WalletBalanceModal';
import type { PollarConfig, PollarStyles } from './types';

const emptyResponse = {
  application: {
    name: '',
  },
  styles: {},
};

async function fetchRemoteConfig(client: PollarClient): Promise<PollarConfig> {
  const content = await client.getAppConfig();
  return (content as PollarConfig | null) ?? emptyResponse;
}

interface PollarContextValue {
  walletAddress: string;
  getClient: () => PollarClient;
  openLoginModal: () => void;

  isAuthenticated: boolean;
  login: (options: PollarLoginOptions) => void;
  logout: () => void;
  appConfig: PollarConfig;
  styles: PollarStyles;
  // transactions
  openTxModal: () => void;
  tx: TransactionState;
  buildTx: (
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ) => Promise<void>;
  signAndSubmitTx: (unsignedXdr: string) => Promise<void>;
  walletType: WalletType | null;
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
  // adapters
  adapters?: PollarAdapters;
}

const PollarContext = createContext<PollarContextValue | null>(null);

interface PollarProviderProps {
  config: PollarClientConfig;
  styles?: PollarStyles;
  adapters?: PollarAdapters;
  children: ReactNode;
}

export function PollarProvider({ config, styles: propStyles, adapters, children }: PollarProviderProps) {
  const [pollarClient] = useState<PollarClient>(() => new PollarClient(config));
  const [networkState, setNetworkState] = useState<NetworkState>(() => pollarClient.getNetworkState());
  const [sessionState, setSessionState] = useState<PollarApplicationConfigContent | null>(null);
  const [transaction, setTransaction] = useState<TransactionState>({ step: 'idle' });
  const [txHistory, setTxHistory] = useState<TxHistoryState>({ step: 'idle' });
  const [walletBalance, setWalletBalance] = useState<WalletBalanceState>({ step: 'idle' });
  const [remoteConfig, setRemoteConfig] = useState<PollarConfig>(emptyResponse);
  const [styles, setStyles] = useState<PollarStyles>(propStyles ?? {});

  const propStylesRef = useRef(propStyles);
  propStylesRef.current = propStyles;

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
        setSessionState((prev) => (JSON.stringify(prev) !== JSON.stringify(authState.session) ? authState.session : prev));
      } else if (authState.step === 'idle') {
        setSessionState(null);
      }
    });
  }, [pollarClient]);

  useEffect(() => {
    const propStyles = propStylesRef.current;
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

  const adaptersRef = useRef(adapters);
  adaptersRef.current = adapters;

  const walletAddress = sessionState?.data?.providers?.wallet?.address || sessionState?.wallet?.publicKey || '';
  const getClient = useCallback(() => pollarClient, [pollarClient]);
  const refreshWalletBalance = useCallback(() => pollarClient.refreshBalance(walletAddress), [pollarClient, walletAddress]);

  const contextValue: PollarContextValue = useMemo(
    () =>
      ({
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
        appConfig: remoteConfig,
        styles,
        adapters: adaptersRef.current,
      }) as PollarContextValue,
    [walletAddress, pollarClient, getClient, transaction, txHistory, walletBalance, refreshWalletBalance, networkState, remoteConfig, styles],
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
