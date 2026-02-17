import type { AuthSession, PollarClientConfig, LoginOptions } from '@pollar/auth-core';

export interface AuthProviderProps {
  config: PollarClientConfig;
  children: React.ReactNode;
}

export interface AuthContextValue {
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (options: LoginOptions) => void;
  logout: () => Promise<void>;
}

export interface LoginButtonProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  className?: string;
  children?: React.ReactNode;
}

export interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}
