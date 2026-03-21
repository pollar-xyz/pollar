'use client';

import {
  PollarApiClient,
  PollarApplicationConfigContent,
  PollarClient,
  PollarClientConfig,
  PollarLoginOptions,
  PollarStateEntry,
  PollarStateVar,
  STATE_VAR_CODES,
  StateStatus,
  StellarClient,
  TxBuildBody,
} from '@pollar/core';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ModalErrorBoundary } from './components/commons';
import { LoginModal } from './components/login-modal/LoginModal';
import { TransactionModal } from './components/transaction-modal/TransactionModal';
import type { PollarConfig, PollarStyles } from './types';

const emptyResponse = {
  application: {
    name: '',
  },
  styles: {},
};

async function fetchRemoteConfig(api: PollarApiClient): Promise<PollarConfig> {
  try {
    const { data, error } = await api.GET(`/applications/config`);
    if (!data || error) {
      return emptyResponse;
    }
    return data.content;
  } catch {
    return emptyResponse;
  }
}

type PollarState = { [key in PollarStateVar]: PollarStateEntry };

interface PollarContextValue {
  walletAddress: string;
  getClient: () => PollarClient;
  openLoginModal: () => void;
  sendTransaction: (
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ) => void;
  openTransactionModal: () => void;
  isAuthenticated: boolean;
  login: (options: PollarLoginOptions) => void;
  logout: () => void;
  config: PollarConfig;
  styles: PollarStyles;
  state: PollarState;
  // stellar
  getBalance: (publicKey?: string) => any;
  buildTx: (
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ) => Promise<void>;
  submitTx: (signedXdr: string) => Promise<void>;
}

const PollarContext = createContext<PollarContextValue | null>(null);

interface PollarProviderProps {
  config: PollarClientConfig;
  styles?: PollarStyles;
  children: ReactNode;
}

export function PollarProvider({ config, styles: propStyles, children }: PollarProviderProps) {
  const [pollarClient] = useState<PollarClient>(() => new PollarClient(config));
  const [stellarClient] = useState<StellarClient>(() => new StellarClient(config.stellarNetwork || 'testnet'));
  const [sessionState, setSessionState] = useState<PollarApplicationConfigContent | null>(null);
  const [state, setState] = useState<PollarState>({
    network: {
      var: 'network',
      code: STATE_VAR_CODES.network.NONE,
      status: StateStatus.NONE,
      level: 'info',
      ts: 0,
    },
    transaction: {
      var: 'transaction',
      code: STATE_VAR_CODES.transaction.NONE,
      status: StateStatus.NONE,
      level: 'info',
      ts: 0,
    },
  });
  const [remoteConfig, setRemoteConfig] = useState<PollarConfig>(emptyResponse);
  const [styles, setStyles] = useState<PollarStyles>(propStyles ?? {});

  useEffect(() => {
    return pollarClient.onStateChange((stateEntry) => {
      setState((prevState) => {
        if (JSON.stringify(prevState[stateEntry.var]) !== JSON.stringify(stateEntry)) {
          return { ...prevState, [stateEntry.var]: stateEntry };
        }
        return prevState;
      });
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
    fetchRemoteConfig(pollarClient.getApi())
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

  const contextValue: PollarContextValue = useMemo(
    () =>
      ({
        walletAddress: sessionState?.wallet?.publicKey || '',
        getClient: () => pollarClient,
        state,
        login: (options: PollarLoginOptions) => pollarClient.login(options),
        logout: () => pollarClient.logout(),
        isAuthenticated: pollarClient.isAuthenticated(),
        buildTx: (operation, params, options) => pollarClient.buildTx(operation, params, options),
        submitTx: (signedXdr: string) => pollarClient.submitTx(signedXdr),
        sendTransaction: (operation, params, options) => {
          void pollarClient.buildTx(operation, params, options);
          setTransactionModalOpen(true);
        },
        openTransactionModal: () => setTransactionModalOpen(true),
        openLoginModal: () => setLoginModalOpen(true),
        config: remoteConfig,
        styles,
        async getBalance(publicKey?: string) {
          const pk = publicKey || sessionState?.wallet?.publicKey;
          if (pk) {
            return await stellarClient.getBalances(pk);
          }
          return { success: false, errorCode: 'NO_WALLET_FOUND', balances: [] };
        },
      }) as PollarContextValue,
    [sessionState, remoteConfig, styles, pollarClient, state],
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
