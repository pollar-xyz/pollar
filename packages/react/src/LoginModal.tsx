'use client';

import { PollarError, STATE_VAR_CODES, StateLoginCodes, StateStatus, StateVar, WalletType } from '@pollar/core';
import { useEffect, useState } from 'react';
import { usePollar } from './context';
import { LoginModalTemplate } from './login-modal-template';
import './LoginModal.css';

interface LoginModalProps {
  onClose: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  API_KEY_NOT_FOUND: 'Invalid API key. Contact the app administrator.',
  API_KEY_EXPIRED: 'API key has expired. Contact the app administrator.',
  ORIGIN_NOT_ALLOWED: 'This origin is not authorized. Contact the app administrator.',
  FREIGHTER_NOT_INSTALLED: 'Freighter is not installed. Get it at freighter.app.',
  WALLET_NOT_AVAILABLE: 'Wallet is not available.',
};

function getErrorMessage(err: unknown): string {
  if (err instanceof PollarError && ERROR_MESSAGES[err.code]) {
    return ERROR_MESSAGES[err.code] ?? '';
  }
  return 'Something went wrong. Please try again.';
}

function isLoginCode(code: string): code is StateLoginCodes {
  return (Object.values(STATE_VAR_CODES[StateVar.LOGIN]) as string[]).includes(code);
}

export function LoginModal({ onClose }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const { getClient, styles, config } = usePollar();
  const [loading, setLoading] = useState<StateStatus>(StateStatus.NONE);
  const [error, setError] = useState<string | null>(null);
  const [loginStateCode, setLoginStateCode] = useState<StateLoginCodes | null>(null);

  useEffect(() => {
    return getClient()?.onStateChange((state) => {
      console.log({ state });
      if (state.var === StateVar.LOGIN && isLoginCode(state.code)) {
        setLoginStateCode(state.code);
        setLoading(state.status);
        if ((state.data as any).status === 'AWAITING_EMAIL') {
        }
      }
    });
  }, []);

  const { theme = 'light', accentColor = '#005DB4', logoUrl, emailEnabled, embeddedWallets, providers } = styles;

  function handleClose() {
    setEmail('');
    setError(null);
    onClose();
  }

  async function handleEmail() {
    if (!email) {
      return;
    }
    setError(null);
    try {
      await getClient().login({ provider: 'email', email });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
    }
  }

  async function handleSocialLogin(provider: 'google' | 'github') {
    setError(null);
    try {
      await getClient().login({ provider });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
    }
  }

  async function handleWalletConnect(type: WalletType) {
    setError(null);
    try {
      await getClient().connectWallet(type);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
    }
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
        loading={loading === StateStatus.LOADING}
        error={error}
        onEmailChange={setEmail}
        onEmailSubmit={handleEmail}
        onSocialLogin={handleSocialLogin}
        onFreighterConnect={() => handleWalletConnect(WalletType.FREIGHTER)}
        onAlbedoConnect={() => handleWalletConnect(WalletType.ALBEDO)}
        loginStateCode={loginStateCode}
      />
    </div>
  );
}
