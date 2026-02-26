import { StateLoginCodes, StateStatus } from '@pollar/core';

const LOGIN_CODE_MESSAGES: Record<StateLoginCodes, { text: string }> = {
  LOGOUT: { text: 'Logged out' },
  CREATE_SESSION_START: { text: 'Starting session…' },
  CREATE_SESSION_ERROR: { text: 'Failed to start session' },
  CREATE_SESSION_SUCCESS: { text: 'Session ready' },
  EMAIL_AUTH_START: { text: 'Sending code…' },
  EMAIL_AUTH_START_ERROR: { text: 'Failed to send code' },
  EMAIL_AUTH_START_SUCCESS: { text: 'Code sent — check your inbox' },
  EMAIL_AUTH_CODE_ERROR: { text: 'Invalid code — try again' },
  EMAIL_AUTH_CODE_SUCCESS: { text: 'Code verified!' },
  WALLET_AUTH_FREIGHTER_NOT_INSTALLED: { text: 'Freighter is not installed' },
  WALLET_AUTH_ALBEDO_NOT_INSTALLED: { text: 'Albedo is not installed' },
  WALLET_AUTH_WALLET_NOT_AVAILABLE: { text: 'Wallet not available' },
  STREAM_POLL_START: { text: 'Waiting for authentication…' },
  STREAM_POLL_EVENT: { text: 'Waiting for authentication…' },
  STREAM_POLL_READY: { text: 'Authenticated!' },
  FETCH_SESSION_START: { text: 'Loading session…' },
  FETCH_SESSION_SUCCESS: { text: 'Welcome back!' },
  FETCH_SESSION_ERROR: { text: 'Failed to load session' },
  ERROR_UNKNOWN: { text: 'Something went wrong' },
  ABORTED: { text: 'Login cancelled' },
};

interface LoginStatusBannerProps {
  code: StateLoginCodes | null;
  status: StateStatus;
  onCancel?: () => void;
  onRetry: () => void;
}

export function LoginStatusBanner({ code, status, onCancel, onRetry }: LoginStatusBannerProps) {
  if (!code) return <div className="pollar-status" />;
  const { text } = LOGIN_CODE_MESSAGES[code] || { text: '' };
  const isLoading = status === StateStatus.LOADING;
  const icon =
    status === StateStatus.ERROR ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ) : status === StateStatus.SUCCESS ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M3.5 7l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) : status === StateStatus.LOADING ? (
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
      {status === StateStatus.ERROR && (
        <button type="button" className="pollar-status-cancel" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
