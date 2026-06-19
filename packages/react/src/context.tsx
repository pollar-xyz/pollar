'use client';

import {
  BuildOutcome,
  EnabledAssetsState,
  NetworkState,
  OnStorageDegrade,
  PollarAdapters,
  PollarClient,
  PollarClientConfig,
  PollarLoginOptions,
  PollarPersistedSession,
  SessionsState,
  SignOutcome,
  StellarNetwork,
  SubmitOutcome,
  TrustlineOutcome,
  TransactionState,
  TxBuildBody,
  TxHistoryState,
  WalletBalanceState,
  WalletInfo,
} from '@pollar/core';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ModalErrorBoundary, setModalErrorLogger } from './components/commons';
import { DistributionRulesModal } from './components/distribution-rules-modal/DistributionRulesModal';
import { EnabledAssetsModal } from './components/enabled-assets-modal/EnabledAssetsModal';
import { KycModal } from './components/kyc-modal/KycModal';
import { LoginModal } from './components/login-modal/LoginModal';
import { RampWidget } from './components/ramp-widget/RampWidget';
import { ReceiveModal } from './components/receive-modal/ReceiveModal';
import { SendModal } from './components/send-modal/SendModal';
import { SessionsModal } from './components/sessions-modal/SessionsModal';
import { TransactionModal } from './components/transaction-modal/TransactionModal';
import { TxHistoryModal } from './components/tx-history-modal/TxHistoryModal';
import { WalletBalanceModal } from './components/wallet-balance-modal/WalletBalanceModal';
import { browserPasskeyCeremony, browserPasskeySigner } from './lib/passkey-ceremony';
import type { CustomLoginProvider, PollarConfig, PollarStyles, RenderWalletsSlot } from './types';

const DEFAULT_APP_CONFIG: PollarConfig = {
  application: { name: '' },
  styles: {},
};

/**
 * Compares the fields of a persisted session that actually drive UI re-renders.
 * Replaces a per-listener `JSON.stringify(...) !== JSON.stringify(...)` call —
 * cheaper, allocation-free, and explicit about what counts as "changed".
 *
 * If a field is added to `PollarPersistedSession` that consumers read through
 * context, list it here too.
 */
function sessionsEqual(a: PollarPersistedSession | null, b: PollarPersistedSession | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.clientSessionId === b.clientSessionId &&
    a.userId === b.userId &&
    a.status === b.status &&
    a.token?.accessToken === b.token?.accessToken &&
    a.token?.refreshToken === b.token?.refreshToken &&
    a.token?.expiresAt === b.token?.expiresAt &&
    a.wallet?.address === b.wallet?.address
  );
}

interface PollarContextValue {
  /**
   * The authenticated user's wallet as a discriminated union over `custody`
   * (`internal` | `smart` | `external`), or `null` when unauthenticated. Every
   * field is meaningful for any login method — `custody` is always present and
   * strictly determines the shape of `provider`. Use `wallet.address` for the
   * on-chain address and `wallet.provider` for the wallet/login provider.
   */
  wallet: WalletInfo | null;
  getClient: () => PollarClient;
  openLoginModal: () => void;

