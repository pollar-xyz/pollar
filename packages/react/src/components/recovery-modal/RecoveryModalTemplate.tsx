'use client';

import { useInheritedLanguage } from '../../language-context';
import { type CosignDevicesContent, type PollarLanguage, type RecoveryState } from '@pollar/core';
import { useState } from 'react';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';
import { RECOVERY_COPY } from './recovery-copy';

export type RecoveryView = 'overview' | 'email' | 'export' | 'recover-email';

export interface RecoveryModalTemplateProps {
  theme: string;
  accentColor: string;
  styleOverrides?: ModalStyleOverrides;
  /** Null while the first read is in flight. */
  state: RecoveryState | null;
  devices: CosignDevicesContent | null;
  thisDeviceKey: string | null;
  /** Whether this device's key is one of the wallet's credentials. */
  thisDeviceEnrolled: boolean;
  /** Whether the runtime can run passkey ceremonies here. */
  passkeyAvailable: boolean;
  /** A self-custody wallet of an app that never asked the user to accept its risks. */
  selfCustodyRisks: boolean;
  view: RecoveryView;
  /** The action in flight, by key, for its button's spinner. */
  busy: string | null;
  error: string | null;
  notice: string | null;
  emailDraft: string;
  codeSent: boolean;
  /** The recovery phrase, once exported. */
  phrase: string | null;
  onView: (view: RecoveryView) => void;
  onEmailDraft: (email: string) => void;
  onAddPasskey: () => void;
  onRemovePasskey: (authenticatorId: string) => void;
  onSendEmailCode: () => void;
  onConfirmEmail: (code: string) => void;
  onApproveDevice: (enrollmentId: string) => void;
  onRejectDevice: (enrollmentId: string) => void;
  onRequestEnrollment: () => void;
  onRecoverWithPasskey: () => void;
  onSendRecoveryCode: () => void;
  onRecoverWithCode: (code: string) => void;
  onExport: () => void;
  onClose: () => void;
  /** Language of the modal's text. Defaults to the user's device; the modal passes the resolved one. */
  language?: PollarLanguage | undefined;
}

type Copy = (typeof RECOVERY_COPY)['en'];

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const shortKey = (key: string) => `${key.slice(0, 6)}...${key.slice(-4)}`;

function Button(props: {
  copy: Copy;
  busy: string | null;
  id: string;
  label: string;
  busyLabel?: string;
  onClick: () => void;
  kind?: 'primary' | 'quiet' | 'danger';
  disabled?: boolean;
}) {
  const running = props.busy === props.id;
  return (
    <button
      type="button"
      className={`pollar-recovery-btn pollar-recovery-btn-${props.kind ?? 'quiet'}`}
      onClick={props.onClick}
      disabled={props.disabled || props.busy !== null}
    >
      {running ? (props.busyLabel ?? props.copy.working) : props.label}
    </button>
  );
}

function CodeForm(props: { copy: Copy; busy: string | null; id: string; label: string; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('');
  return (
    <form
      className="pollar-recovery-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) props.onSubmit(code);
      }}
    >
      <input
        className="pollar-recovery-input"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={props.copy.codePlaceholder}
        autoComplete="one-time-code"
        aria-label={props.copy.codePlaceholder}
      />
      <Button
        copy={props.copy}
        busy={props.busy}
        id={props.id}
        label={props.label}
        kind="primary"
        onClick={() => code.trim() && props.onSubmit(code)}
      />
    </form>
  );
}

