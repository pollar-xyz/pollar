'use client';

import {
  isValidSession,
  PollarApiClient,
  PollarClient,
  PollarClientConfig,
  PollarLoginOptions,
  PollarLoginState,
  PollarStateEntry,
  PollarStateVar,
  STATE_VAR_CODES,
  StateStatus,
  StellarClient,
} from '@pollar/core';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { LoginModal } from './components/login-modal/LoginModal';
import type { PollarConfig, PollarStyles } from './types';

const emptyResponse = {
  application: {
    name: '',
  },
  styles: {},
};

async function fetchRemoteConfig(api: PollarApiClient): Promise<PollarConfig> {
  try {
    const { data, error } = await api.GET(`/config`);
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
  isAuthenticated: boolean;
  login: (options: PollarLoginOptions) => void;
  logout: () => void;
  config: PollarConfig;
  styles: PollarStyles;
  state: PollarState;
  // stellar
  getBalance: (publicKey?: string) => any;
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
  const [sessionState, setSessionState] = useState<PollarLoginState | null>(null);
  const [state, setState] = useState<PollarState>({
    [PollarStateVar.LOGIN]: {
      var: PollarStateVar.LOGIN,
      code: STATE_VAR_CODES[PollarStateVar.LOGIN].NONE,
      status: StateStatus.NONE,
      level: 'info',
      ts: 0,
    },
    [PollarStateVar.WALLET_ADDRESS]: {
      var: PollarStateVar.WALLET_ADDRESS,
      code: STATE_VAR_CODES[PollarStateVar.WALLET_ADDRESS].NONE,
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
          return {
            ...prevState,
            [stateEntry.var]: stateEntry,
          };
        }
        return prevState;
      });
      if (stateEntry.var === PollarStateVar.WALLET_ADDRESS) {
        if (
          stateEntry.code === STATE_VAR_CODES[PollarStateVar.WALLET_ADDRESS].UPDATED_ADDRESS &&
          isValidSession(stateEntry.data)
        ) {
          setSessionState((prevState) => {
            if (JSON.stringify(prevState) !== JSON.stringify(stateEntry.data)) {
              return stateEntry.data as PollarLoginState;
            }
            return prevState;
          });
        }
      }
      if (
        (stateEntry.var === PollarStateVar.WALLET_ADDRESS &&
          stateEntry.code === STATE_VAR_CODES[PollarStateVar.WALLET_ADDRESS].REMOVED_ADDRESS) ||
        (stateEntry.var === PollarStateVar.LOGIN && stateEntry.code === STATE_VAR_CODES[PollarStateVar.LOGIN].LOGOUT)
      ) {
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

  const [modalOpen, setModalOpen] = useState(false);

  const contextValue: PollarContextValue = useMemo(
    () => ({
      walletAddress: sessionState?.wallet?.publicKey || '',
      getClient: () => pollarClient,
      openLoginModal: () => setModalOpen(true),
      isAuthenticated: pollarClient.isAuthenticated(),
      login: (options: PollarLoginOptions) => pollarClient.login(options),
      logout: () => pollarClient.logout(),
      config: remoteConfig,
      state,
      styles,
      async getBalance(publicKey?: string) {
        const pk = publicKey || sessionState?.wallet?.publicKey;
        if (pk) {
          return stellarClient.getBalances(pk);
        }
        return null;
      },
    }),
    [sessionState, remoteConfig, styles, pollarClient, state],
  );

  return (
    <PollarContext.Provider value={contextValue}>
      {children}
      {modalOpen && <LoginModal onClose={() => setModalOpen(false)} />}
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
