'use client';

import { PollarStateVar, STATE_VAR_CODES, StateAuthenticationCodes, StateStatus, WalletType } from '@pollar/core';
import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { LoginModalTemplate } from './LoginModalTemplate';
import './LoginModal.css';

interface LoginModalProps {
  onClose: () => void;
}

function isLoginCode(code: string): code is StateAuthenticationCodes {
  return (Object.values(STATE_VAR_CODES[PollarStateVar.AUTHENTICATION]) as string[]).some((c) => code.startsWith(c));
}

export function LoginModal({ onClose }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const { getClient, styles, config } = usePollar();
  const [status, setStatus] = useState<StateStatus>(StateStatus.NONE);
  const [error, setError] = useState<string | null>(null);
  const [loginStateCode, setLoginStateCode] = useState<StateAuthenticationCodes | null>(null);
  const [awaitingEmailCode, setAwaitingEmailCode] = useState(false);
  const [clientSessionId, setClientSessionId] = useState<string | null>(null);

  useEffect(() => {
    return getClient().onStateChange((stateEntry) => {
      if (stateEntry.var === PollarStateVar.AUTHENTICATION && isLoginCode(stateEntry.code)) {
        setLoginStateCode(stateEntry.code);
        setStatus(stateEntry.status);
        if (stateEntry.code === STATE_VAR_CODES[PollarStateVar.AUTHENTICATION].STREAM_POLL_START) {
          const data = stateEntry.data as { clientSessionId: string };
          setClientSessionId(data.clientSessionId);
        }
        if (stateEntry.code === STATE_VAR_CODES[PollarStateVar.AUTHENTICATION].EMAIL_AUTH_START_SUCCESS) {
          const data = stateEntry.data as { code?: string; content: { clientSessionId: string } };
          if (data?.code === 'SDK_EMAIL_CODE_SENT') {
            setAwaitingEmailCode(true);
            setClientSessionId(data?.content?.clientSessionId);
          }
        }
        if (stateEntry.code === STATE_VAR_CODES[PollarStateVar.AUTHENTICATION].FETCH_SESSION_SUCCESS) {
          setAwaitingEmailCode(false);
          setTimeout(onClose, 1000);
        }
      }
    });
  }, []);

  const { theme = 'light', accentColor = '#005DB4', logoUrl, emailEnabled, embeddedWallets, providers } = styles;

  function handleClose() {
    setEmail('');
    setError(null);
    setAwaitingEmailCode(false);
    setClientSessionId(null);
    onClose();
  }

  const cancelLoginRef = useRef<(() => void) | null>(null);

  function handleEmail() {
    if (!email) {
      return;
    }
    const { cancelLogin } = getClient().login({ provider: 'email', email });
    cancelLoginRef.current = cancelLogin;
  }

  function handleSocialLogin(provider: 'google' | 'github') {
    const { cancelLogin } = getClient().login({ provider });
    cancelLoginRef.current = cancelLogin;
  }

  function handleWalletConnect(type: WalletType) {
    const { cancelLogin } = getClient().login({ provider: 'wallet', type });
    cancelLoginRef.current = cancelLogin;
  }

  async function handleVerifyCode(code: string) {
    if (!clientSessionId) return;
    void getClient().verifyEmailCode(clientSessionId, code);
  }

  function handleRetry() {
    getClient().logout();
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
        status={status}
        error={error}
        onEmailChange={setEmail}
        onEmailSubmit={handleEmail}
        onSocialLogin={handleSocialLogin}
        onFreighterConnect={() => handleWalletConnect(WalletType.FREIGHTER)}
        onAlbedoConnect={() => handleWalletConnect(WalletType.ALBEDO)}
        loginStateCode={loginStateCode}
        awaitingEmailCode={awaitingEmailCode}
        onCodeSubmit={handleVerifyCode}
        cancelLoginRef={cancelLoginRef}
        onRetry={handleRetry}
      />
    </div>
  );
}
