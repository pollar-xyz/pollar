'use client';

import { AUTH_ERROR_CODES, AuthState, PollarLoginOptions, WalletId } from '@pollar/core';
import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { LoginModalTemplate } from './LoginModalTemplate';
import '../shared.css';
import './LoginModal.css';

type TimeoutHandle = ReturnType<typeof setTimeout>;

interface LoginModalProps {
  onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const { getClient, styles, appConfig: config, renderWallets, customProviders } = usePollar();
  const [authState, setAuthState] = useState<AuthState>(() => getClient().getAuthState());
  const [codeInputKey, setCodeInputKey] = useState(0);
  const pendingEmail = useRef<string | null>(null);

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

  function handleCustomLogin(id: string) {
    // The provider id is a runtime string (a registered custom provider like
    // 'privy'); cast to the closed login-options union since React can't know
    // the app's custom provider ids at compile time. The provider opens its own UI.
    getClient().login({ provider: id } as PollarLoginOptions);
  }

  function handleWalletConnect(type: WalletId) {
    getClient().loginWallet(type);
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

  return (
    <div className="pollar-overlay" onClick={handleClose}>
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
        {...(customProviders !== undefined && { customProviders })}
        appName={config.application?.name ?? 'Pollar'}
        email={email}
        onEmailChange={setEmail}
        onEmailSubmit={handleEmailSubmit}
        onSocialLogin={handleSocialLogin}
        onCustomLogin={handleCustomLogin}
        onWalletConnect={handleWalletConnect}
        onLoginSmartWallet={handleLoginSmartWallet}
        onCreateSmartWallet={handleCreateSmartWallet}
        {...(renderWallets !== undefined && { renderWallets })}
        authState={authState}
        codeInputKey={codeInputKey}
        onCodeSubmit={handleVerifyCode}
        onBack={handleBack}
        onCancel={handleClose}
        onRetry={handleRetry}
      />
    </div>
  );
}