  isAuthenticated: boolean;
  /**
   * `true` once the server has confirmed the session (login / refresh /
   * `/auth/session/resume`). `false` while a cold-start session is still
   * optimistic — gate sensitive actions (e.g. signing) on this.
   */
  verified: boolean;
  login: (options: PollarLoginOptions) => void;
  logout: () => void;
  // sessions
  sessions: SessionsState;
  /** Open the active-sessions modal. */
  openSessionsModal: () => void;
  appConfig: PollarConfig;
  styles: PollarStyles;
  /** UI slot for wallet picker (forwarded from provider props). */
  renderWallets?: RenderWalletsSlot;
  /** Custom login provider buttons (forwarded from `ui.customProviders`). */
  customProviders?: CustomLoginProvider[];
  // transactions
  openTxModal: () => void;
  tx: TransactionState;
  buildTx: (
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ) => Promise<BuildOutcome>;
  signAndSubmitTx: (unsignedXdr?: string) => Promise<SubmitOutcome>;
  /** External-wallet only. Custodial flows should use `signAndSubmitTx`. */
  signTx: (unsignedXdr: string) => Promise<SignOutcome>;
  submitTx: (signedXdr: string) => Promise<SubmitOutcome>;
  /** One-shot: build → sign → submit. Drives the same TransactionState flow as the split calls. */
  buildAndSignAndSubmitTx: (
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ) => Promise<SubmitOutcome>;
  /** Alias of `buildAndSignAndSubmitTx`. */
  runTx: (
    operation: TxBuildBody['operation'],
    params: TxBuildBody['params'],
    options?: TxBuildBody['options'],
  ) => Promise<SubmitOutcome>;
  // network
  network: StellarNetwork;
  setNetwork: (network: StellarNetwork) => void;
  // wallet balance
  walletBalance: WalletBalanceState;
  refreshWalletBalance: () => Promise<void>;
  // enabled assets
  /**
   * The application's dashboard-enabled assets paired with the authenticated
   * wallet's on-chain trustline state (`trustlineEstablished` per asset). Driven
   * by {@link refreshAssets}; mirrors {@link walletBalance}.
   */
  enabledAssets: EnabledAssetsState;
  refreshAssets: () => Promise<void>;
  /**
   * Establishes (omit `limit`) or removes (`limit: '0'`) a trustline for an
   * asset. Pass the asset's `sponsored` flag so the app covers the reserve + fee
   * when eligible; otherwise the user's own wallet pays. Mirrors
   * {@link PollarClient.setTrustline}.
   */
  setTrustline: (
    asset: { code: string; issuer: string },
    opts?: { limit?: string; sponsored?: boolean },
  ) => Promise<TrustlineOutcome>;
  /** Open the enabled-assets / trustline-state modal. */
  openEnabledAssetsModal: () => void;
  // kyc
  openKycModal: (options?: {
    country?: string;
    level?: 'basic' | 'intermediate' | 'enhanced';
    onApproved?: () => void;
  }) => void;
  // ramps
  openRampModal: () => void;
  // tx history
  txHistory: TxHistoryState;
  openTxHistoryModal: () => void;
  // wallet balance modal
  openWalletBalanceModal: () => void;
  // send / receive
  openSendModal: () => void;
  openReceiveModal: () => void;
  // distribution
  openDistributionRulesModal: () => void;
  // adapters
  adapters?: PollarAdapters;
}

const PollarContext = createContext<PollarContextValue | null>(null);

interface PollarProviderProps {
  /**
   * Either a pre-built `PollarClient` instance (useful for testing or for
   * reusing the same client outside React) or a `PollarClientConfig` that the
   * provider will use to construct one on mount.
   *
   * The client is locked at first render: changing this prop afterwards is
   * ignored. To swap clients, unmount and remount the provider.
   */
  client: PollarClient | PollarClientConfig;
  /**
   * Local override of the `/applications/config` response. If provided (even
   * `{}`), the remote fetch is skipped and missing fields fall back to the
   * defaults in `LoginModalTemplate`. If `undefined`, the SDK fetches
   * `/applications/config` on mount.
   */
  appConfig?: PollarConfig;
  /** UI customization slots. */
  ui?: {
    /** Replaces the default Freighter/Albedo wallet picker. */
    renderWallets?: RenderWalletsSlot;
    /**
     * Custom login provider buttons (e.g. Privy) shown in the LoginModal. Each
     * must match a {@link PollarAuthProvider} registered on the client; clicking
     * one calls `client.login({ provider: id })` and the provider opens its own UI.
     */
    customProviders?: CustomLoginProvider[];
  };
  adapters?: PollarAdapters;
  /**
   * Notified when persistent storage silently degrades to in-memory mode
   * (Safari private browsing quota errors, sandboxed iframes, etc.). Use this
   * to surface a UI hint that the session won't survive a reload, log to
   * telemetry, or fall back to a different storage strategy.
   *
   * Fires at most once per provider lifetime; late mounts get the latched
   * state replayed on subscribe.
   */
  onStorageDegrade?: OnStorageDegrade;
  children: ReactNode;
}

