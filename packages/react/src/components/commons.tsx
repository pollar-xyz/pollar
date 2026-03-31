type StateStatus = 'NONE' | 'LOADING' | 'SUCCESS' | 'ERROR';

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

interface ModalStatusBannerProps {
  message: string;
  status: StateStatus;
  onCancel?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
}

export function ModalStatusBanner({ message, status, onCancel, onRetry }: ModalStatusBannerProps) {
  if (!message && status === 'NONE') {
    return <div className="pollar-status" />;
  }

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
      <span>{message}</span>
      {isLoading && onCancel && (
        <button type="button" className="pollar-status-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
      {status === 'ERROR' && onRetry && (
        <button type="button" className="pollar-status-cancel" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}