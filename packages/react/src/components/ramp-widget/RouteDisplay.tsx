'use client';

import type { CosignCustody, RampQuote, RampQuoteRejection, RampQuoteRequirement, RampWalletStep } from '@pollar/core';
import { rampLegTitle, rampRequirementCopy, rampResolutionText, rampTrustlineAsset, rampWalletStep } from '@pollar/core';

const CUSTODY_LABEL: Record<CosignCustody, string> = { COSIGNED: 'co-signed', SELF_CUSTODY: 'self-custody' };

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
            ? `${quote.amountIn} ${assetOf(first.from)} → ~${quote.amountOut} ${assetOf(last.to)}`
            : `~${quote.amountOut}`}
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

/**
 * A route that was planned and dropped, and what the user can do about it: a
 * verification step opens from its button, a missing trustline is added from its own.
 */
export function RejectedRouteDisplay({
  rejection,
  disabled = false,
  trusting = false,
  walletBusy = false,
  custodyChoice = false,
  onVerify,
  onTrust,
  onWalletStep,
}: {
  rejection: RampQuoteRejection;
  /** A route is starting, a trustline or a wallet is being added, so nothing else opens meanwhile. */
  disabled?: boolean;
  /** This row's trustline is being added. */
  trusting?: boolean;
  /** The wallet step this route asks for is running. */
  walletBusy?: boolean;
  /** The app leaves the custody to the user: a wallet set up or moved here asks which. */
  custodyChoice?: boolean;
  /** Without it, a verification step is described but offers no button. */
  onVerify?: ((requirement: RampQuoteRequirement) => void) | undefined;
  /** Without it, a missing trustline is described but offers no button. */
  onTrust?: ((asset: { code: string; issuer: string }) => void) | undefined;
  /**
   * Runs the wallet step the route asks for (`rampWalletStep`: create, set up or move
   * the wallet), with the user's custody pick when `custodyChoice`. An app that leaves
   * the custody to the user creates the wallet from the wallet menu instead.
   */
  onWalletStep?: ((step: RampWalletStep, custody?: CosignCustody) => void) | undefined;
}) {
  const requirement = rejection.requirement;
  const copy = requirement ? rampRequirementCopy(requirement) : null;
  const trustAsset = !requirement && onTrust ? rampTrustlineAsset(rejection) : null;
  const step = !requirement ? rampWalletStep(rejection) : null;
  const fromMenu = step?.action === 'create_wallet' && custodyChoice;
  const walletStep = onWalletStep && !fromMenu ? step : null;
  // Only a step that creates or moves a wallet picks its custody; adding recovery does not.
  const picks: Array<CosignCustody | undefined> =
    custodyChoice && step?.action !== 'set_up_recovery' ? ['COSIGNED', 'SELF_CUSTODY'] : [undefined];
  const meta = copy
    ? copy.message
    : fromMenu
      ? 'You need a wallet to receive this. Create it from the wallet menu, then find the route again.'
      : rampResolutionText(rejection.failure);
  const busy = trusting || (!!walletStep && walletBusy);
  return (
    <div
      className="pollar-ramp-route-card"
      data-locked
      data-kyc-status={requirement?.status}
      data-disabled={(!(copy?.action && onVerify) && !trustAsset && !walletStep) || (disabled && !busy) || undefined}
    >
      <div className="pollar-ramp-route-left">
        <span className="pollar-ramp-route-provider">{rejection.legs.map((leg) => rampLegTitle(leg)).join(' · ')}</span>
        <span className="pollar-ramp-route-meta">{meta}</span>
      </div>
      {trustAsset && (
        <div className="pollar-ramp-route-right">
          <button
            type="button"
            className="pollar-btn-secondary pollar-ramp-route-verify"
            disabled={disabled}
            aria-busy={trusting}
            onClick={() => onTrust!(trustAsset)}
          >
            {trusting ? (
              <>
                <span className="pollar-spinner pollar-spinner-sm" /> Adding…
              </>
            ) : (
              `Add ${trustAsset.code} trustline`
            )}
          </button>
        </div>
      )}
      {walletStep && (
        <div className="pollar-ramp-route-right">
          {walletBusy ? (
            <button type="button" className="pollar-btn-secondary pollar-ramp-route-verify" disabled aria-busy>
              <span className="pollar-spinner pollar-spinner-sm" /> {walletStep.busyLabel}
            </button>
          ) : (
            picks.map((custody) => (
              <button
                key={custody ?? 'app'}
                type="button"
                className="pollar-btn-secondary pollar-ramp-route-verify"
                disabled={disabled}
                onClick={() => onWalletStep!(walletStep, custody)}
              >
                {custody ? `${walletStep.label} (${CUSTODY_LABEL[custody]})` : walletStep.label}
              </button>
            ))
          )}
        </div>
      )}
      {requirement && copy?.action && onVerify && (
        <div className="pollar-ramp-route-right">
          <button
            type="button"
            className="pollar-btn-secondary pollar-ramp-route-verify"
            disabled={disabled}
            onClick={() => onVerify(requirement)}
          >
            {copy.action}
          </button>
        </div>
      )}
    </div>
  );
}
