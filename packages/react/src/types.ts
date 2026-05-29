import {
  AuthState,
  PollarApplicationConfigContent,
  PollarClientConfig,
  PollarLoginOptions,
  WalletId,
  pollarPaths,
} from '@pollar/core';
import type { ReactNode } from 'react';

type ConfigResponse = pollarPaths['/applications/config']['get']['responses'][200]['content']['application/json'];
export type PollarConfig = ConfigResponse['content'];

export type PollarStyles = PollarConfig['styles'];

/**
 * Props passed by `@pollar/react` to a `renderWallets` slot. External wallet
 * picker components receive these and call `onConnect(id)` when the user picks
 * a wallet; `@pollar/react` wraps that into `client.loginWallet(id)`.
 */
export interface RenderWalletsProps {
  /** Wrapper around `client.loginWallet(id)`. */
  onConnect: (id: WalletId) => void;
  /** Current auth state — picker can disable buttons / surface loading. */
  authState: AuthState;
}

/**
 * Signature for the `ui.renderWallets` slot on `<PollarProvider>`. When
 * provided, replaces the default Freighter/Albedo buttons in the LoginModal
 * with whatever the slot returns (typically a kit-powered wallet grid).
 */
export type RenderWalletsSlot = (props: RenderWalletsProps) => ReactNode;

export interface AuthProviderProps {
  config: PollarClientConfig;
  children: React.ReactNode;
}

export interface AuthContextValue {
  session: PollarApplicationConfigContent | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (options: PollarLoginOptions) => void;
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
