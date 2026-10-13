'use client';

import type { RequirementForm, RequirementFormField } from '@pollar/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { PollarModalFooter } from '../commons';
import { buildModalCssVars, modalChrome } from '../modal-theme';
import {
  answersOf,
  COPY,
  fieldErrorMessage,
  fieldErrorsOf,
  formLanguage,
  initialValues,
  localFieldError,
  localFieldErrors,
  localized,
  type FormLanguage,
  type FormValues,
} from './form-fields';
import '../shared.css';
import './RequirementFormModal.css';

interface RequirementFormModalProps {
  formId: string;
  /** Position of this step over the route's steps, when known. */
  progress?: { position: number; total: number };
  onClose: () => void;
  /** Called once the answers are stored. */
  onSubmitted: () => void;
}

function FieldInput({
  field,
  value,
  language,
  disabled,
  onChange,
  onBlur,
}: {
  field: RequirementFormField;
  value: FormValues[string];
  language: FormLanguage;
  disabled: boolean;
  onChange: (value: FormValues[string]) => void;
  onBlur: () => void;
}) {
  const id = `pollar-form-${field.key}`;
  const text = typeof value === 'string' ? value : '';
  switch (field.type) {
    case 'select':
      return (
        <select id={id} className="pollar-input" value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="" />
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {localized(option.label, language)}
            </option>
          ))}
        </select>
      );
    case 'multiselect': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="pollar-form-choices">
          {(field.options ?? []).map((option) => (
            <label key={option.value} className="pollar-form-choice">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                disabled={disabled}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))
                }
              />
              {localized(option.label, language)}
            </label>
          ))}
        </div>
      );
    }
    case 'textarea':
      return (
        <textarea
          id={id}
          className="pollar-input pollar-form-textarea"
          value={text}
          disabled={disabled}
          maxLength={field.validation?.maxLength}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
    default:
      return (
        <input
          id={id}
          className="pollar-input"
          type={field.type === 'phone' ? 'tel' : field.type === 'text' ? 'text' : field.type}
          inputMode={field.type === 'number' ? 'decimal' : undefined}
          value={text}
          disabled={disabled}
          min={field.validation?.min}
          max={field.validation?.max}
          maxLength={field.validation?.maxLength}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
  }
}

/** One FORM requirement step: the form a route asks for, prefilled with the user's previous answers. */
export function RequirementFormModal({ formId, progress, onClose, onSubmitted }: RequirementFormModalProps) {
  const { getClient, styles } = usePollar();
  const client = getClient();
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);
  const cssVars = buildModalCssVars(theme, accentColor, styleOverrides, 'hero');
  const language = useMemo(formLanguage, []);
  const copy = COPY[language];

  const [form, setForm] = useState<RequirementForm | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
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
      .getRequirementForm(formId)
      .then((loaded) => {
        if (!mounted.current) return;
        setForm(loaded);
        setValues(initialValues(loaded.fields, loaded.answers));
      })
      .catch(() => mounted.current && setError(copy.loadError));
    // The client instance and the copy do not change while the modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  /** Show (or clear) one field's local error; an empty value keeps what the server said. */
  function recheck(field: RequirementFormField, value: FormValues[string] | undefined, onlyIfShown: boolean) {
    if (typeof value === 'string' && !value.trim()) return;
    setFieldErrors((errors) => {
      if (onlyIfShown && !(field.key in errors)) return errors;
      const next = { ...errors };
      const error = localFieldError(field, value);
      if (error) next[field.key] = error;
      else delete next[field.key];
      return next;
    });
  }

  // A field is checked when the user leaves it; once it shows an error, every keystroke rechecks it.
  function change(field: RequirementFormField, value: FormValues[string]) {
    setValues((v) => ({ ...v, [field.key]: value }));
    recheck(field, value, true);
  }

  function blur(field: RequirementFormField) {
    recheck(field, values[field.key], false);
  }

  async function submit() {
    if (!form) return;
    setError(null);
    const local = localFieldErrors(form.fields, values);
    if (Object.keys(local).length) return setFieldErrors(local);
    setSubmitting(true);
    setFieldErrors({});
    try {
      await client.submitRequirementForm(form.formId, answersOf(form.fields, values));
      if (mounted.current) onSubmitted();
    } catch (e) {
      if (!mounted.current) return;
      const byField = fieldErrorsOf(e);
      if (byField) setFieldErrors(byField);
      else setError(copy.submitError);
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={onClose}>
      <div
        className="pollar-modal-card pollar-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label={form?.name ?? copy.title}
        style={cssVars}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pollar-modal-header">
          <div className="pollar-form-header-text">
            <h2 className="pollar-modal-title">{form?.name ?? copy.title}</h2>
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

        {!form && !error && (
          <div className="pollar-loading-block">
            <div className="pollar-spinner" />
            <span>{copy.loading}</span>
          </div>
        )}

        {form && (
          <form
            className="pollar-form-body"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {form.description && <p className="pollar-form-description">{form.description}</p>}
            {form.fields.map((field) => {
              const fieldError = fieldErrors[field.key];
              const help = localized(field.help, language);
              return (
                <div key={field.key} className="pollar-form-field">
                  {field.type === 'checkbox' ? (
                    <label className="pollar-form-choice">
                      <input
                        type="checkbox"
                        checked={values[field.key] === true}
                        disabled={submitting}
                        onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.checked }))}
                      />
                      {localized(field.label, language)}
                      {field.required && <span className="pollar-form-required"> *</span>}
                    </label>
                  ) : (
                    <>
                      <label htmlFor={`pollar-form-${field.key}`} className="pollar-form-label">
                        {localized(field.label, language)}
                        {field.required && <span className="pollar-form-required"> *</span>}
                      </label>
                      <FieldInput
                        field={field}
                        value={values[field.key] ?? ''}
                        language={language}
                        disabled={submitting}
                        onChange={(value) => change(field, value)}
                        onBlur={() => blur(field)}
                      />
                    </>
                  )}
                  {help && <span className="pollar-form-help">{help}</span>}
                  {fieldError && (
                    <span className="pollar-form-field-error" role="alert">
                      {fieldErrorMessage(fieldError, language)}
                    </span>
                  )}
                </div>
              );
            })}
            <div className="pollar-modal-actions">
              <button type="button" className="pollar-btn-secondary" onClick={onClose} disabled={submitting}>
                {copy.close}
              </button>
              <button type="submit" className="pollar-btn-primary" disabled={submitting}>
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
