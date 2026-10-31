'use client';

import {
  type PollarLanguage,
  type CosignDevicesContent,
  isPollarApiError,
  type RecoveryState,
  transactionErrorMessage,
  cosignRefusalMessage,
} from '@pollar/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useModalLanguage } from '../../language';
import '../shared.css';
import './RecoveryModal.css';
import { modalChrome } from '../modal-theme';
import { RECOVERY_COPY } from './recovery-copy';
import { RecoveryModalTemplate, type RecoveryView } from './RecoveryModalTemplate';

interface RecoveryModalProps {
  onClose: () => void;
}

function errorText(err: unknown, language: PollarLanguage): string {
  return (
    cosignRefusalMessage(err, language) ??
    transactionErrorMessage(isPollarApiError(err) ? err.code : null, err instanceof Error ? err.message : null, language)
  );
}

/**
 * The recovery methods of a Turnkey wallet: add and remove passkeys, confirm
 * an email, approve another device, export the recovery phrase, and, on a
 * device that is not part of the wallet, get back in. Until one method exists
 * the wallet signs nothing but its own setup, so this is also where a locked
 * wallet sends the user.
 */
export function RecoveryModal({ onClose }: RecoveryModalProps) {
  const { getClient, styles, refreshRecovery, appConfig } = usePollar();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const language = useModalLanguage();
  const copy = RECOVERY_COPY[language];
  const recovery = getClient().cosign.recovery;

  const [state, setState] = useState<RecoveryState | null>(null);
  const [devices, setDevices] = useState<CosignDevicesContent | null>(null);
  const [thisDeviceKey, setThisDeviceKey] = useState<string | null>(null);
  const [view, setView] = useState<RecoveryView>('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = getClient();
    const [nextState, nextDevices, key] = await Promise.all([
      client.cosign.recovery.status(),
      client.cosign.devices(),
      client.cosign.publicKeyHex(),
    ]);
    setState(nextState);
    setDevices(nextDevices);
    setThisDeviceKey(key.toLowerCase());
    if (nextState.email.address) setEmailDraft((d) => d || nextState.email.address!);
    refreshRecovery();
  }, [getClient, refreshRecovery]);

  useEffect(() => {
    load().catch((err: unknown) => setError(errorText(err, language)));
  }, [load]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(
    () =>
      getClient().onAuthStateChange((authState) => {
        if (authState.step === 'idle') onCloseRef.current();
      }),
    [getClient],
  );

  /** Run one action with its spinner and error, then read the state again. */
  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, after?: { notice?: string; view?: RecoveryView }) => {
      setBusy(key);
      setError(null);
      setNotice(null);
      try {
        await action();
        await load();
        if (after?.notice) setNotice(after.notice);
        if (after?.view) setView(after.view);
      } catch (err) {
        setError(errorText(err, language));
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const enrolled = !!thisDeviceKey && !!devices?.devices.some((d) => d.publicKey.toLowerCase() === thisDeviceKey);

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={onClose}>
      <RecoveryModalTemplate
        theme={theme}
        accentColor={accentColor}
        styleOverrides={styleOverrides}
        state={state}
        devices={devices}
        thisDeviceKey={thisDeviceKey}
        thisDeviceEnrolled={enrolled}
        passkeyAvailable={recovery.passkeyAvailable}
        selfCustodyRisks={appConfig.application?.walletCustodyMode === 'SELF_CUSTODY' && devices?.custody === 'SELF_CUSTODY'}
        view={view}
        busy={busy}
        error={error}
        notice={notice}
        emailDraft={emailDraft}
        codeSent={codeSent}
        phrase={phrase}
        onView={(next) => {
          setError(null);
          setNotice(null);
          setCodeSent(false);
          if (next !== 'export') setPhrase(null);
          setView(next);
        }}
        onEmailDraft={setEmailDraft}
        onAddPasskey={() => void run('passkey', () => recovery.addPasskey(), { notice: copy.passkeyAdded })}
        onRemovePasskey={(id) => void run(`passkey:${id}`, () => recovery.removePasskey(id))}
        onSendEmailCode={() =>
          void run('email-send', async () => {
            await recovery.startEmail(emailDraft.trim());
            setCodeSent(true);
          })
        }
        onConfirmEmail={(code) =>
          void run('email-confirm', () => recovery.confirmEmail(code.trim()), { notice: copy.emailConfirmed, view: 'overview' })
        }
        onApproveDevice={(id) => void run(`approve:${id}`, () => recovery.approveDevice(id), { notice: copy.deviceAdded })}
        onRejectDevice={(id) => void run(`reject:${id}`, () => recovery.rejectDevice(id))}
        onRequestEnrollment={() =>
          void run('enroll', () => recovery.requestDeviceEnrollment(), {
            notice: copy.requestSent,
          })
        }
        onRecoverWithPasskey={() =>
          void run('recover-passkey', () => recovery.recoverWithPasskey(), {
            notice: copy.recovered,
          })
        }
        onSendRecoveryCode={() =>
          void run('recover-send', async () => {
            await recovery.startEmailRecovery();
            setCodeSent(true);
          })
        }
        onRecoverWithCode={(code) =>
          void run('recover-code', () => recovery.recoverWithEmailCode(code.trim()), {
            notice: copy.recovered,
            view: 'overview',
          })
        }
        onExport={() =>
          void run('export', async () => {
            setPhrase(await recovery.exportWallet());
          })
        }
        onClose={onClose}
        language={language}
      />
    </div>
  );
}
