import type { AuthSession, PollarClientConfig, LoginOptions } from '@pollar/auth-core';

export interface PollarStyles {
  theme?: 'light' | 'dark';
  accentColor?: string;
  logoBase64?: string;
  emailEnabled?: boolean;
  embeddedWallets?: boolean;
  providers?: {
    google?: boolean;
    discord?: boolean;
    x?: boolean;
    github?: boolean;
    apple?: boolean;
  };
}

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
