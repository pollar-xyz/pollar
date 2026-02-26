'use client';

import {
  isValidSession,
  pollarApiClient,
  PollarClient,
  PollarClientConfig,
  PollarLoginState,
  STATE_VAR_CODES,
  StateVar,
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

async function fetchRemoteConfig(): Promise<PollarConfig> {
  try {
    const { data, error } = await pollarApiClient.GET(`/config`);
    if (!data || error) {
      return emptyResponse;
    }
    return data.content;
  } catch {
    return emptyResponse;
  }
}

interface PollarContextValue {
  walletAddress: string;
  getClient: () => PollarClient;
  openLoginModal: () => void;
  isAuthenticated: boolean;
  config: PollarConfig;
  styles: PollarStyles;
}

const PollarContext = createContext<PollarContextValue | null>(null);

interface PollarProviderProps {
  config: PollarClientConfig;
  styles?: PollarStyles;
  children: ReactNode;
}

export function PollarProvider({ config, styles: propStyles, children }: PollarProviderProps) {
  const [pollarClient] = useState<PollarClient>(() => new PollarClient(config));
  const [state, setState] = useState<PollarLoginState | null>(null);
  const [remoteConfig, setRemoteConfig] = useState<PollarConfig>(emptyResponse);
  const [styles, setStyles] = useState<PollarStyles>(propStyles ?? {});

  useEffect(() => {
    return pollarClient.onStateChange((stateEntry) => {
      if (stateEntry.var === StateVar.WALLET_ADDRESS) {
        if (stateEntry.code === STATE_VAR_CODES[StateVar.WALLET_ADDRESS].UPDATED_ADDRESS && isValidSession(stateEntry.data)) {
          setState(stateEntry.data);
        }
      }
      if (
        (stateEntry.var === StateVar.WALLET_ADDRESS &&
          stateEntry.code === STATE_VAR_CODES[StateVar.WALLET_ADDRESS].REMOVED_ADDRESS) ||
        (stateEntry.var === StateVar.LOGIN && stateEntry.code === STATE_VAR_CODES[StateVar.LOGIN].LOGOUT)
      ) {
        setState(null);
      }
    });
  }, []);

  useEffect(() => {
    fetchRemoteConfig()
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
  }, []);

  const [modalOpen, setModalOpen] = useState(false);

  const contextValue: PollarContextValue = useMemo(
    () => ({
      walletAddress: state?.wallet?.publicKey || '',
      getClient: () => pollarClient,
      openLoginModal: () => setModalOpen(true),
      isAuthenticated: pollarClient.isAuthenticated(),
      config: remoteConfig,
      styles,
    }),
    [state, remoteConfig, styles, pollarClient],
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
