'use client';

import { AUTH_ERROR_CODES, AuthState, WalletType } from '@pollar/core';
import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { LoginModalTemplate } from './LoginModalTemplate';
import './LoginModal.css';

interface LoginModalProps {
  onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const { getClient, styles, config } = usePollar();
  const [authState, setAuthState] = useState<AuthState>(() => getClient().getAuthState());
  const [codeInputKey, setCodeInputKey] = useState(0);
  const pendingEmail = useRef<string | null>(null);

  useEffect(() => {
    return getClient().onAuthStateChange((next) => {
      setAuthState(next);
      if (next.step === 'entering_email' && pendingEmail.current) {
        getClient().sendEmailCode(pendingEmail.current);
        pendingEmail.current = null;
      }
      if (next.step === 'error' && next.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_INVALID) {
        setCodeInputKey((k) => k + 1);
      }
      if (next.step === 'authenticated') {
        setTimeout(onClose, 1000);
      }
    });
  }, []);

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

  function handleWalletConnect(type: WalletType) {
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
        onFreighterConnect={() => handleWalletConnect(WalletType.FREIGHTER)}
        onAlbedoConnect={() => handleWalletConnect(WalletType.ALBEDO)}
        authState={authState}
        codeInputKey={codeInputKey}
        onCodeSubmit={handleVerifyCode}
        onBack={handleBack}
        onCancel={() => getClient().cancelLogin()}
        onRetry={handleRetry}
      />
    </div>
  );
}
