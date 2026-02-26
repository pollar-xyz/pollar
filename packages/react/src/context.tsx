'use client';

import { pollarApiClient, PollarClient, PollarClientConfig, PollarState } from '@pollar/core';
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  login: () => void;
  logout: () => void;
  status: PollarState['status'];
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
  const clientRef = useRef<PollarClient | null>(null);
  const [state, setState] = useState<PollarState | null>(null);
  const [remoteConfig, setRemoteConfig] = useState<PollarConfig>(emptyResponse);
  const [styles, setStyles] = useState<PollarStyles>(propStyles ?? {});

  if (clientRef.current === null) {
    clientRef.current = new PollarClient(config);
  }

  useEffect(() => {
    return clientRef.current?.onStateChange((state) => {
      console.log({ state });
      // setState(state);
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
      walletAddress: state?.session?.wallet?.publicKey || '',
      getClient: () => clientRef.current!,
      login: () => setModalOpen(true),
      logout: () => clientRef.current?.logout(),
      status: state?.status || 'unauthenticated',
      config: remoteConfig,
      styles,
    }),
    [state, remoteConfig, styles],
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
