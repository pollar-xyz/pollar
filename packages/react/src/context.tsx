'use client';

import { PollarClient, PollarClientConfig, PollarState } from '@pollar/core';
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LoginModal } from './LoginModal';
import type { PollarStyles } from './types';

async function fetchRemoteStyles(baseUrl: string, apiKey: string): Promise<PollarStyles> {
  const res = await fetch(`${baseUrl}/v1/styles`, {
    headers: { 'x-polo-api-key': apiKey },
  });
  if (!res.ok) return {};
  const body = (await res.json()) as { content?: PollarStyles };
  return body.content ?? {};
}

interface PollarContextValue {
  walletAddress: string;
  getClient: () => PollarClient;
  login: () => void;
  logout: () => void;
  status: PollarState['status'];
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
  const [styles, setStyles] = useState<PollarStyles>(propStyles ?? {});

  if (clientRef.current === null) {
    clientRef.current = new PollarClient(config);
  }

  useEffect(() => {
    return clientRef.current?.onStateChange((state) => {
      setState(state);
    });
  }, []);

  useEffect(() => {
    fetchRemoteStyles(config.baseUrl, config.apiKey)
      .then((fetched) => {
        setStyles({
          ...fetched,
          ...propStyles,
          providers: { ...fetched.providers, ...propStyles?.providers },
        });
      })
      .catch(() => {
        setStyles(propStyles ?? {});
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [modalOpen, setModalOpen] = useState(false);

  const contextValue: PollarContextValue = useMemo(
    () => ({
      walletAddress: state?.session?.wallet?.publicKey || '',
      getClient: () => clientRef.current!,
      login: () => setModalOpen(true),
      logout: () => clientRef.current?.logout(),
      status: state?.status || 'unauthenticated',
      styles,
    }),
    [state, styles],
  );

  return (
    <PollarContext.Provider value={contextValue}>
      {children}
      <LoginModal open={modalOpen} onClose={() => setModalOpen(false)} />
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
