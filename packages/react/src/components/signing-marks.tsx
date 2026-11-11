'use client';

import { CHAIN_LOGOS } from '../constants';
import { AssetLogo } from './tx-review/TxReview';

/**
 * The logo next to the title: the asset the action moves with its chain in the
 * corner, or the chain alone when it moves no asset.
 */
export function TitleMark({ chain, asset }: { chain: string | undefined; asset?: string | undefined }) {
  const src = chain ? CHAIN_LOGOS[chain as keyof typeof CHAIN_LOGOS] : undefined;
  if (!asset) return src ? <img className="pollar-cosign-chain" src={src} alt="" aria-hidden /> : null;
  return (
    <span className="pollar-cosign-mark" aria-hidden>
      <AssetLogo key={asset} asset={asset} small />
      {src && <img className="pollar-cosign-mark-chain" src={src} alt="" />}
    </span>
  );
}

/** A resolved signature's mark: a check, or a cross when nothing was signed. */
export function OutcomeIcon({ ok }: { ok: boolean }) {
  return (
    <svg className="pollar-outcome-icon" width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="7" fill="currentColor" />
      {ok ? (
        <path d="M3.5 7l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m4.5 4.5 5 5m0-5-5 5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}
