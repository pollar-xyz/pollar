'use client';

import type { RampQuote } from '@pollar/core';

interface RouteDisplayProps {
  quote: RampQuote;
  /** This route is the one being started — it owns the in-flight request. */
  busy?: boolean;
  /** Another route is starting, so this one is not selectable meanwhile. */
  disabled?: boolean;
  onSelect: (quote: RampQuote) => void;
}

const RAIL_LABELS: Record<string, string> = {
  SPEI: 'SPEI (Mexico)',
  PIX: 'PIX (Brazil)',
  PSE: 'PSE (Colombia)',
  ACH: 'ACH (US)',
};

export function RouteDisplay({ quote, busy = false, disabled = false, onSelect }: RouteDisplayProps) {
  // Picking a route fires a request that can take seconds (the provider is
  // contacted server-side). Without this the card looked inert and the only
  // hint that anything happened was the network tab.
  const inert = busy || disabled;
  const select = () => {
    if (!inert) onSelect(quote);
  };
  return (
    <div
      className="pollar-ramp-route-card"
      data-recommended={quote.recommended}
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
        <span className="pollar-ramp-route-provider">{quote.provider}</span>
        <span className="pollar-ramp-route-meta">
          {busy ? 'Starting…' : `${RAIL_LABELS[quote.rail] ?? quote.rail} · ${quote.protocol} · ${quote.estimatedTime}`}
        </span>
      </div>
      <div className="pollar-ramp-route-right">
        {busy ? (
          <span className="pollar-spinner pollar-spinner-sm" />
        ) : (
          <>
            <span className="pollar-ramp-route-fee">{quote.fee}% fee</span>
            {quote.recommended && <span className="pollar-ramp-route-badge">Best rate</span>}
          </>
        )}
      </div>
    </div>
  );
}
