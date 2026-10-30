'use client';

import type { CosignDevicesContent, RecoveryState } from '@pollar/core';
import { useState } from 'react';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, type ModalStyleOverrides } from '../modal-theme';

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
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const shortKey = (key: string) => `${key.slice(0, 6)}...${key.slice(-4)}`;

function Button(props: {
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
      {running ? (props.busyLabel ?? 'Working...') : props.label}
    </button>
  );
}

function CodeForm(props: { busy: string | null; id: string; label: string; onSubmit: (code: string) => void }) {
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
        placeholder="Code from the email"
        autoComplete="one-time-code"
        aria-label="Code from the email"
      />
      <Button
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
    body = <p className="pollar-recovery-muted">Loading your wallet&apos;s recovery methods...</p>;
  } else if (!state.required) {
    body = (
      <p className="pollar-recovery-muted">
        This wallet doesn&apos;t need recovery methods: it isn&apos;t secured by your device.
      </p>
    );
  } else if (!p.thisDeviceEnrolled && p.view !== 'recover-email') {
    // A device the user signed in on, but whose key is not one of the wallet's credentials.
    body = (
      <>
        <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="status">
          This device isn&apos;t part of your wallet yet. Get back in with one of your recovery methods, or ask a device that
          already has the wallet to add this one.
        </div>
        {state.passkeys.length > 0 && p.passkeyAvailable && (
          <Button busy={p.busy} id="recover-passkey" label="Use a passkey" kind="primary" onClick={p.onRecoverWithPasskey} />
        )}
        {state.email.verified && (
          <Button
            busy={p.busy}
            id="recover-send"
            label={`Email a code to ${state.email.address ?? 'your email'}`}
            onClick={() => p.onView('recover-email')}
          />
        )}
        <Button busy={p.busy} id="enroll" label="Ask another device to add this one" onClick={p.onRequestEnrollment} />
      </>
    );
  } else if (risksPending && p.view === 'overview') {
    body = (
      <>
        <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
          This is a self-custody wallet: only your device can sign. If you lose this device and every recovery method, nobody
          can recover the wallet or its funds, not the app and not Pollar. Nobody can undo or freeze a transaction you sign.
        </div>
        <Button
          busy={p.busy}
          id="accept-risks"
          label="I understand and accept these risks"
          kind="primary"
          onClick={() => setRisksAccepted(true)}
        />
      </>
    );
  } else if (p.view === 'recover-email') {
    body = (
      <>
        <p className="pollar-recovery-muted">
          We&apos;ll email a code to {state.email.address}. The code goes straight to the wallet provider, encrypted on this
          device.
        </p>
        {!p.codeSent ? (
          <Button busy={p.busy} id="recover-send" label="Send code" kind="primary" onClick={p.onSendRecoveryCode} />
        ) : (
          <CodeForm busy={p.busy} id="recover-code" label="Recover" onSubmit={p.onRecoverWithCode} />
        )}
        <Button busy={p.busy} id="back" label="Back" onClick={() => p.onView('overview')} />
      </>
    );
  } else if (p.view === 'email') {
    body = (
      <>
        <p className="pollar-recovery-muted">
          Confirm an email you control. If you lose this device, a code sent there lets you add a new one. Anyone who controls
          this inbox could do the same, so use one that is well protected.
        </p>
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
              placeholder="you@example.com"
              aria-label="Email"
            />
            <Button
              busy={p.busy}
              id="email-send"
              label="Send code"
              kind="primary"
              onClick={p.onSendEmailCode}
              disabled={!p.emailDraft.trim()}
            />
          </form>
        ) : (
          <CodeForm busy={p.busy} id="email-confirm" label="Confirm" onSubmit={p.onConfirmEmail} />
        )}
        <Button busy={p.busy} id="back" label="Back" onClick={() => p.onView('overview')} />
      </>
    );
  } else if (p.view === 'export') {
    body = p.phrase ? (
      <>
        <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
          Anyone with these words controls every account in this wallet. Write them down offline and never share them.
        </div>
        <pre className="pollar-recovery-phrase">{p.phrase}</pre>
        <Button busy={p.busy} id="hide" label="Hide" kind="primary" onClick={() => p.onView('overview')} />
      </>
    ) : (
      <>
        <p className="pollar-recovery-muted">
          Your recovery phrase lets you take this wallet to another app. It is decrypted only on this device; the app and Pollar
          never see it.
        </p>
        <label className="pollar-recovery-check">
          <input type="checkbox" checked={exportAccepted} onChange={(e) => setExportAccepted(e.target.checked)} /> I understand
          that whoever sees the phrase controls the wallet
        </label>
        <Button
          busy={p.busy}
          id="export"
          label="Show recovery phrase"
          kind="danger"
          onClick={p.onExport}
          disabled={!exportAccepted}
        />
        <Button busy={p.busy} id="back" label="Back" onClick={() => p.onView('overview')} />
      </>
    );
  } else {
    const enrollments = p.devices?.enrollments ?? [];
    body = (
      <>
        {locked ? (
          <div className="pollar-recovery-banner pollar-recovery-banner-warn" role="alert">
            Your wallet is locked until you add a way to recover it. Without one, losing this device means losing the funds, and
            nobody can get them back, not the app and not Pollar. Add a passkey, a second device or your email.
          </div>
        ) : (
          <div className="pollar-recovery-banner pollar-recovery-banner-ok" role="status">
            Your wallet can be recovered if you lose this device.
          </div>
        )}

        <section className="pollar-recovery-section">
          <h3>Passkeys</h3>
          {state.passkeys.length === 0 && <p className="pollar-recovery-muted">No passkey yet.</p>}
          {state.passkeys.map((pk) => (
            <div key={pk.authenticatorId} className="pollar-recovery-item">
              <span>{pk.name}</span>
              <Button
                busy={p.busy}
                id={`passkey:${pk.authenticatorId}`}
                label="Remove"
                kind="danger"
                onClick={() => p.onRemovePasskey(pk.authenticatorId)}
                disabled={lastMethod}
              />
            </div>
          ))}
          {p.passkeyAvailable ? (
            <Button busy={p.busy} id="passkey" label="Add a passkey" onClick={p.onAddPasskey} />
          ) : (
            <p className="pollar-recovery-muted">Passkeys aren&apos;t available on this device.</p>
          )}
        </section>

        <section className="pollar-recovery-section">
          <h3>Email</h3>
          {state.email.verified ? (
            <div className="pollar-recovery-item">
              <span>{state.email.address}</span>
              <span className="pollar-recovery-tag">Confirmed</span>
            </div>
          ) : (
            <Button busy={p.busy} id="email" label="Confirm an email" onClick={() => p.onView('email')} />
          )}
        </section>

        <section className="pollar-recovery-section">
          <h3>Devices</h3>
          {(p.devices?.devices ?? []).map((d) => (
            <div key={d.id} className="pollar-recovery-item">
              <span>{d.label ?? shortKey(d.publicKey)}</span>
              {d.publicKey.toLowerCase() === p.thisDeviceKey && <span className="pollar-recovery-tag">This device</span>}
            </div>
          ))}
          {enrollments.map((e) => (
            <div key={e.id} className="pollar-recovery-item pollar-recovery-item-pending">
              <span>
                {e.label ?? 'A device'} wants to join ({shortKey(e.publicKey)})
              </span>
              <span className="pollar-recovery-actions">
                <Button
                  busy={p.busy}
                  id={`approve:${e.id}`}
                  label="Approve"
                  kind="primary"
                  onClick={() => p.onApproveDevice(e.id)}
                />
                <Button busy={p.busy} id={`reject:${e.id}`} label="Reject" onClick={() => p.onRejectDevice(e.id)} />
              </span>
            </div>
          ))}
          <p className="pollar-recovery-muted">
            To add another device, sign in there and choose &quot;Ask another device to add this one&quot;; it shows up here to
            approve. Only approve a device you are holding.
          </p>
        </section>

        <section className="pollar-recovery-section">
          <h3>Recovery phrase</h3>
          <Button busy={p.busy} id="export" label="Export recovery phrase" onClick={() => p.onView('export')} />
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
        <h2 className="pollar-modal-title">Wallet recovery</h2>
        <div className="pollar-modal-header-actions">
          <button type="button" className="pollar-modal-close" onClick={p.onClose} aria-label="Close" title="Close">
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
