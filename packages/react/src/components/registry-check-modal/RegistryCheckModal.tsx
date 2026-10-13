'use client';

import type { RegistryCheck, RegistryCheckPrefill } from '@pollar/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, modalChrome } from '../modal-theme';
import { formLanguage } from '../requirement-form-modal/form-fields';
import { errorCode, REGISTRY_COPY } from './registry-copy';
import '../shared.css';
import '../requirement-form-modal/RequirementFormModal.css';

interface RegistryCheckModalProps {
  optionId: string;
  /** Position of this step over the route's steps, when known. */
  progress?: { position: number; total: number };
  onClose: () => void;
  /** Called once the registry confirmed the data. */
  onApproved: () => void;
}

/**
 * One REGISTRY_CHECK step (SEGIP): the user's verified data, prefilled and read-only
 * except for the surname split and the CI complement, sent to the registry on confirm.
 */
export function RegistryCheckModal({ optionId, progress, onClose, onApproved }: RegistryCheckModalProps) {
  const { getClient, styles } = usePollar();
  const client = getClient();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides, 'hero');
  const language = useMemo(formLanguage, []);
  const copy = REGISTRY_COPY[language];

  const [check, setCheck] = useState<RegistryCheck | null>(null);
  const [surname1, setSurname1] = useState('');
  const [surname2, setSurname2] = useState('');
  const [complement, setComplement] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Fields the registry did not confirm on the last check, outlined until the next try. */
  const [rejected, setRejected] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
    client
      .getRegistryCheck(optionId)
      .then((loaded) => {
        if (!mounted.current) return;
        if (loaded.status === 'approved') return onApproved();
        setCheck(loaded);
        if (loaded.status === 'pending') setReview(true);
        // A check the registry did not confirm on the surnames or the complement: say which, keep the form open.
        if (loaded.status === 'rejected') showRejected(loaded.rejectedFields);
        if (loaded.prefill.applies) {
          setSurname1(loaded.prefill.surname1);
          setSurname2(loaded.prefill.surname2 ?? '');
          setComplement(loaded.prefill.complementNumber ?? '');
        }
      })
      .catch((e: unknown) => {
        if (!mounted.current) return;
        setError(errorCode(e) === 'KYC_REGISTRY_IDENTITY_REQUIRED' ? copy.identityRequired : copy.loadError);
      });
    // The client instance and the copy do not change while the modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionId]);

  const prefill: RegistryCheckPrefill | null = check?.prefill.applies ? check.prefill : null;

  /** Say which fields the registry did not confirm and outline them; the form stays open. */
  function showRejected(fields: string[] | undefined) {
    const labels: Record<string, string> = {
      surname1: copy.surname1,
      surname2: copy.surname2,
      complementNumber: copy.complement,
    };
    const named = fields?.length ? fields : ['surname2'];
    setRejected(named);
    setError(copy.rejected.replace('{fields}', named.map((field) => labels[field] ?? field).join(', ')));
  }

  async function submit() {
    if (!prefill) return;
    setSubmitting(true);
    setError(null);
    setRejected([]);
    try {
      const result = await client.submitRegistryCheck(optionId, {
        surname1: surname1.trim(),
        ...(surname2.trim() ? { surname2: surname2.trim() } : {}),
        ...(complement.trim() ? { complementNumber: complement.trim() } : {}),
      });
      if (!mounted.current) return;
      if (result.status === 'approved') onApproved();
      else if (result.status === 'rejected') showRejected(result.rejectedFields);
      else setReview(true);
    } catch (e) {
      if (!mounted.current) return;
      const code = errorCode(e);
      // A check recorded while this screen was open (a slow answer the client gave up on) is the approval.
      if (code === 'SDK_KYC_ALREADY_APPROVED') return onApproved();
      if (code === 'KYC_REGISTRY_NAME_MISMATCH') {
        setError(copy.nameMismatch.replace('{full}', [prefill.surname1, prefill.surname2].filter(Boolean).join(' ')));
      } else if (code === 'SDK_KYC_UNDER_REVIEW') setReview(true);
      else setError(copy.submitError);
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  const readOnly = (label: string, value: string) => (
    <div className="pollar-form-field">
      <span className="pollar-form-label">{label}</span>
      <input className="pollar-input" value={value} readOnly disabled />
    </div>
  );

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

        {!check && !error && (
          <div className="pollar-loading-block">
            <div className="pollar-spinner" />
          </div>
        )}

        {check && (review || !prefill) && (
          <div className="pollar-form-body">
            <p className="pollar-form-error" role="status">
              {review ? copy.review : copy.notApplicable}
            </p>
            <div className="pollar-modal-actions">
              <button type="button" className="pollar-btn-secondary" onClick={onClose}>
                {copy.close}
              </button>
            </div>
          </div>
        )}

        {prefill && !review && (
          <form
            className="pollar-form-body"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p className="pollar-form-description">{copy.intro}</p>
            {readOnly(copy.givenNames, prefill.givenNames)}
            <div className="pollar-form-field">
              <label htmlFor="pollar-registry-surname1" className="pollar-form-label">
                {copy.surname1}
                <span className="pollar-form-required"> *</span>
              </label>
              <input
                id="pollar-registry-surname1"
                className="pollar-input"
                value={surname1}
                required
                disabled={submitting}
                aria-invalid={rejected.includes('surname1') || undefined}
                onChange={(e) => setSurname1(e.target.value)}
              />
            </div>
            <div className="pollar-form-field">
              <label htmlFor="pollar-registry-surname2" className="pollar-form-label">
                {copy.surname2}
              </label>
              <input
                id="pollar-registry-surname2"
                className="pollar-input"
                value={surname2}
                disabled={submitting}
                aria-invalid={rejected.includes('surname2') || undefined}
                onChange={(e) => setSurname2(e.target.value)}
              />
            </div>
            {readOnly(copy.birthdate, prefill.birthdate)}
            {readOnly(copy.documentNumber, prefill.documentNumber)}
            <div className="pollar-form-field">
              <label htmlFor="pollar-registry-complement" className="pollar-form-label">
                {copy.complement}
              </label>
              <input
                id="pollar-registry-complement"
                className="pollar-input"
                value={complement}
                maxLength={3}
                disabled={submitting}
                aria-invalid={rejected.includes('complementNumber') || undefined}
                onChange={(e) => setComplement(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''))}
              />
            </div>
            <div className="pollar-modal-actions">
              <button type="button" className="pollar-btn-secondary" onClick={onClose} disabled={submitting}>
                {copy.close}
              </button>
              <button type="submit" className="pollar-btn-primary" disabled={submitting || !surname1.trim()}>
                {submitting ? copy.submitting : copy.submit}
              </button>
            </div>
          </form>
        )}
        <PollarModalFooter />
      </div>
    </div>
  );
}
