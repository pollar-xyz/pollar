import { AuthState, WalletId, pollarPaths } from '@pollar/core';
import type { ReactNode } from 'react';

type ConfigResponse = pollarPaths['/applications/config']['get']['responses'][200]['content']['application/json'];
export type PollarConfig = ConfigResponse['content'];

export type PollarStyles = PollarConfig['styles'];

/**
 * Props passed by `@pollar/react` to a `renderWallets` slot. External wallet
 * picker components receive these and call `onConnect(id)` when the user picks
 * a wallet; `@pollar/react` wraps that into `client.login({ provider: id })`.
 */
export interface RenderWalletsProps {
  /** Wrapper around `client.login({ provider: id })`. */
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
