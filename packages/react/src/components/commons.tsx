import { type StateAuthenticationCodes, StateStatus, type StateTransactionCodes } from '@pollar/core';
import { Component, type ReactNode } from 'react';
import { LOGO_POLLAR } from '../constants';

declare const __POLLAR_VERSION__: string;

interface ModalErrorBoundaryState {
  crashed: boolean;
}

export class ModalErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, ModalErrorBoundaryState> {
  state: ModalErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): ModalErrorBoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[Pollar] Modal crashed:', error);
  }

  render() {
    if (this.state.crashed) {
      this.props.onClose();
      return null;
    }
    return this.props.children;
  }
}

export const PollarModalFooter = () => {
  return (
    <div className="pollar-footer">
      <span className="pollar-footer-protected">Protected by</span>
      <div className="pollar-footer-brand">
        <img src={LOGO_POLLAR} alt="Pollar" className="pollar-footer-logo" />
        <span className="pollar-footer-name">Pollar</span>
        <span className="pollar-footer-version">v{__POLLAR_VERSION__}</span>
      </div>
    </div>
  );
};

const LOGIN_CODE_MESSAGES: Record<StateAuthenticationCodes | StateTransactionCodes, { text: string }> = {
  NONE: { text: '' },
  LOGOUT: { text: 'Logged out' },
  CREATE_SESSION_START: { text: 'Starting session…' },
  CREATE_SESSION_ERROR: { text: 'Failed to start session' },
  CREATE_SESSION_SUCCESS: { text: 'Session ready' },
  EMAIL_AUTH_START: { text: 'Sending code…' },
  EMAIL_AUTH_START_ERROR: { text: 'Failed to send code' },
  EMAIL_AUTH_START_SUCCESS: { text: 'Code sent — check your inbox' },
  EMAIL_AUTH_CODE_ERROR: { text: 'Invalid code — try again' },
  EMAIL_AUTH_CODE_SUCCESS: { text: 'Code verified!' },
  WALLET_AUTH_START: { text: 'Connecting wallet…' },
  WALLET_AUTH_FREIGHTER_NOT_INSTALLED: { text: 'Freighter is not installed' },
  WALLET_AUTH_ALBEDO_NOT_INSTALLED: { text: 'Albedo is not installed' },
  WALLET_AUTH_CONNECTED: { text: 'Wallet connected' },
  WALLET_AUTH_LOGIN_START: { text: 'Signing in with wallet…' },
  WALLET_AUTH_LOGIN_START_SUCCESS: { text: 'Wallet signed in' },
  WALLET_AUTH_LOGIN_START_ERROR: { text: 'Failed to sign in with wallet' },
  WALLET_AUTH_ERROR: { text: 'Unknow wallet error' },
  STREAM_POLL_START: { text: 'Waiting for authentication…' },
  STREAM_POLL_EVENT: { text: 'Waiting for authentication…' },
  STREAM_POLL_READY: { text: 'Authenticated!' },
  FETCH_SESSION_START: { text: 'Loading session…' },
  FETCH_SESSION_SUCCESS: { text: 'Welcome back!' },
  FETCH_SESSION_ERROR: { text: 'Failed to load session' },
  RESTORED_SESSION_SUCCESS: { text: 'Session restored' },
  RESTORED_SESSION_ERROR: { text: 'Failed to restore session' },
  SESSION_STORED: { text: 'Session saved' },
  ERROR_UNKNOWN: { text: 'Something went wrong' },
  ABORTED: { text: 'Login cancelled' },
  // transaction
  BUILD_TRANSACTION_START: { text: 'Building transaction…' },
  BUILD_TRANSACTION_SUCCESS: { text: 'Transaction built, ready to sign and send' },
  BUILD_TRANSACTION_ERROR: { text: 'Failed to build transaction' },
  BUILD_TRANSACTION_ERROR_NO_WALLET: { text: 'No wallet connected' },
  SIGN_SEND_TRANSACTION_START: { text: 'Signing and sending transaction…' },
  SIGN_SEND_TRANSACTION_SUCCESS: { text: 'Transaction signed' },
  SIGN_SEND_TRANSACTION_ERROR: { text: 'Signing rejected' },
};

interface LoginStatusBannerProps {
  code: StateAuthenticationCodes | StateTransactionCodes | null;
  status: StateStatus;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function ModalStatusBanner({ code, status, onCancel, onRetry }: LoginStatusBannerProps) {
  if (!code) {
    return <div className="pollar-status" />;
  }
  const { text } = LOGIN_CODE_MESSAGES[code] || { text: '' };
  const isLoading = status === 'LOADING';
  const icon =
    status === 'ERROR' ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ) : status === 'SUCCESS' ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M3.5 7l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) : status === 'LOADING' ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="22 10" />
      </svg>
    ) : null;

  return (
    <div className="pollar-status" data-kind={status}>
      {icon}
      <span>{text}</span>
      {isLoading && onCancel && (
        <button type="button" className="pollar-status-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
      {status === StateStatus.ERROR && onRetry && (
        <button type="button" className="pollar-status-cancel" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
