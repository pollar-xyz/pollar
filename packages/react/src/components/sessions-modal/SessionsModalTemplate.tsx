'use client';

import type { SessionInfo, SessionsState } from '@pollar/core';
import { PollarModalFooter, RefreshIcon } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';

export type { SessionsState };

export interface SessionsModalTemplateProps {
  theme: string;
  accentColor: string;
  /** Per-app modal chrome overrides (background, card + button radius). */
  styleOverrides?: ModalStyleOverrides;
  state: SessionsState;
  revokingFamilyId: string | null;
  signingOutEverywhere: boolean;
  revokeError: string | null;
  onRefresh: () => void;
  onRevoke: (familyId: string) => void;
  onLogoutEverywhere: () => void;
  onClose: () => void;
}

/**
 * Heuristic device label. Prefers the explicit `deviceLabel` set via
 * `PollarClientConfig`; falls back to a stripped User-Agent.
 */
function describeDevice(s: SessionInfo): string {
  if (s.deviceLabel) return normalizeDeviceLabel(s.deviceLabel);
  if (!s.userAgent) return 'Unknown device';
  return parseUserAgent(s.userAgent);
}

function normalizeDeviceLabel(label: string): string {
  // Collapse the whitespace first so the split needs no unbounded `\s+` on both
  // sides of the separator, which backtracks polynomially on a label with a long
  // run of spaces (CodeQL js/polynomial-redos); the label comes from the API.
  const parts = label.replace(/\s+/g, ' ').split(/ (?:[—–-]|·) /);
  if (parts.length === 2 && parts[1] !== undefined) return `${parts[0]} · ${parts[1].toLowerCase()}`;
  return label;
}