export function RecoveryModalTemplate(p: RecoveryModalTemplateProps) {
  const cssVars = buildModalCssVars(p.theme, p.accentColor, p.styleOverrides);
  const copy = RECOVERY_COPY[useInheritedLanguage(p.language)];
  const [exportAccepted, setExportAccepted] = useState(false);
  const [risksAccepted, setRisksAccepted] = useState(false);
  const state = p.state;
  const locked = !!state && state.required && !state.configured;
  // An app in SELF_CUSTODY creates the wallet at login, so this is the first
  // place its user reads what self-custody means; setup waits for the accept.
  const risksPending = locked && p.selfCustodyRisks && !risksAccepted;
  const lastMethod =
    !!state && state.passkeys.length + (state.email.verified ? 1 : 0) + (state.devices.length >= 2 ? 1 : 0) <= 1;

  let body: React.ReactNode;
  if (!state) {
    body = <p className="pollar-recovery-muted">{copy.loading}</p>;
  } else if (!state.required) {
    body = <p className="pollar-recovery-muted">{copy.notRequired}</p>;
  } else if (!p.thisDeviceEnrolled && p.view !== 'recover-email') {
    // A device the user signed in on, but whose key is not one of the wallet's credentials.
    body = (
      <>
        <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="status">
          {copy.notEnrolled}
        </div>
        {state.passkeys.length > 0 && p.passkeyAvailable && (
          <Button
            copy={copy}
            busy={p.busy}
            id="recover-passkey"
            label={copy.usePasskey}
            kind="primary"
            onClick={p.onRecoverWithPasskey}
          />
        )}
        {state.email.verified && (
          <Button
            copy={copy}
            busy={p.busy}
            id="recover-send"
            label={copy.emailCodeTo(state.email.address ?? copy.yourEmail)}
            onClick={() => p.onView('recover-email')}
          />
        )}
        <Button copy={copy} busy={p.busy} id="enroll" label={copy.askAnotherDevice} onClick={p.onRequestEnrollment} />
      </>
    );
  } else if (risksPending && p.view === 'overview') {
    body = (
      <>
        <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
          {copy.selfCustodyWarning}
        </div>
        <Button
          copy={copy}
          busy={p.busy}
          id="accept-risks"
          label={copy.acceptRisks}
          kind="primary"
          onClick={() => setRisksAccepted(true)}
        />
      </>
    );
  } else if (p.view === 'recover-email') {
    body = (
      <>
        <p className="pollar-recovery-muted">{copy.recoverEmailIntro(state.email.address ?? copy.yourEmail)}</p>
        {!p.codeSent ? (
          <Button
            copy={copy}
            busy={p.busy}
            id="recover-send"
            label={copy.sendCode}
            kind="primary"
            onClick={p.onSendRecoveryCode}
          />
        ) : (
          <CodeForm copy={copy} busy={p.busy} id="recover-code" label={copy.recover} onSubmit={p.onRecoverWithCode} />
        )}
        <Button copy={copy} busy={p.busy} id="back" label={copy.back} onClick={() => p.onView('overview')} />
      </>
    );
  } else if (p.view === 'email') {
    body = (
      <>
        <p className="pollar-recovery-muted">{copy.emailIntro}</p>
        {!p.codeSent ? (
          <form
            className="pollar-recovery-row"
            onSubmit={(e) => {
              e.preventDefault();
              p.onSendEmailCode();
            }}
          >
            <input
              className="pollar-recovery-input"
              type="email"
              value={p.emailDraft}
              onChange={(e) => p.onEmailDraft(e.target.value)}
              placeholder={copy.emailPlaceholder}
              aria-label={copy.email}
            />
            <Button
              copy={copy}
              busy={p.busy}
              id="email-send"
              label={copy.sendCode}
              kind="primary"
              onClick={p.onSendEmailCode}
              disabled={!p.emailDraft.trim()}
            />
          </form>
        ) : (
          <CodeForm copy={copy} busy={p.busy} id="email-confirm" label={copy.confirm} onSubmit={p.onConfirmEmail} />
        )}
        <Button copy={copy} busy={p.busy} id="back" label={copy.back} onClick={() => p.onView('overview')} />
      </>
    );
  } else if (p.view === 'export') {
    body = p.phrase ? (
      <>
        <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
          {copy.phraseWarning}
        </div>
        <pre className="pollar-recovery-phrase">{p.phrase}</pre>
        <Button copy={copy} busy={p.busy} id="hide" label={copy.hide} kind="primary" onClick={() => p.onView('overview')} />
      </>
    ) : (
      <>
        <p className="pollar-recovery-muted">{copy.exportIntro}</p>
        <label className="pollar-recovery-check">
          <input type="checkbox" checked={exportAccepted} onChange={(e) => setExportAccepted(e.target.checked)} />{' '}
          {copy.exportAccept}
        </label>
        <Button
          copy={copy}
          busy={p.busy}
          id="export"
          label={copy.showPhrase}
          kind="danger"
          onClick={p.onExport}
          disabled={!exportAccepted}
        />
        <Button copy={copy} busy={p.busy} id="back" label={copy.back} onClick={() => p.onView('overview')} />
      </>
    );
  } else {
    const enrollments = p.devices?.enrollments ?? [];
    body = (
      <>
        {locked ? (
          <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
            {copy.locked(true)}
          </div>
        ) : (
          <div className="pollar-recovery-banner pollar-recovery-banner-ok" role="status">
            {copy.recoverable}
          </div>
        )}

        <section className="pollar-recovery-section">
          <h3>{copy.passkeys}</h3>
          {state.passkeys.length === 0 && <p className="pollar-recovery-muted">{copy.noPasskey}</p>}
          {state.passkeys.map((pk) => (
            <div key={pk.authenticatorId} className="pollar-recovery-item">
              <span>{pk.name}</span>
              <Button
                copy={copy}
                busy={p.busy}
                id={`passkey:${pk.authenticatorId}`}
                label={copy.remove}
                kind="danger"
                onClick={() => p.onRemovePasskey(pk.authenticatorId)}
                disabled={lastMethod}
              />
            </div>
          ))}
          {p.passkeyAvailable ? (
            <Button copy={copy} busy={p.busy} id="passkey" label={copy.addPasskey} onClick={p.onAddPasskey} />
          ) : (
            <p className="pollar-recovery-muted">{copy.passkeysUnavailableDevice}</p>
          )}
        </section>

        <section className="pollar-recovery-section">
          <h3>{copy.email}</h3>
          {state.email.verified ? (
            <div className="pollar-recovery-item">
              <span>{state.email.address}</span>
              <span className="pollar-recovery-tag">{copy.confirmed}</span>
            </div>
          ) : (
            <Button copy={copy} busy={p.busy} id="email" label={copy.confirmEmail} onClick={() => p.onView('email')} />
          )}
        </section>

        <section className="pollar-recovery-section">
          <h3>{copy.devices}</h3>
          {(p.devices?.devices ?? []).map((d) => (
            <div key={d.id} className="pollar-recovery-item">
              <span>{d.label ?? shortKey(d.publicKey)}</span>
              {d.publicKey.toLowerCase() === p.thisDeviceKey && <span className="pollar-recovery-tag">{copy.thisDevice}</span>}
            </div>
          ))}
          {enrollments.map((e) => (
            <div key={e.id} className="pollar-recovery-item pollar-recovery-item-pending">
              <span>{copy.wantsToJoin(e.label ?? copy.aDevice, shortKey(e.publicKey))}</span>
              <span className="pollar-recovery-actions">
                <Button
                  copy={copy}
                  busy={p.busy}
                  id={`approve:${e.id}`}
                  label={copy.approve}
                  kind="primary"
                  onClick={() => p.onApproveDevice(e.id)}
                />
                <Button
                  copy={copy}
                  busy={p.busy}
                  id={`reject:${e.id}`}
                  label={copy.reject}
                  onClick={() => p.onRejectDevice(e.id)}
                />
              </span>
            </div>
          ))}
          <p className="pollar-recovery-muted">{copy.addDeviceHelp}</p>
        </section>

        <section className="pollar-recovery-section">
          <h3>{copy.recoveryPhrase}</h3>
          <Button copy={copy} busy={p.busy} id="export" label={copy.exportPhrase} onClick={() => p.onView('export')} />
        </section>
      </>
    );
  }

  return (
    <div
      className="pollar-modal-card pollar-recovery-modal"
      data-theme={p.theme}
      style={cssVars}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pollar-modal-header">
        <h2 className="pollar-modal-title">{copy.title}</h2>
        <div className="pollar-modal-header-actions">
          <button type="button" className="pollar-modal-close" onClick={p.onClose} aria-label={copy.close} title={copy.close}>
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="pollar-recovery-body">
        {body}
        {p.notice && (
          <p className="pollar-recovery-notice" role="status">
            {p.notice}
          </p>
        )}
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
