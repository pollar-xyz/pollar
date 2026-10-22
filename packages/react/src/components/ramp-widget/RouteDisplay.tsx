'use client';

import type { RampQuote, RampQuoteRejection } from '@pollar/core';
import { rampLegTitle, rampResolutionText } from '@pollar/core';

interface RouteDisplayProps {
  quote: RampQuote;
  /** The first quote: the most received (or least sent) for the amount. */
  best?: boolean;
  /** This route is the one being started - it owns the in-flight request. */
  busy?: boolean;
  /** Another route is starting, so this one is not selectable meanwhile. */
  disabled?: boolean;
  onSelect: (quote: RampQuote) => void;
}

const assetOf = (node: RampQuote['legs'][number]['to']) => (node.kind === 'fiat' ? node.currency : node.code);

/** "~3 min" for a route's total; nothing when no leg could estimate it. */
function etaText(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 90) return `~${Math.max(1, Math.round(seconds))} s`;
  if (seconds < 5400) return `~${Math.round(seconds / 60)} min`;
  return `~${Math.round(seconds / 3600)} h`;
}

export function RouteDisplay({ quote, best = false, busy = false, disabled = false, onSelect }: RouteDisplayProps) {
  const inert = busy || disabled;
  const select = () => {
    if (!inert) onSelect(quote);
  };
  const first = quote.legs[0];
  const last = quote.legs[quote.legs.length - 1];
  return (
    <div
      className="pollar-ramp-route-card"
      data-recommended={best}
      data-busy={busy || undefined}
      data-disabled={disabled || undefined}
      role="button"
      aria-busy={busy}
      aria-disabled={inert}
      tabIndex={inert ? -1 : 0}
      onClick={select}
      onKeyDown={(e) => e.key === 'Enter' && select()}
    >
      <div className="pollar-ramp-route-left">
        <span className="pollar-ramp-route-provider">
          {first && last
            ? `${quote.amountIn} ${assetOf(first.from)} → ${quote.amountOut} ${assetOf(last.to)}`
            : quote.amountOut}
        </span>
        <span className="pollar-ramp-route-meta">
          {busy
            ? 'Starting…'
            : [quote.legs.map((leg) => rampLegTitle(leg)).join(' · '), etaText(quote.etaSeconds)].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="pollar-ramp-route-right">
        {busy ? (
          <span className="pollar-spinner pollar-spinner-sm" />
        ) : (
          <>
            <span className="pollar-ramp-route-fee">
              {quote.legs.length === 1 ? '1 step' : `${quote.legs.length} steps`} · fees included
            </span>
            {best && <span className="pollar-ramp-route-badge">Best rate</span>}
          </>
        )}
      </div>
    </div>
  );
}

/** A route that was planned and dropped, and what the user can do about it. */
export function RejectedRouteDisplay({ rejection }: { rejection: RampQuoteRejection }) {
  return (
    <div className="pollar-ramp-route-card" data-locked data-disabled>
      <div className="pollar-ramp-route-left">
        <span className="pollar-ramp-route-provider">{rejection.legs.map((leg) => rampLegTitle(leg)).join(' · ')}</span>
        <span className="pollar-ramp-route-meta">{rampResolutionText(rejection.failure)}</span>
      </div>
    </div>
  );
}