function detectBrowser(ua: string): string | null {
  // Order matters: Edge / Opera contain "Chrome" in their UA, so check them first.
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/(Chrome|CriOS)\//.test(ua)) return 'Chrome';
  if (/(Firefox|FxiOS)\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return null;
}

function detectOS(ua: string): string | null {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

function parseUserAgent(ua: string): string {
  const browser = detectBrowser(ua);
  const os = detectOS(ua);
  if (browser && os) return `${os} · ${browser.toLowerCase()}`;
  if (os) return os;
  if (browser) return browser;
  return ua.slice(0, 48);
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '—';
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 0) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function shortIp(hash: string | null): string {
  if (!hash) return '';
  return hash.slice(0, 8);
}

type DeviceKind = 'desktop' | 'phone' | 'tablet';

function deviceKind(session: SessionInfo): DeviceKind {
  const value = `${session.deviceLabel ?? ''} ${session.userAgent ?? ''}`.toLowerCase();
  if (/ipad|tablet/.test(value)) return 'tablet';
  if (/android|iphone|ipod|mobile|phone/.test(value)) return 'phone';
  return 'desktop';
}

function DeviceIcon({ kind, size = 'small' }: { kind: DeviceKind; size?: 'small' | 'large' }) {
  const dimensions = size === 'large' ? 30 : 18;
  if (kind === 'phone') {
    return (
      <svg width={dimensions} height={dimensions} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10.5 5h3M11 18.5h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'tablet') {
    return (
      <svg width={dimensions} height={dimensions} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4.5" y="2.5" width="15" height="19" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M11 18.5h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={dimensions} height={dimensions} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3.5" width="18" height="12" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 20.5h8M12 15.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="m2.5 6.2 2.1 2.1L9.6 3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SessionsModalTemplate({
  theme,
  accentColor,
  styleOverrides,
  state,
  revokingFamilyId,
  signingOutEverywhere,
  revokeError,
  onRefresh,
  onRevoke,
  onLogoutEverywhere,
  onClose,
}: SessionsModalTemplateProps) {
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides);

  const isLoading = state.step === 'loading';
  const sessions = state.step === 'loaded' ? state.sessions : [];
  const currentSession = sessions.find((s) => s.current);
  const otherSessions = sessions.filter((s) => !s.current);
  const otherCount = otherSessions.length;

  return (
    <div
      className="pollar-modal-card pollar-sessions-modal"
      data-theme={theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">Active sessions</h2>
        <div className="pollar-modal-header-actions">
          <button
            type="button"
            className="pollar-modal-close"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshIcon spinning={isLoading} />
          </button>
          <button type="button" className="pollar-modal-close" onClick={onClose} aria-label="Close" title="Close">
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="pollar-sessions-list">
        {(state.step === 'idle' || isLoading) && (
          <div className="pollar-loading-block">
            <div className="pollar-spinner" />
            <span>Loading…</span>
          </div>
        )}
        {state.step === 'error' && <div className="pollar-modal-empty">{state.message}</div>}
        {state.step === 'loaded' && sessions.length === 0 && <div className="pollar-modal-empty">No active sessions.</div>}
        {state.step === 'loaded' && currentSession && (
          <div className="pollar-sessions-current-card">
            <div className="pollar-sessions-current-icon-wrap">
              <DeviceIcon kind={deviceKind(currentSession)} size="large" />
              <span className="pollar-sessions-current-check">
                <CheckIcon />
              </span>
            </div>
            <span className="pollar-sessions-current-label">This device</span>
            <strong className="pollar-sessions-current-device">{describeDevice(currentSession)}</strong>
            <div className="pollar-sessions-current-status">
              <span className="pollar-sessions-status-dot" />
              <span>Active now</span>
              {currentSession.ipHash && (
                <>
                  <span>·</span>
                  <span title={`ip-hash ${currentSession.ipHash}`}>IP {shortIp(currentSession.ipHash)}</span>
                </>
              )}
            </div>
          </div>
        )}
        {state.step === 'loaded' && otherSessions.length > 0 && (
          <section className="pollar-sessions-other-section" aria-labelledby="pollar-other-devices-heading">
            <h3 id="pollar-other-devices-heading" className="pollar-sessions-section-title">
              Other devices <span>{otherCount}</span>
            </h3>
            <div className="pollar-sessions-grid">
              {otherSessions.map((s) => {
                const isRevoking = revokingFamilyId === s.familyId;
                return (
                  <div key={s.familyId} className="pollar-sessions-item">
                    <div className="pollar-sessions-item-top">
                      <span className="pollar-sessions-item-icon">
                        <DeviceIcon kind={deviceKind(s)} />
                      </span>
                      <button
                        type="button"
                        className="pollar-sessions-item-revoke"
                        onClick={() => onRevoke(s.familyId)}
                        disabled={isRevoking || signingOutEverywhere}
                        aria-label={`Sign out ${describeDevice(s)}`}
                        title={isRevoking ? 'Signing out…' : 'Sign out this device'}
                      >
                        {isRevoking ? <span className="pollar-spinner pollar-spinner-sm" /> : <CloseIcon />}
                      </button>
                    </div>
                    <strong className="pollar-sessions-item-device">{describeDevice(s)}</strong>
                    <span className="pollar-sessions-item-meta">{formatRelative(s.lastUsedAt ?? s.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {revokeError && (
          <div className="pollar-sessions-action-error" role="alert">
            {revokeError}
          </div>
        )}
      </div>

      {state.step === 'loaded' && sessions.length > 0 && (
        <div className="pollar-sessions-actions">
          <button
            className="pollar-sessions-logout-all"
            onClick={onLogoutEverywhere}
            disabled={signingOutEverywhere || otherCount === 0}
            title={otherCount === 0 ? 'No other devices to sign out' : undefined}
          >
            {signingOutEverywhere ? (
              <>
                <span className="pollar-spinner pollar-spinner-sm pollar-spinner-current" />
                Signing out…
              </>
            ) : (
              'Sign out everywhere'
            )}
          </button>
        </div>
      )}

      <PollarModalFooter />
    </div>
  );
}