export function PollarProvider({
  client,
  appConfig: appConfigProp,
  ui,
  adapters,
  onStorageDegrade,
  children,
}: PollarProviderProps) {
  // When the consumer passes a config (not a ready client), inject the browser
  // passkey ceremony so `loginSmartWallet()` works out of the box on web. The
  // consumer can override it (e.g. a React Native native provider) via
  // `client.passkey`.
  const [pollarClient] = useState<PollarClient>(() =>
    client instanceof PollarClient
      ? client
      : new PollarClient({ passkey: browserPasskeyCeremony, passkeySign: browserPasskeySigner, ...client }),
  );
  const [networkState, setNetworkState] = useState<NetworkState>(() => pollarClient.getNetworkState());
  const [sessionState, setSessionState] = useState<PollarPersistedSession | null>(null);
  // `true` once the server has confirmed the restored session (via login,
  // refresh, or `/auth/session/resume`). Use it to gate sensitive actions
  // while a cold-start session is still optimistic.
  const [verified, setVerified] = useState(false);
  const [transaction, setTransaction] = useState<TransactionState>({ step: 'idle' });
  const [txHistory, setTxHistory] = useState<TxHistoryState>({ step: 'idle' });
  const [sessions, setSessions] = useState<SessionsState>({ step: 'idle' });
  const [walletBalance, setWalletBalance] = useState<WalletBalanceState>({ step: 'idle' });
  const [enabledAssets, setEnabledAssets] = useState<EnabledAssetsState>({ step: 'idle' });
  const [resolvedConfig, setResolvedConfig] = useState<PollarConfig>(() => appConfigProp ?? DEFAULT_APP_CONFIG);

  useEffect(() => {
    return pollarClient.onTransactionStateChange(setTransaction);
  }, [pollarClient]);

  useEffect(() => {
    return pollarClient.onTxHistoryStateChange(setTxHistory);
  }, [pollarClient]);

  useEffect(() => {
    return pollarClient.onSessionsStateChange(setSessions);
  }, [pollarClient]);

  useEffect(() => {
    return pollarClient.onWalletBalanceStateChange(setWalletBalance);
  }, [pollarClient]);

  useEffect(() => {
    return pollarClient.onEnabledAssetsStateChange(setEnabledAssets);
  }, [pollarClient]);

  useEffect(() => {
    return pollarClient.onNetworkStateChange((state) => {
      setNetworkState(state);
    });
  }, [pollarClient]);

  useEffect(() => {
    if (!onStorageDegrade) return;
    return pollarClient.onStorageDegrade(onStorageDegrade);
  }, [pollarClient, onStorageDegrade]);

  useEffect(() => {
    return pollarClient.onAuthStateChange((authState) => {
      if (authState.step === 'authenticated') {
        setSessionState((prev) => (sessionsEqual(prev, authState.session) ? prev : authState.session));
        // The session object is identical between the optimistic restore and
        // the post-resume confirmation, so `verified` is tracked separately —
        // otherwise the sessionsEqual short-circuit would swallow the flip.
        setVerified(authState.verified);
      } else if (authState.step === 'idle') {
        setSessionState(null);
        setVerified(false);
      }
    });
  }, [pollarClient]);

  // Presence of `appConfig` is the opt-out: if the consumer passes it (even
  // `{}`), we trust them and skip the remote fetch.
  // Route the modal error boundary's logs through the client's level-gated
  // logger (it's a class component that can't read context directly).
  useEffect(() => {
    setModalErrorLogger(pollarClient.getLogger());
  }, [pollarClient]);

  useEffect(() => {
    if (appConfigProp !== undefined) return;
    let cancelled = false;
    pollarClient
      .getAppConfig()
      .then((fetched) => {
        if (cancelled || !fetched) return;
        setResolvedConfig(fetched as PollarConfig);
      })
      .catch((err) => {
        pollarClient.getLogger().error('[PollarProvider] getAppConfig failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [pollarClient, appConfigProp]);

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [kycModalOptions, setKycModalOptions] = useState<{
    country?: string;
    level?: 'basic' | 'intermediate' | 'enhanced';
    onApproved?: () => void;
  }>({});
  const [rampModalOpen, setRampModalOpen] = useState(false);
  const [txHistoryModalOpen, setTxHistoryModalOpen] = useState(false);
  const [walletBalanceModalOpen, setWalletBalanceModalOpen] = useState(false);
  const [enabledAssetsModalOpen, setEnabledAssetsModalOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);
  const [distributionRulesModalOpen, setDistributionRulesModalOpen] = useState(false);

  // PII (incl. providers.wallet.address) lives on `client.getUserProfile()`, not on the
  // persisted session. For every wallet type, `wallet.address` holds the on-chain
  // address we care about.
  const walletAddress = sessionState?.wallet?.address || '';
  const getClient = useCallback(() => pollarClient, [pollarClient]);
  // refreshBalance resolves the own wallet server-side from the session;
  // walletAddress stays in deps so the callback re-binds when the wallet changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- walletAddress is an intentional re-bind trigger, not read in the body
  const refreshWalletBalance = useCallback(() => pollarClient.refreshBalance(), [pollarClient, walletAddress]);
  // refreshAssets resolves the own wallet server-side from the session;
  // walletAddress stays in deps so the callback re-binds when the wallet changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- walletAddress is an intentional re-bind trigger, not read in the body
  const refreshAssets = useCallback(() => pollarClient.refreshAssets(), [pollarClient, walletAddress]);

  const renderWallets = ui?.renderWallets;
  const customProviders = ui?.customProviders;

  const contextValue: PollarContextValue = useMemo(() => {
    const styles: PollarStyles = resolvedConfig.styles ?? {};
    return {
      // session
      wallet: pollarClient.getWallet(),
      isAuthenticated: !!walletAddress,
      verified,
      // client
      getClient,
      // auth
      login: (options: PollarLoginOptions) => pollarClient.login(options),
      logout: () => pollarClient.logout(),
      openLoginModal: () => setLoginModalOpen(true),
      // transactions
      tx: transaction,
      buildTx: (operation, params, options) => pollarClient.buildTx(operation, params, options),
      signAndSubmitTx: (unsignedXdr?: string) => pollarClient.signAndSubmitTx(unsignedXdr),
      signTx: (unsignedXdr: string) => pollarClient.signTx(unsignedXdr),
      submitTx: (signedXdr: string) => pollarClient.submitTx(signedXdr),
      buildAndSignAndSubmitTx: (operation, params, options) => pollarClient.buildAndSignAndSubmitTx(operation, params, options),
      runTx: (operation, params, options) => pollarClient.runTx(operation, params, options),
      openTxModal: () => setTransactionModalOpen(true),
      // tx history
      txHistory,
      openTxHistoryModal: () => setTxHistoryModalOpen(true),
      // wallet balance
      walletBalance,
      refreshWalletBalance,
      openWalletBalanceModal: () => setWalletBalanceModalOpen(true),
      // enabled assets
      enabledAssets,
      refreshAssets,
      setTrustline: (asset, opts) => pollarClient.setTrustline(asset, opts),
      openEnabledAssetsModal: () => setEnabledAssetsModalOpen(true),
      // send / receive
      openSendModal: () => setSendModalOpen(true),
      openReceiveModal: () => setReceiveModalOpen(true),
      // sessions
      sessions,
      openSessionsModal: () => setSessionsModalOpen(true),
      // distribution
      openDistributionRulesModal: () => setDistributionRulesModalOpen(true),
      // network
      network: networkState.step === 'connected' ? networkState.network : 'testnet',
      setNetwork: (network: StellarNetwork) => pollarClient.setNetwork(network),
      // kyc
      openKycModal: (options = {}) => {
        setKycModalOptions(options);
        setKycModalOpen(true);
      },
      // ramp
      openRampModal: () => setRampModalOpen(true),
      // config
      appConfig: resolvedConfig,
      styles,
      renderWallets,
      customProviders,
      adapters,
    } as PollarContextValue;
  }, [
    walletAddress,
    verified,
    pollarClient,
    getClient,
    transaction,
    txHistory,
    sessions,
    walletBalance,
    refreshWalletBalance,
    enabledAssets,
    refreshAssets,
    networkState,
    resolvedConfig,
    adapters,
    renderWallets,
    customProviders,
  ]);

  return (
    <PollarContext.Provider value={contextValue}>
      {children}
      {loginModalOpen && (
        <ModalErrorBoundary onClose={() => setLoginModalOpen(false)}>
          <LoginModal onClose={() => setLoginModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {transactionModalOpen && (
        <ModalErrorBoundary onClose={() => setTransactionModalOpen(false)}>
          <TransactionModal onClose={() => setTransactionModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {kycModalOpen && (
        <ModalErrorBoundary onClose={() => setKycModalOpen(false)}>
          <KycModal
            onClose={() => setKycModalOpen(false)}
            {...(kycModalOptions.country !== undefined && { country: kycModalOptions.country })}
            {...(kycModalOptions.level !== undefined && { level: kycModalOptions.level })}
            {...(kycModalOptions.onApproved !== undefined && { onApproved: kycModalOptions.onApproved })}
          />
        </ModalErrorBoundary>
      )}
      {rampModalOpen && (
        <ModalErrorBoundary onClose={() => setRampModalOpen(false)}>
          <RampWidget onClose={() => setRampModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {txHistoryModalOpen && (
        <ModalErrorBoundary onClose={() => setTxHistoryModalOpen(false)}>
          <TxHistoryModal onClose={() => setTxHistoryModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {walletBalanceModalOpen && (
        <ModalErrorBoundary onClose={() => setWalletBalanceModalOpen(false)}>
          <WalletBalanceModal onClose={() => setWalletBalanceModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {enabledAssetsModalOpen && (
        <ModalErrorBoundary onClose={() => setEnabledAssetsModalOpen(false)}>
          <EnabledAssetsModal onClose={() => setEnabledAssetsModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {sendModalOpen && (
        <ModalErrorBoundary onClose={() => setSendModalOpen(false)}>
          <SendModal onClose={() => setSendModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {receiveModalOpen && (
        <ModalErrorBoundary onClose={() => setReceiveModalOpen(false)}>
          <ReceiveModal onClose={() => setReceiveModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {sessionsModalOpen && (
        <ModalErrorBoundary onClose={() => setSessionsModalOpen(false)}>
          <SessionsModal onClose={() => setSessionsModalOpen(false)} />
        </ModalErrorBoundary>
      )}
      {distributionRulesModalOpen && (
        <ModalErrorBoundary onClose={() => setDistributionRulesModalOpen(false)}>
          <DistributionRulesModal onClose={() => setDistributionRulesModalOpen(false)} />
        </ModalErrorBoundary>
      )}
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
