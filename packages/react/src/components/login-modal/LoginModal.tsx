'use client';

import { AUTH_ERROR_CODES, AuthState, WalletId } from '@pollar/core';
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
  const { getClient, styles, appConfig: config, renderWallets } = usePollar();
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

  const { theme = 'light', accentColor = '#005DB4', logoUrl, emailEnabled, embeddedWallets, providers } = styles;

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
    getClient().loginWallet(type);
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
        providers={{
          google: !!providers?.google,
          discord: !!providers?.discord,
          x: !!providers?.x,
          github: !!providers?.github,
          apple: !!providers?.apple,
        }}
        appName={config.application?.name ?? 'Pollar'}
        email={email}
        onEmailChange={setEmail}
        onEmailSubmit={handleEmailSubmit}
        onSocialLogin={handleSocialLogin}
        onWalletConnect={handleWalletConnect}
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
