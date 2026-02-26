import { LoginOptions, PollarClientConfig, PollarLogin, pollarPaths } from '@pollar/core';

type ConfigResponse =
  pollarPaths['/config']['get']['responses'][200]['content']['application/json'];
export type PollarConfig = ConfigResponse['content'];

export type PollarStyles = PollarConfig['styles'];

export interface AuthProviderProps {
  config: PollarClientConfig;
  children: React.ReactNode;
}

export interface AuthContextValue {
  session: PollarLogin | null;
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
