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
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ModalErrorBoundary } from './components/commons';
import { KycModal } from './components/kyc-modal/KycModal';
import { LoginModal } from './components/login-modal/LoginModal';
import { RampWidget } from './components/ramp-widget/RampWidget';
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
  config: PollarConfig;
  styles: PollarStyles;
  // transactions
  openTransactionModal: () => void;
  transaction: TransactionState;
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
  refreshBalance: (publicKey?: string) => Promise<void>;
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

  const contextValue: PollarContextValue = useMemo(
    () =>
      ({
        walletAddress: sessionState?.data?.providers?.wallet?.address || sessionState?.wallet?.publicKey || '',
        getClient: () => pollarClient,
        transaction,
        login: (options: PollarLoginOptions) => pollarClient.login(options),
        logout: () => pollarClient.logout(),
        isAuthenticated: !!sessionState?.wallet?.publicKey,
        buildTx: (operation, params, options) => pollarClient.buildTx(operation, params, options),
        signAndSubmitTx: (unsignedXdr: string) => pollarClient.signAndSubmitTx(unsignedXdr),
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
        refreshBalance: (publicKey?: string) => pollarClient.refreshBalance(publicKey),
        network: networkState.step === 'connected' ? networkState.network : 'testnet',
        setNetwork: (network: StellarNetwork) => pollarClient.setNetwork(network),
        config: remoteConfig,
        styles,
        adapters,
      }) as PollarContextValue,
    [sessionState, remoteConfig, styles, pollarClient, transaction, txHistory, networkState, walletBalance],
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
