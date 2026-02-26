'use client';

import { STATE_VAR_CODES, StateLoginCodes, StateStatus, StateVar, WalletType } from '@pollar/core';
import { useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { LoginModalTemplate } from './LoginModalTemplate';
import './LoginModal.css';

interface LoginModalProps {
  onClose: () => void;
}

function isLoginCode(code: string): code is StateLoginCodes {
  return (Object.values(STATE_VAR_CODES[StateVar.LOGIN]) as string[]).includes(code);
}

export function LoginModal({ onClose }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const { getClient, styles, config } = usePollar();
  const [status, setStatus] = useState<StateStatus>(StateStatus.NONE);
  const [error, setError] = useState<string | null>(null);
  const [loginStateCode, setLoginStateCode] = useState<StateLoginCodes | null>(null);
  const [awaitingEmailCode, setAwaitingEmailCode] = useState(false);
  const [clientSessionId, setClientSessionId] = useState<string | null>(null);

  useEffect(() => {
    return getClient()?.onStateChange((state) => {
      if (state.var === StateVar.LOGIN && isLoginCode(state.code)) {
        setLoginStateCode(state.code);
        setStatus(state.status);
        if (state.code === STATE_VAR_CODES[StateVar.LOGIN].STREAM_POLL_START) {
          const data = state.data as { clientSessionId: string };
          setClientSessionId(data.clientSessionId);
        }
        if (state.code === STATE_VAR_CODES[StateVar.LOGIN].STREAM_POLL_EVENT) {
          const data = state.data as { status?: string };
          if (data?.status === 'AWAITING_EMAIL') {
            setAwaitingEmailCode(true);
          }
        }
        if (state.code === STATE_VAR_CODES[StateVar.LOGIN].FETCH_SESSION_SUCCESS) {
          setAwaitingEmailCode(false);
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
      <style>{`@keyframes pollar-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
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
