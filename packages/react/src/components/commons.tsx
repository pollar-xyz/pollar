type StateStatus = 'NONE' | 'LOADING' | 'SUCCESS' | 'ERROR';

import type { PollarLogger } from '@pollar/core';
import { Component, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { LOGO_POLLAR } from '../constants';

declare const __POLLAR_VERSION__: string;

// Module-level sink for the error boundary (a class component, so it can't read
// React context inside `componentDidCatch`). `PollarProvider` points this at the
// client's level-gated logger on mount; defaults to `console` until then.
let _modalLog: PollarLogger = console;
export function setModalErrorLogger(logger: PollarLogger): void {
  _modalLog = logger;
}

interface ModalErrorBoundaryState {
  crashed: boolean;
}

export class ModalErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, ModalErrorBoundaryState> {
  state: ModalErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): ModalErrorBoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    _modalLog.error('[PollarProvider] Modal crashed:', error);
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

interface CopyButtonProps {
  /** Text written to the clipboard (the full, un-cropped value). */
  value: string;
  /** Accessible label for the button (e.g. "Copy address"). */
  label?: string;
  /** Extra class (e.g. `pollar-copy-btn-sm` for the compact issuer variant). */
  className?: string;
}

/** Self-contained copy-to-clipboard icon button with a transient "copied" tick. */
export function CopyButton({ value, label = 'Copy', className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  function handleCopy(e: ReactMouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!value || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 1500);
    });
  }

  return (
    <button
      type="button"
      className={`pollar-copy-btn${className ? ` ${className}` : ''}`}
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M3.5 7l2.5 2.5 4.5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
          <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M3 9H2a1 1 0 01-1-1V2a1 1 0 011-1h6a1 1 0 011 1v1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

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
      <></>
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
