'use client';

import { PollarError, STATE_VAR_CODES, StateLoginCodes, StateVar, WalletType } from '@pollar/core';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginStateCode, setLoginStateCode] = useState<StateLoginCodes | null>(null);

  useEffect(() => {
    return getClient()?.onStateChange((state) => {
      console.log({ state });
      if (state.var === StateVar.LOGIN && isLoginCode(state.code)) {
        setLoginStateCode(state.code);
        console.log('login', state.code);
      }
      // setState(state);
    });
  }, []);

  const { theme = 'light', accentColor = '#005DB4', logoUrl, emailEnabled, embeddedWallets, providers } = styles;

  function handleClose() {
    setEmail('');
    setError(null);
    onClose();
  }

  async function handleEmail() {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      await getClient().login({ provider: 'email', email });
      handleClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialLogin(provider: string) {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await getClient().login({ provider } as any);
      handleClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleWalletConnect(type: WalletType) {
    setLoading(true);
    setError(null);
    try {
      await getClient().connectWallet(type);
      handleClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
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
        loading={loading}
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
