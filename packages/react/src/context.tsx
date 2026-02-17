import React, { createContext, useContext, useMemo, useState } from 'react';
import { PollarClient } from '@pollar/auth-core';
import type { AuthSession, LoginOptions } from '@pollar/auth-core';
import type { AuthContextValue, AuthProviderProps } from './types';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ config, children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const client = useMemo(() => new PollarClient(config), [config.baseUrl]);

  const handleLogin = (options: LoginOptions) => {
    client.login(options);
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      // TODO: call logout(client) from @pollar/auth-core
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        isAuthenticated: session !== null,
        login: handleLogin,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
