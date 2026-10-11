import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { RequirementForm, RequirementFormField } from '@pollar/core';
import { usePollar } from '../../context';
import { PollarModalFooter } from '../commons';
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

export interface RequirementFormModalProps {
  formId: string;
  /** Position of this step over the route's steps, when known. */
  progress?: { position: number; total: number } | undefined;
  onClose: () => void;
  /** Called once the answers are stored. */
  onSubmitted: () => void;
}

type Colors = { text: string; muted: string; border: string; itemBg: string; error: string };

function Choice({
  label,
  checked,
  disabled,
  accentColor,
  colors,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  accentColor: string;
  colors: Colors;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.choice}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
    >
      <View
        style={[
          styles.box,
          { borderColor: checked ? accentColor : colors.border, backgroundColor: checked ? accentColor : 'transparent' },
        ]}
      >
        {checked && <Text style={styles.boxMark}>✓</Text>}
      </View>
      <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function FieldInput({
  field,
  value,
  language,
  disabled,
  accentColor,
  colors,
  onChange,
  onBlur,
}: {
  field: RequirementFormField;
  value: FormValues[string];
  language: FormLanguage;
  disabled: boolean;
  accentColor: string;
  colors: Colors;
  onChange: (value: FormValues[string]) => void;
  onBlur: () => void;
}) {
  const text = typeof value === 'string' ? value : '';
  if (field.type === 'select' || field.type === 'multiselect') {
    const selected = field.type === 'multiselect' ? (Array.isArray(value) ? value : []) : text ? [text] : [];
    return (
      <View>
        {(field.options ?? []).map((option) => (
          <Choice
            key={option.value}
            label={localized(option.label, language)}
            checked={selected.includes(option.value)}
            disabled={disabled}
            accentColor={accentColor}
            colors={colors}
            onToggle={() => {
              if (field.type === 'select') onChange(option.value);
              else
                onChange(
                  selected.includes(option.value)
                    ? selected.filter((item) => item !== option.value)
                    : [...selected, option.value],
                );
            }}
          />
        ))}
      </View>
    );
  }
  return (
    <TextInput
      style={[
        styles.input,
        { borderColor: colors.border, backgroundColor: colors.itemBg, color: colors.text },
        field.type === 'textarea' && styles.textarea,
      ]}
      value={text}
      editable={!disabled}
      multiline={field.type === 'textarea'}
      maxLength={field.validation?.maxLength}
      placeholder={field.type === 'date' ? 'YYYY-MM-DD' : undefined}
      placeholderTextColor={colors.muted}
      autoCapitalize={field.type === 'email' ? 'none' : 'sentences'}
      keyboardType={
        field.type === 'number'
          ? 'decimal-pad'
          : field.type === 'email'
            ? 'email-address'
            : field.type === 'phone'
              ? 'phone-pad'
              : 'default'
      }
      onChangeText={onChange}
      onBlur={onBlur}
    />
  );
}

/** One FORM requirement step: the form a route asks for, prefilled with the user's previous answers. */
export function RequirementFormModal({ formId, progress, onClose, onSubmitted }: RequirementFormModalProps) {
  const { getClient, styles: pollarStyles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = pollarStyles;
  const client = getClient();
  const language = useMemo(formLanguage, []);
  const copy = COPY[language];
  const isDark = theme === 'dark';
  const colors: Colors = {
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#374151' : '#e5e7eb',
    itemBg: isDark ? '#262626' : '#f9fafb',
    error: isDark ? '#f87171' : '#dc2626',
  };

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
      .catch(() => {
        if (mounted.current) setError(copy.loadError);
      });
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
    <View style={styles.overlay}>
      <View style={styles.modalWrapper}>
        <View style={[styles.card, { backgroundColor: isDark ? '#1a1a1a' : '#ffffff', borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{form?.name ?? copy.title}</Text>
            {progress && (
              <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>
                {copy.step.replace('{n}', String(progress.position)).replace('{total}', String(progress.total))}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.closeBtn, { borderColor: colors.border }]}
            onPress={onClose}
            accessibilityLabel={copy.close}
          >
            <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>

          {!!error && (
            <View style={[styles.errorBox, { borderColor: colors.border, borderLeftColor: accentColor }]}>
              <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }} accessibilityRole="alert">
                {error}
              </Text>
            </View>
          )}

          {!form && !error && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={accentColor} />
              <Text style={{ color: colors.muted, marginTop: 12 }}>{copy.loading}</Text>
            </View>
          )}

          {form && (
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {!!form.description && (
                <Text style={{ color: colors.muted, fontSize: 14, marginBottom: 12 }}>{form.description}</Text>
              )}
              {form.fields.map((field) => {
                const fieldError = fieldErrors[field.key];
                const help = localized(field.help, language);
                const label = `${localized(field.label, language)}${field.required ? ' *' : ''}`;
                return (
                  <View key={field.key} style={styles.field}>
                    {field.type === 'checkbox' ? (
                      <Choice
                        label={label}
                        checked={values[field.key] === true}
                        disabled={submitting}
                        accentColor={accentColor}
                        colors={colors}
                        onToggle={() => setValues((v) => ({ ...v, [field.key]: v[field.key] !== true }))}
                      />
                    ) : (
                      <>
                        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
                        <FieldInput
                          field={field}
                          value={values[field.key] ?? ''}
                          language={language}
                          disabled={submitting}
                          accentColor={accentColor}
                          colors={colors}
                          onChange={(value) => change(field, value)}
                          onBlur={() => blur(field)}
                        />
                      </>
                    )}
                    {!!help && <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{help}</Text>}
                    {!!fieldError && (
                      <Text style={{ color: colors.error, fontSize: 12, marginTop: 4 }} accessibilityRole="alert">
                        {fieldErrorMessage(fieldError, language)}
                      </Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {form && (
            <View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: accentColor, opacity: submitting ? 0.6 : 1 }]}
                onPress={() => void submit()}
                disabled={submitting}
              >
                <Text style={styles.primaryBtnText}>{submitting ? copy.submitting : copy.submit}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={onClose}
                disabled={submitting}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>{copy.close}</Text>
              </TouchableOpacity>
            </View>
          )}
          <PollarModalFooter />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 50,
  },
  modalWrapper: { width: '100%', maxWidth: 400 },
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  header: { marginBottom: 12, marginTop: 10, paddingRight: 40 },
  title: { fontSize: 22, fontWeight: '700' },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  errorBox: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 8, padding: 12, marginBottom: 8 },
  loadingBox: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, height: 44, paddingHorizontal: 12, fontSize: 15 },
  textarea: { height: 88, paddingTop: 10, textAlignVertical: 'top' },
  choice: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  boxMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  primaryBtn: { width: '100%', height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
});
