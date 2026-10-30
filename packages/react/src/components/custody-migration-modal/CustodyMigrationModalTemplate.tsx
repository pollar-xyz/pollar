'use client';

import type { CosignCustody, CustodyMigrationState } from '@pollar/core';
import { useState } from 'react';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';

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
}

const CHAIN_NAME: Record<string, string> = { STELLAR: 'Stellar', SOLANA: 'Solana', POLYGON: 'Polygon' };
const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const SELF_CUSTODY_RISKS =
  'In a self-custody wallet only your device can sign. If you lose this device and every recovery method, nobody can recover the wallet or its funds, not the app and not Pollar. Nobody can undo or freeze a transaction you sign.';

/**
 * The move of the wallets Pollar custodies to ones the user's device signs for.
 * It cannot be put off: the app's wallets live in Turnkey now, so the only ways
 * out are moving or logging out, unless something still pending holds a
 * wallet back.
 */
export function CustodyMigrationModalTemplate(p: CustodyMigrationModalTemplateProps) {
  const cssVars = buildModalCssVars(p.theme, p.accentColor, p.styleOverrides);
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
        <h2 className="pollar-modal-title">Move your wallets to this device</h2>
      </div>
      <div className="pollar-recovery-body">
        <p className="pollar-recovery-muted">
          Until now Pollar held the keys of your wallets. This app now keeps wallets on its users&apos; devices, so they move
          here, with everything they hold.
        </p>
        <section className="pollar-recovery-section">
          <h3>What moves</h3>
          {moving.map((w) => (
            <div key={w.chain} className="pollar-recovery-item">
              <span>
                {CHAIN_NAME[w.chain] ?? w.chain} · {short(w.address)}
              </span>
              <span className="pollar-recovery-tag">{w.addressChanges ? 'New address' : 'Same address'}</span>
            </div>
          ))}
        </section>
        {changing.length > 0 && (
          <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
            Your {changing.map((w) => CHAIN_NAME[w.chain] ?? w.chain).join(' and ')} address changes: every token and the
            balance go to a new address on this device. Stop sharing the old one; anything sent there later needs help from
            support to recover.
          </div>
        )}
        {p.state.choice && (
          <section className="pollar-recovery-section">
            <h3>Choose how your wallet signs</h3>
            <label className="pollar-recovery-check">
              <input type="radio" name="custody" checked={pick === 'COSIGNED'} onChange={() => setPick('COSIGNED')} />{' '}
              Co-signed: you and the app approve every signature together, and the wallet can be recovered with help.
            </label>
            <label className="pollar-recovery-check">
              <input type="radio" name="custody" checked={pick === 'SELF_CUSTODY'} onChange={() => setPick('SELF_CUSTODY')} />{' '}
              Self-custody: only your device signs. Nobody else can move or recover your funds.
            </label>
          </section>
        )}
        {custody === 'SELF_CUSTODY' && (
          <>
            <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
              {SELF_CUSTODY_RISKS}
            </div>
            <label className="pollar-recovery-check">
              <input type="checkbox" checked={risksAccepted} onChange={(e) => setRisksAccepted(e.target.checked)} /> I
              understand and accept these risks
            </label>
          </>
        )}
        {failed && !p.error && (
          <p className="pollar-recovery-error" role="alert">
            The last attempt did not finish. What did not move is still where it was; try again.
          </p>
        )}
        {p.blockedReasons && (
          <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
            A wallet cannot move while something still uses it: {p.blockedReasons.join(', ')}. Let it finish and try again.
          </div>
        )}
        <button
          type="button"
          className="pollar-recovery-btn pollar-recovery-btn-primary"
          onClick={() => custody && p.onMove(p.state.choice ? custody : undefined)}
          disabled={!canMove}
        >
          {p.busy ? 'Moving your wallets...' : 'Move my wallets'}
        </button>
        {p.blockedReasons && (
          <button type="button" className="pollar-recovery-btn pollar-recovery-btn-quiet" onClick={p.onLater} disabled={p.busy}>
            Continue for now
          </button>
        )}
        <button type="button" className="pollar-recovery-btn pollar-recovery-btn-quiet" onClick={p.onLogout} disabled={p.busy}>
          Log out
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
