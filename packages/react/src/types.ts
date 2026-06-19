import { AuthState, WalletId, pollarPaths } from '@pollar/core';
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

/**
 * Presentation metadata for a custom login provider button in the LoginModal
 * (e.g. Privy, Magic). Pairs with a {@link PollarAuthProvider} registered on the
 * client via its `providers` config: clicking the button calls
 * `client.login({ provider: id })`, and the provider opens its own UI.
 *
 * Logic (the actual login) lives in the `PollarAuthProvider`; this is only the
 * button's look. Keeping them separate means React never needs to know how a
 * provider authenticates.
 */
export interface CustomLoginProvider {
  /** Must match the `id` of a registered `PollarAuthProvider`. */
  id: string;
  /** Button label, e.g. "Continue with Privy". */
  label: string;
  /** Optional icon URL rendered in the button. */
  iconUrl?: string;
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
