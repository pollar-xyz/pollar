'use client';

import {
  AUTH_ERROR_CODES,
  AuthState,
  InteractiveAuthAdapter,
  isInteractiveAuthAdapter,
  PollarLoginOptions,
  WalletId,
} from '@pollar/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { LoginModalTemplate } from './LoginModalTemplate';
import { PrivyLoginSubmodal } from './PrivyLoginSubmodal';
import '../shared.css';
import './LoginModal.css';

type TimeoutHandle = ReturnType<typeof setTimeout>;

interface LoginModalProps {
  onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const { getClient, styles, appConfig: config } = usePollar();
  const [authState, setAuthState] = useState<AuthState>(() => getClient().getAuthState());
  // Registered wallet adapters (built-ins + config) → one login button each.
  const walletAdapters = useMemo(() => getClient().listWalletAdapters(), [getClient]);
  const [codeInputKey, setCodeInputKey] = useState(0);
  const pendingEmail = useRef<string | null>(null);
  // When set, an interactive adapter (e.g. Privy) takes over the modal with its
  // own login sub-view instead of going straight to login({ provider }).
  const [interactiveAdapter, setInteractiveAdapter] = useState<InteractiveAuthAdapter | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const autoCloseTimer = useRef<TimeoutHandle | null>(null);

  useEffect(() => {
    const unsubscribe = getClient().onAuthStateChange((next) => {
      setAuthState(next);
      if (next.step === 'entering_email' && pendingEmail.current) {
        getClient().sendEmailCode(pendingEmail.current);
        pendingEmail.current = null;
      }
      if (next.step === 'error' && next.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_INVALID) {
        setCodeInputKey((k) => k + 1);
      }
      if (next.step === 'authenticated') {
        // Clear any timer already pending — if `authenticated` fires more than
        // once, overwriting the handle would orphan the previous timeout
        // (cleanup only tracks the latest).
        if (autoCloseTimer.current !== null) {
          clearTimeout(autoCloseTimer.current);
        }
        autoCloseTimer.current = setTimeout(() => {
          autoCloseTimer.current = null;
          onCloseRef.current();
        }, 1000);
      }
    });
    return () => {
      unsubscribe();
      if (autoCloseTimer.current !== null) {
        clearTimeout(autoCloseTimer.current);
        autoCloseTimer.current = null;
      }
    };
  }, [getClient]);

  const { theme = 'light', accentColor = '#005DB4', logoUrl, emailEnabled, embeddedWallets, smartWallet, providers } = styles;
  // Opt-in: the Smart Wallet (passkey) option only shows when the dashboard
  // explicitly enables it. Absent → hidden.
  const smartWalletEnabled = smartWallet ?? false;

  function handleClose() {
    setEmail('');
    getClient().cancelLogin();
    onClose();
  }

  function handleEmailSubmit() {
    if (!email) return;
    pendingEmail.current = email;
    getClient().beginEmailLogin();
  }

  function handleSocialLogin(provider: 'google' | 'github') {
    getClient().login({ provider });
  }

  function handleWalletConnect(type: WalletId) {
    // Interactive adapters (e.g. Privy) drive their own multi-step login that we
    // render as a sub-modal; open it instead of going straight to login().
    const adapter = getClient().getWalletAdapter(type);
    if (isInteractiveAuthAdapter(adapter)) {
      setInteractiveAdapter(adapter);
      return;
    }
    // Any other registered wallet adapter (freighter/albedo/swk…). The adapter
    // opens its own connect/auth UI; the SDK wraps the generic SEP-10 flow.
    getClient().login({ provider: type } as PollarLoginOptions);
  }

  function handleLoginSmartWallet() {
    getClient().loginSmartWallet();
  }

  function handleCreateSmartWallet() {
    getClient().createSmartWallet();
  }

  function handleVerifyCode(code: string) {
    getClient().verifyEmailCode(code);
  }

  function handleBack() {
    setEmail('');
    getClient().cancelLogin();
  }

  function handleRetry() {
    getClient().logout();
    if (styles.emailEnabled) {
      getClient().beginEmailLogin();
    }
  }

  function handleInteractiveAuthenticated() {
    const provider = interactiveAdapter?.type;
    setInteractiveAdapter(null);
    if (provider) {
      // Provider login (Privy) is done; run the normal flow so connect() + SEP-10
      // execute against the now-authenticated wallet.
      getClient().login({ provider } as PollarLoginOptions);
    }
  }

  return (
    <div className="pollar-overlay" onClick={handleClose}>
      {interactiveAdapter ? (
        <PrivyLoginSubmodal
          adapter={interactiveAdapter}
          theme={theme}
          accentColor={accentColor}
          logoUrl={logoUrl ?? null}
          appName={config.application?.name ?? 'Pollar'}
          onBack={() => setInteractiveAdapter(null)}
          onCancel={handleClose}
          onAuthenticated={handleInteractiveAuthenticated}
        />
      ) : (
        <LoginModalTemplate
          theme={theme}
          accentColor={accentColor}
          logoUrl={logoUrl ?? null}
          emailEnabled={!!emailEnabled}
          embeddedWallets={!!embeddedWallets}
          smartWallet={smartWalletEnabled}
          providers={{
            google: !!providers?.google,
            discord: !!providers?.discord,
            x: !!providers?.x,
            github: !!providers?.github,
            apple: !!providers?.apple,
          }}
          walletAdapters={walletAdapters}
          appName={config.application?.name ?? 'Pollar'}
          email={email}
          onEmailChange={setEmail}
          onEmailSubmit={handleEmailSubmit}
          onSocialLogin={handleSocialLogin}
          onWalletConnect={handleWalletConnect}
          onLoginSmartWallet={handleLoginSmartWallet}
          onCreateSmartWallet={handleCreateSmartWallet}
          authState={authState}
          codeInputKey={codeInputKey}
          onCodeSubmit={handleVerifyCode}
          onBack={handleBack}
          onCancel={handleClose}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}
