'use client';

import type { RampQuote } from '@pollar/core';

interface RouteDisplayProps {
  quote: RampQuote;
  onSelect: (quote: RampQuote) => void;
}

const RAIL_LABELS: Record<string, string> = {
  SPEI: 'SPEI (Mexico)',
  PIX: 'PIX (Brazil)',
  PSE: 'PSE (Colombia)',
  ACH: 'ACH (US)',
};

export function RouteDisplay({ quote, onSelect }: RouteDisplayProps) {
  return (
    <div
      className="pollar-ramp-route-card"
      data-recommended={quote.recommended}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(quote)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(quote)}
    >
      <div className="pollar-ramp-route-left">
        <span className="pollar-ramp-route-provider">{quote.provider}</span>
        <span className="pollar-ramp-route-meta">
          {RAIL_LABELS[quote.rail] ?? quote.rail} · {quote.protocol} · {quote.estimatedTime}
        </span>
      </div>
      <div className="pollar-ramp-route-right">
        <span className="pollar-ramp-route-fee">
          {quote.fee}% fee
        </span>
        {quote.recommended && <span className="pollar-ramp-route-badge">Best rate</span>}
      </div>
    </div>
  );
}
