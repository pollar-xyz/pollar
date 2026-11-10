'use client';

import { useInheritedLanguage } from '../../language-context';
import { type CosignCustody, type CustodyMigrationState, type PollarLanguage } from '@pollar/core';
import { useState } from 'react';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';
import { CUSTODY_MIGRATION_COPY } from './custody-migration-copy';

export interface CustodyMigrationModalTemplateProps {
  theme: string;
  accentColor: string;
  styleOverrides?: ModalStyleOverrides;
  state: CustodyMigrationState;
  busy: boolean;
  error: string | null;
  /** What still points at a wallet that cannot move yet (an open ramp order, a transaction in flight). */
  blockedReasons: string[] | null;
  onMove: (custody?: CosignCustody) => void;
  /** Only offered while a wallet is blocked: the move waits for what is pending. */
  onLater: () => void;
  onLogout: () => void;
  /** Language of the modal's text. Defaults to the user's device; the modal passes the resolved one. */
  language?: PollarLanguage | undefined;
}

const CHAIN_NAME: Record<string, string> = { STELLAR: 'Stellar', SOLANA: 'Solana', POLYGON: 'Polygon' };
const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

/**
 * The move of the wallets Pollar custodies to ones the user's device signs for.
 * It cannot be put off: the app's wallets live in Turnkey now, so the only ways
 * out are moving or logging out, unless something still pending holds a
 * wallet back.
 */
export function CustodyMigrationModalTemplate(p: CustodyMigrationModalTemplateProps) {
  const cssVars = buildModalCssVars(p.theme, p.accentColor, p.styleOverrides);
  const copy = CUSTODY_MIGRATION_COPY[useInheritedLanguage(p.language)];
  const [pick, setPick] = useState<CosignCustody | null>(p.state.choice ? null : p.state.toCustody);
  const [risksAccepted, setRisksAccepted] = useState(false);
  const custody = p.state.choice ? pick : p.state.toCustody;
  const canMove = !!custody && (custody !== 'SELF_CUSTODY' || risksAccepted) && !p.busy;
  const moving = p.state.wallets.filter((w) => w.required);
  const changing = moving.filter((w) => w.addressChanges);
  const failed = moving.some((w) => w.status === 'FAILED');

  return (
    <div className="pollar-modal-card pollar-recovery-modal" data-theme={p.theme} style={cssVars}>
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">{copy.title}</h2>
      </div>
      <div className="pollar-recovery-body">
        <p className="pollar-recovery-muted">{copy.intro}</p>
        <section className="pollar-recovery-section">
          <h3>{copy.whatMoves}</h3>
          {moving.map((w) => (
            <div key={w.chain} className="pollar-recovery-item">
              <span>
                {CHAIN_NAME[w.chain] ?? w.chain} · {short(w.address)}
              </span>
              <span className="pollar-recovery-tag">{w.addressChanges ? copy.newAddress : copy.sameAddress}</span>
            </div>
          ))}
        </section>
        {changing.length > 0 && (
          <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
            {copy.addressChanges(changing.map((w) => CHAIN_NAME[w.chain] ?? w.chain).join(copy.and))}
          </div>
        )}
        {p.state.choice && (
          <section className="pollar-recovery-section">
            <h3>{copy.chooseSigning}</h3>
            <label className="pollar-recovery-check">
              <input type="radio" name="custody" checked={pick === 'COSIGNED'} onChange={() => setPick('COSIGNED')} />{' '}
              {copy.cosignedOption}
            </label>
            <label className="pollar-recovery-check">
              <input type="radio" name="custody" checked={pick === 'SELF_CUSTODY'} onChange={() => setPick('SELF_CUSTODY')} />{' '}
              {copy.selfCustodyOption}
            </label>
          </section>
        )}
        {custody === 'SELF_CUSTODY' && (
          <>
            <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
              {copy.selfCustodyRisks}
            </div>
            <label className="pollar-recovery-check">
              <input type="checkbox" checked={risksAccepted} onChange={(e) => setRisksAccepted(e.target.checked)} />{' '}
              {copy.acceptRisks}
            </label>
          </>
        )}
        {failed && !p.error && (
          <p className="pollar-recovery-error" role="alert">
            {copy.lastAttemptFailed}
          </p>
        )}
        {p.blockedReasons && (
          <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
            {copy.blocked(p.blockedReasons.join(', '))}
          </div>
        )}
        <button
          type="button"
          className="pollar-recovery-btn pollar-recovery-btn-primary"
          onClick={() => custody && p.onMove(p.state.choice ? custody : undefined)}
          disabled={!canMove}
        >
          {p.busy ? copy.moving : copy.move}
        </button>
        {p.blockedReasons && (
          <button type="button" className="pollar-recovery-btn pollar-recovery-btn-quiet" onClick={p.onLater} disabled={p.busy}>
            {copy.later}
          </button>
        )}
        <button type="button" className="pollar-recovery-btn pollar-recovery-btn-quiet" onClick={p.onLogout} disabled={p.busy}>
          {copy.logout}
        </button>
        {p.error && (
          <p className="pollar-recovery-error" role="alert">
            {p.error}
          </p>
        )}
      </div>
      <PollarModalFooter />
    </div>
  );
}
