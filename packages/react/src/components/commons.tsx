import { useInheritedLanguage } from '../language-context';
type StateStatus = 'NONE' | 'LOADING' | 'SUCCESS' | 'ERROR';

import type { PollarLanguage, PollarLogger, StellarNetwork, WalletChain } from '@pollar/core';
import {
  Component,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  LOGO_POLLAR_MARK_ON_DARK,
  LOGO_POLLAR_MARK_ON_LIGHT,
  LOGO_POLLAR_WORDMARK_ON_DARK,
  LOGO_POLLAR_WORDMARK_ON_LIGHT,
} from '../constants';
import { COMMONS_COPY } from './commons-copy';

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

/** The app's logo, or the Pollar mark in the version for the card's surface. */
export function ModalLogo({ logoUrl }: { logoUrl?: string | null | undefined }) {
  if (logoUrl) return <img src={logoUrl} alt="Logo" className="pollar-logo" />;
  return (
    <>
      <img src={LOGO_POLLAR_MARK_ON_LIGHT} alt="Pollar" className="pollar-logo pollar-logo-on-light" />
      <img src={LOGO_POLLAR_MARK_ON_DARK} alt="Pollar" className="pollar-logo pollar-logo-on-dark" />
    </>
  );
}

export const PollarModalFooter = ({ language: languageProp }: { language?: PollarLanguage | undefined }) => {
  const language = useInheritedLanguage(languageProp);
  return (
    <div className="pollar-footer">
      <span className="pollar-footer-protected">{COMMONS_COPY[language].protectedBy}</span>
      <img src={LOGO_POLLAR_WORDMARK_ON_LIGHT} alt="Pollar" className="pollar-footer-logo pollar-logo-on-light" />
      <img src={LOGO_POLLAR_WORDMARK_ON_DARK} alt="Pollar" className="pollar-footer-logo pollar-logo-on-dark" />
      <span className="pollar-footer-version">v{__POLLAR_VERSION__}</span>
    </div>
  );
};

/** The explorer page of a transaction, by the chain it ran on. */
export function explorerTxUrl(chain: WalletChain, hash: string, network: StellarNetwork): string {
  if (chain === 'SOLANA') {
    return `https://explorer.solana.com/tx/${hash}${network === 'testnet' ? '?cluster=devnet' : ''}`;
  }
  if (chain === 'POLYGON') {
    return `https://${network === 'testnet' ? 'amoy.' : ''}polygonscan.com/tx/${hash}`;
  }
  return `https://stellar.expert/explorer/${network === 'testnet' ? 'testnet' : 'public'}/tx/${hash}`;
}

/** Shared refresh glyph used by compact modal header actions. */
export function RefreshIcon({ spinning = false, className = '' }: { spinning?: boolean; className?: string }) {
  return (
    <svg
      className={`${spinning ? 'pollar-modal-refresh-icon pollar-spinning' : 'pollar-modal-refresh-icon'}${className ? ` ${className}` : ''}`}
      width="17"
      height="17"
      viewBox="0 0 17 17"
      fill="none"
      aria-hidden
    >
      <path
        d="M2.125 8.5C2.125 6.80924 2.79665 5.18774 3.99219 3.99219C5.18774 2.79665 6.80924 2.125 8.5 2.125C10.2822 2.1317 11.9928 2.82712 13.2742 4.06583L14.875 5.66667"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.8747 2.125V5.66667H11.333"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.875 8.5C14.875 10.1908 14.2033 11.8123 13.0078 13.0078C11.8123 14.2033 10.1908 14.875 8.5 14.875C6.7178 14.8683 5.00719 14.1729 3.72583 12.9342L2.125 11.3333"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.125 14.875V11.3333H5.66667"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface CopyButtonProps {
  /** Text written to the clipboard (the full, un-cropped value). */
  value: string;
  /** Accessible label for the button (e.g. "Copy address"). */
  label?: string;
  /** Extra class (e.g. `pollar-copy-btn-sm` for the compact issuer variant). */
  className?: string;
  language?: PollarLanguage | undefined;
}

/** Self-contained copy-to-clipboard icon button with a transient "copied" tick. */
export function CopyButton({ value, label, className, language: languageProp }: CopyButtonProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = COMMONS_COPY[language];
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
      aria-label={copied ? copy.copied : (label ?? copy.copy)}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M3.5 7l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
  language?: PollarLanguage | undefined;
}

export function ModalStatusBanner({ message, status, onCancel, onRetry, language: languageProp }: ModalStatusBannerProps) {
  const language = useInheritedLanguage(languageProp);
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
          {COMMONS_COPY[language].cancel}
        </button>
      )}
      {status === 'ERROR' && onRetry && (
        <button type="button" className="pollar-status-cancel" onClick={onRetry}>
          {COMMONS_COPY[language].retry}
        </button>
      )}
    </div>
  );
}

/**
 * The chain an asset lives on, as a short accented tag.
 *
 * Shared by the balance and asset lists: both render per-chain rows and must
 * agree on the label and colour, so the palette lives in one place. Callers show
 * it only when the app spans more than one chain - a Stellar-only app would just
 * see the same tag on every row.
 */
const CHAIN_TAG: Record<string, { label: string; color: string }> = {
  STELLAR: { label: 'Stellar', color: '#7d00ff' },
  POLYGON: { label: 'Polygon', color: '#8247e5' },
  SOLANA: { label: 'Solana', color: '#14f195' },
};

export function ChainTag({ chain }: { chain: string }) {
  const tag = CHAIN_TAG[chain] ?? { label: chain, color: '#6b7280' };
  return (
    <span className="pollar-chain-tag" style={{ '--pollar-chain-color': tag.color } as CSSProperties}>
      {tag.label}
    </span>
  );
}

/** Middle-truncates an on-chain address (issuer, ERC-20 contract, SPL mint). */
export function cropAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

/**
 * Remembers the last non-null value it was given.
 *
 * The balance/assets state machines drop their payload while a refresh is in
 * flight (`step` leaves `'loaded'`), which would blank the list on every
 * refresh. Holding the previous data lets the modal keep rendering it under a
 * {@link BusyOverlay} instead - the list never collapses and then reflows.
 */
export function useStickyData<T>(data: T | null): T | null {
  const lastRef = useRef<T | null>(null);
  if (data !== null) lastRef.current = data;
  return data ?? lastRef.current;
}

/**
 * Blocks a modal while a refresh is in flight, keeping the stale data visible
 * (and readable) underneath. Covers the whole card, so nothing can be clicked
 * against data that is about to change.
 */
export function BusyOverlay({ label, language: languageProp }: { label?: string; language?: PollarLanguage | undefined }) {
  const language = useInheritedLanguage(languageProp);
  return (
    <div className="pollar-busy-overlay" aria-busy="true" aria-live="polite">
      <div className="pollar-busy-overlay-inner">
        <div className="pollar-spinner" />
        <span>{label ?? COMMONS_COPY[language].loading}</span>
      </div>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  busy?: boolean;
  label: string;
}

/**
 * On/off switch. Used for trustlines, where the state is binary and the old
 * "status pill + Enable/Disable button" pair said the same thing twice.
 */
export function Toggle({ checked, onChange, disabled = false, busy = false, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`pollar-switch${checked ? ' pollar-switch-on' : ''}${busy ? ' pollar-switch-busy' : ''}`}
      onClick={onChange}
      disabled={disabled || busy}
    >
      <span className="pollar-switch-knob">
        {busy && <span className="pollar-spinner pollar-spinner-sm pollar-spinner-current" />}
      </span>
    </button>
  );
}
