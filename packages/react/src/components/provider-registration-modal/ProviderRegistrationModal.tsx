'use client';

import type { ProviderRegistration } from '@pollar/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, modalChrome } from '../modal-theme';
import { formLanguage } from '../requirement-form-modal/form-fields';
import {
  errorCode,
  missingFieldsOf,
  REGISTRATION_COPY,
  registrationFixOf,
  SHARED_FIELD_LABELS,
} from '../registry-check-modal/registry-copy';
import { RequirementFormModal } from '../requirement-form-modal/RequirementFormModal';
import '../shared.css';
import '../requirement-form-modal/RequirementFormModal.css';

interface ProviderRegistrationModalProps {
  /** The route whose ramp the user registers with. */
  corridorId?: string;
  /** Or the card provider. One of the two. */
  cardProviderId?: string;
  /** Position of this step over the route's steps, when known. */
  progress?: { position: number; total: number };
  onClose: () => void;
  /** Called once the user is registered with the provider. */
  onRegistered: () => void;
}

/**
 * One PROVIDER_REGISTRATION step: what the ramp provider receives, listed before the
 * user consents. Registering is the consent; nothing is sent until then.
 */
export function ProviderRegistrationModal({
  corridorId,
  cardProviderId,
  progress,
  onClose,
  onRegistered,
}: ProviderRegistrationModalProps) {
  const { getClient, styles } = usePollar();
  const client = getClient();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides, 'hero');
  const language = useMemo(formLanguage, []);
  const copy = REGISTRATION_COPY[language];
  const labels = SHARED_FIELD_LABELS[language];

  const [registration, setRegistration] = useState<Pick<ProviderRegistration, 'status' | 'ready' | 'fields'> | null>(null);
  const [termsUrl, setTermsUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The form holding answers the registration could not use: reopened to fix them, then the registration is sent again.
  const [fixForm, setFixForm] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on every mount: development mounts components twice, and the cleanup of the
    // first mount would otherwise leave this false and drop every response.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const load = cardProviderId
      ? client.getCardProviderRegistration(cardProviderId).then((loaded) => {
          setTermsUrl(loaded.termsUrl);
          return loaded;
        })
      : client.getProviderRegistration(corridorId ?? '');
    load
      .then((loaded) => {
        if (!mounted.current) return;
        if (loaded.status === 'registered') onRegistered();
        else setRegistration(loaded);
      })
      .catch(() => mounted.current && setError(copy.loadError));
    // The client instance, the copy and the callback do not change while the modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corridorId, cardProviderId]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    setFixForm(null);
    try {
      if (cardProviderId) await client.submitCardProviderRegistration(cardProviderId);
      else await client.submitProviderRegistration(corridorId ?? '');
      if (mounted.current) onRegistered();
    } catch (e) {
      if (!mounted.current) return;
      const code = errorCode(e);
      if (code === 'KYC_REGISTRATION_MISSING_DATA') {
        const fix = registrationFixOf(e);
        const named = (keys: string[]) => keys.map((key) => labels[key] ?? key).join(', ');
        const missing = missingFieldsOf(e).filter((key) => !fix.invalid.includes(key));
        setError(
          [
            fix.invalid.length ? copy.invalid.replace('{fields}', named(fix.invalid)) : null,
            missing.length ? copy.missing.replace('{fields}', named(missing)) : null,
          ]
            .filter(Boolean)
            .join(' '),
        );
        setFixForm(fix.forms[0]?.formId ?? null);
      } else if (code === 'KYC_REGISTRATION_STEPS_PENDING') setError(copy.notReady);
      else setError(copy.submitError);
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  if (fixing) {
    return (
      <RequirementFormModal
        formId={fixing}
        onClose={() => setFixing(null)}
        onSubmitted={() => {
          setFixing(null);
          void submit();
        }}
      />
    );
  }

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={onClose}>
      <div
        className="pollar-modal-card pollar-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        style={cssVars}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pollar-modal-header">
          <div className="pollar-form-header-text">
            <h2 className="pollar-modal-title">{copy.title}</h2>
            {progress && (
              <p className="pollar-form-subtitle">
                {copy.step.replace('{n}', String(progress.position)).replace('{total}', String(progress.total))}
              </p>
            )}
          </div>
          <button type="button" className="pollar-modal-close" onClick={onClose} aria-label={copy.close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && (
          <p className="pollar-form-error" role="alert">
            {error}
          </p>
        )}
        {fixForm && !submitting && (
          <div className="pollar-modal-actions">
            <button type="button" className="pollar-btn-primary" onClick={() => setFixing(fixForm)}>
              {copy.fix}
            </button>
          </div>
        )}

        {!registration && !error && (
          <div className="pollar-loading-block">
            <div className="pollar-spinner" />
          </div>
        )}

        {registration && (
          <form
            className="pollar-form-body"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {registration.ready ? (
              <>
                <p className="pollar-form-description">{copy.intro}</p>
                <ul className="pollar-form-description">
                  {registration.fields.map((key) => (
                    <li key={key}>{labels[key] ?? key}</li>
                  ))}
                </ul>
                {termsUrl && (
                  <p className="pollar-form-description">
                    <a href={termsUrl} target="_blank" rel="noreferrer">
                      {copy.terms}
                    </a>
                  </p>
                )}
                <label className="pollar-form-choice">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={submitting}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  {copy.consent}
                </label>
              </>
            ) : (
              <p className="pollar-form-error" role="status">
                {copy.notReady}
              </p>
            )}
            <div className="pollar-modal-actions">
              <button type="button" className="pollar-btn-secondary" onClick={onClose} disabled={submitting}>
                {copy.close}
              </button>
              {registration.ready && (
                <button type="submit" className="pollar-btn-primary" disabled={submitting || !consent}>
                  {submitting ? copy.submitting : copy.submit}
                </button>
              )}
            </div>
          </form>
        )}
        <PollarModalFooter />
      </div>
    </div>
  );
}
