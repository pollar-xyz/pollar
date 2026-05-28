'use client';

import type { SessionInfo } from '@pollar/core';
import { type CSSProperties } from 'react';
import { PollarModalFooter } from '../commons';

export type SessionsState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; sessions: SessionInfo[] }
  | { step: 'error'; message: string };

export interface SessionsModalTemplateProps {
  theme: string;
  accentColor: string;
  state: SessionsState;
  revokingFamilyId: string | null;
  signingOutEverywhere: boolean;
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
  if (s.deviceLabel) return s.deviceLabel;
  if (!s.userAgent) return 'Unknown device';
  return parseUserAgent(s.userAgent);
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
  if (browser && os) return `${os} — ${browser}`;
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

export function SessionsModalTemplate({
  theme,
  accentColor,
  state,
  revokingFamilyId,
  signingOutEverywhere,
  onRefresh,
  onRevoke,
  onLogoutEverywhere,
  onClose,
}: SessionsModalTemplateProps) {
  const isDark = theme === 'dark';
  const cssVars = {
    '--pollar-accent': accentColor,
    '--pollar-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': isDark ? '#ffffff' : '#111827',
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    '--pollar-input-bg': isDark ? '#374151' : '#f9fafb',
    '--pollar-error-bg': isDark ? '#2a1515' : '#fef2f2',
    '--pollar-error-border': isDark ? '#7f1d1d' : '#fecaca',
    '--pollar-error-text': isDark ? '#f87171' : '#dc2626',
    '--pollar-success-text': isDark ? '#4ade80' : '#16a34a',
    '--pollar-buttons-border-radius': '6px',
    '--pollar-buttons-height': '44px',
    '--pollar-input-height': '44px',
    '--pollar-input-border-radius': '0.5rem',
    '--pollar-card-border-radius': '10px',
  } as CSSProperties;

  const isLoading = state.step === 'loading';
  const sessions = state.step === 'loaded' ? state.sessions : [];
  const otherCount = sessions.filter((s) => !s.current).length;

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
          <button className="pollar-modal-refresh-btn" onClick={onRefresh} disabled={isLoading}>
            <svg
              className={`pollar-modal-refresh-icon${isLoading ? ' spinning' : ''}`}
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
              aria-hidden
            >
              <path d="M11.5 6.5a5 5 0 11-1.5-3.536" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M10 1v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
          <button className="pollar-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="pollar-sessions-list">
        {state.step === 'idle' && <div className="pollar-modal-empty">Loading…</div>}
        {isLoading && <div className="pollar-modal-empty">Loading…</div>}
        {state.step === 'error' && <div className="pollar-modal-empty">{state.message}</div>}
        {state.step === 'loaded' && sessions.length === 0 && <div className="pollar-modal-empty">No active sessions.</div>}
        {sessions.map((s) => {
          const isRevoking = revokingFamilyId === s.familyId;
          return (
            <div key={s.familyId} className="pollar-sessions-item" data-current={s.current || undefined}>
              <div className="pollar-sessions-item-main">
                <span className="pollar-sessions-item-device">{describeDevice(s)}</span>
                {s.current && <span className="pollar-sessions-item-badge">This device</span>}
              </div>
              <div className="pollar-sessions-item-meta">
                <span>Last used {formatRelative(s.lastUsedAt ?? s.createdAt)}</span>
                {s.ipHash && (
                  <>
                    <span>·</span>
                    <span title={`ip-hash ${s.ipHash}`}>ip {shortIp(s.ipHash)}</span>
                  </>
                )}
              </div>
              {!s.current && (
                <button
                  className="pollar-sessions-item-revoke"
                  onClick={() => onRevoke(s.familyId)}
                  disabled={isRevoking || signingOutEverywhere}
                >
                  {isRevoking ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {state.step === 'loaded' && sessions.length > 0 && (
        <div className="pollar-sessions-actions">
          <button
            className="pollar-sessions-logout-all"
            onClick={onLogoutEverywhere}
            disabled={signingOutEverywhere || otherCount === 0}
            title={otherCount === 0 ? 'No other devices to sign out' : undefined}
          >
            {signingOutEverywhere ? 'Signing out…' : 'Sign out everywhere'}
          </button>
        </div>
      )}

      <PollarModalFooter />
    </div>
  );
}
