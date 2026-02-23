'use client';

import { PollarClient, PollarClientConfig, PollarState } from '@pollar/auth-core';
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LoginModal } from './LoginModal';

interface PollarContextValue {
  walletAddress: string;
  getClient: () => PollarClient;
  login: () => void;
  logout: () => void;
  status: PollarState['status'],
}

const PollarContext = createContext<PollarContextValue | null>(null);

interface PollarProviderProps {
  config: PollarClientConfig;
  children: ReactNode;
}

export function PollarProvider({ config, children }: PollarProviderProps) {
  const clientRef = useRef<PollarClient | null>(null);
  const [ state, setState ] = useState<PollarState | null>(null);
  if (clientRef.current === null) {
    clientRef.current = new PollarClient(config);
  }
  
  useEffect(() => {
    return clientRef.current?.onStateChange((state) => {
      setState(state);
    });
  }, []);
  
  const [ modalOpen, setModalOpen ] = useState(false);
  
  const contextValue: PollarContextValue = useMemo(() => ({
    walletAddress: state?.session?.wallet?.publicKey || '',
    getClient: () => clientRef.current!,
    login: () => setModalOpen(true),
    logout: () => clientRef.current?.logout(),
    status: state?.status || 'unauthenticated',
  }), [ state ]);
  
  return (
    <PollarContext.Provider value={contextValue}>
      {children}
      <LoginModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
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
